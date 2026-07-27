import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateShopDto, UpdateShopDto, UpdateSettingsDto, ManageSubscriptionDto } from './dto/shop.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { FileService } from '../customer/file.service';
import { persistShopDocuments } from '../common/shop-document.util';

// Shared `include` clause for pulling a shop's active (non-soft-deleted) documents.
// Nested `include`/`select` relations are NOT covered by TenantService's soft-delete
// query extension (it only intercepts the top-level model operation), so the
// `deletedAt: null` filter has to be applied explicitly here.
const ACTIVE_DOCUMENTS_INCLUDE = {
  documents: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class ShopService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly fileService: FileService,
  ) {}

  // SUPER ADMIN: Create Shop
  async createShop(dto: CreateShopDto) {
    // Validate if user email is unique
    const existingUser = await this.tenantService.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });
    if (existingUser) {
      throw new BadRequestException('Email address already registered to another user');
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(dto.adminPassword || 'shoppassword', salt);

    // Run in transaction to guarantee consistency
    return this.tenantService.prisma.$transaction(async (tx) => {
      // 1. Create Shop
      const shop = await tx.shop.create({
        data: {
          name: dto.name,
          companyDetails: dto.companyDetails,
          themeColor: dto.themeColor || '#9C27B0',
        },
      });

      // 1b. Persist uploaded documents (shop photo, shop license, owner Aadhaar)
      // as ShopDocument rows instead of embedding base64 in companyDetails.
      await persistShopDocuments(this.fileService, tx, shop.id, {
        shopPhoto: dto.shopPhoto,
        shopLicense: dto.shopLicense,
        ownerAadhaar: dto.ownerAadhaar,
      });

      // 2. Create Shop Admin User
      await tx.user.create({
        data: {
          email: dto.adminEmail,
          name: dto.adminName,
          passwordHash,
          role: Role.SHOP_ADMIN,
          shopId: shop.id,
        },
      });

      // 3. Create Subscription
      await tx.subscription.create({
        data: {
          shopId: shop.id,
          plan: dto.plan,
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: new Date(dto.endDate),
        },
      });

      return shop;
    });
  }

  // SUPER ADMIN: List Shops
  async getShops() {
    return this.tenantService.prisma.shop.findMany({
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        users: {
          where: { role: Role.SHOP_ADMIN },
          select: { id: true, email: true, name: true },
        },
        ...ACTIVE_DOCUMENTS_INCLUDE,
      },
    });
  }

  // SUPER ADMIN: Get Shop details
  async getShopById(id: string) {
    const shop = await this.tenantService.prisma.shop.findUnique({
      where: { id },
      include: {
        subscriptions: true,
        users: {
          where: { role: Role.SHOP_ADMIN },
          select: { id: true, email: true, name: true },
        },
        ...ACTIVE_DOCUMENTS_INCLUDE,
      },
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return shop;
  }

  // SUPER ADMIN: Update Shop details
  async updateShop(id: string, dto: UpdateShopDto) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');

    return this.tenantService.prisma.shop.update({
      where: { id },
      data: dto,
    });
  }

  // SUPER ADMIN: Toggle Shop Active/Suspend
  async setShopStatus(id: string, isActive: boolean) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');

    return this.tenantService.prisma.shop.update({
      where: { id },
      data: { isActive },
    });
  }

  // SUPER ADMIN: Manage Subscriptions
  async updateSubscription(shopId: string, dto: ManageSubscriptionDto) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    // End current active subscriptions
    await this.tenantService.prisma.subscription.updateMany({
      where: { shopId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });

    // Create new subscription record
    return this.tenantService.prisma.subscription.create({
      data: {
        shopId,
        plan: dto.plan,
        status: dto.status,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }

  // PUBLIC: Search/list shops for the public landing page's "find a shop" search.
  // Deliberately unauthenticated (see PublicShopController) and therefore must only
  // ever return safe, non-sensitive fields - no GST/financial info, no user/admin
  // records, no documents. Only active shops are visible publicly.
  async searchPublicShops(query?: string) {
    const whereClause: any = { isActive: true };

    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        // companyDetails is a JSON-encoded string ({ address, phone, gst, ... }) -
        // `contains` on the raw string still matches free-text address searches
        // (e.g. a city or locality name) since the address value is embedded as
        // plain text within it.
        { companyDetails: { contains: query, mode: 'insensitive' } },
        // Shop Category/Type (e.g. "Dealers"), matched by category name.
        { category: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const shops = await this.tenantService.prisma.shop.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        themeColor: true,
        companyDetails: true,
        createdAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return shops.map((shop) => {
      let address: string | null = null;
      let phone: string | null = null;
      if (shop.companyDetails) {
        try {
          const details = JSON.parse(shop.companyDetails);
          address = details.address || null;
          phone = details.phone || null;
        } catch {
          // companyDetails wasn't valid JSON - ignore, just omit address/phone.
        }
      }
      return {
        id: shop.id,
        name: shop.name,
        themeColor: shop.themeColor,
        address,
        phone,
        category: shop.category?.name || null,
      };
    });
  }

  // SHOP ADMIN: Get Settings
  async getSettings(shopId: string) {
    const shop = await this.tenantService.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        ...ACTIVE_DOCUMENTS_INCLUDE,
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  // SHOP ADMIN: Update Settings
  async updateSettings(shopId: string, dto: UpdateSettingsDto) {
    return this.tenantService.prisma.shop.update({
      where: { id: shopId },
      data: dto,
    });
  }

  // SHOP ADMIN: Add/Replace a verification document (shop photo, license, owner Aadhaar, etc.)
  // Any existing active document of the same documentType for this shop is soft-deleted first,
  // so there's at most one active ShopDocument per (shopId, documentType) at a time - mirroring
  // how the registration/provisioning flows only ever store one of each document type.
  async addOrReplaceShopDocument(shopId: string, documentType: string, file: any) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    await this.tenantService.prisma.shopDocument.deleteMany({
      where: { shopId, documentType },
    });

    const upload = await this.fileService.uploadFile(file.originalname, file.buffer, shopId);

    return this.tenantService.prisma.shopDocument.create({
      data: {
        shopId,
        documentType,
        fileUrl: upload.fileUrl,
        fileKey: upload.fileKey,
        fileSize: file.size,
        originalName: file.originalname || null,
      },
    });
  }

  // SHOP ADMIN: Get or lazily generate this shop's shareable referral code.
  // Idempotent - repeated taps of the "Refer" button return the same code
  // rather than minting a new one each time.
  async getOrCreateReferralCode(shopId: string): Promise<string> {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    if (shop.referralCode) return shop.referralCode;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I characters
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
      try {
        const updated = await this.tenantService.prisma.shop.update({
          where: { id: shopId },
          data: { referralCode: code },
        });
        return updated.referralCode!;
      } catch (err) {
        if (err.code === 'P2002') continue; // unique clash - retry with a new code
        throw err;
      }
    }
    throw new BadRequestException('Failed to generate a unique referral code, please try again');
  }

  // SHOP ADMIN: Remove a verification document
  async deleteShopDocument(shopId: string, documentId: string) {
    const doc = await this.tenantService.prisma.shopDocument.findFirst({
      where: { id: documentId, shopId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // NOTE: physical file is intentionally retained on soft delete - see the
    // same rationale documented in CustomerService.deleteCustomerDocument().
    await this.tenantService.prisma.shopDocument.delete({ where: { id: documentId } });

    return { success: true };
  }
}
