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

      // 3. Create Subscription - single YEARLY plan platform-wide, one year from creation.
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      await tx.subscription.create({
        data: {
          shopId: shop.id,
          plan: 'YEARLY',
          status: 'ACTIVE',
          startDate,
          endDate,
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

  // SUPER ADMIN: Manage Subscriptions. Always renews for a fresh one-year
  // YEARLY window starting now, with the requested status - there's only one
  // plan tier, so "managing" a subscription just means renew + set status.
  async updateSubscription(shopId: string, dto: ManageSubscriptionDto) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    // End current active subscriptions
    await this.tenantService.prisma.subscription.updateMany({
      where: { shopId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    // Create new subscription record
    return this.tenantService.prisma.subscription.create({
      data: {
        shopId,
        plan: 'YEARLY',
        status: dto.status,
        startDate,
        endDate,
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
      let website: string | null = null;
      if (shop.companyDetails) {
        try {
          const details = JSON.parse(shop.companyDetails);
          address = details.address || null;
          phone = details.phone || null;
          website = details.website || null;
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
        website,
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

  // SHOP ADMIN: Get or lazily generate this shop's shareable referral code -
  // which is simply the shop admin's own registered mobile number, matching
  // AuthService.registerShop's newShopReferralCode for shops created going
  // forward. This fallback exists only for shops created before referral
  // codes existed at all (referralCode still null on their row).
  async getOrCreateReferralCode(shopId: string): Promise<string> {
    const shop = await this.tenantService.prisma.shop.findUnique({
      where: { id: shopId },
      include: { users: { where: { role: Role.SHOP_ADMIN }, take: 1, select: { phone: true } } },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    if (shop.referralCode) return shop.referralCode;

    const phone = shop.users[0]?.phone;
    if (!phone) throw new BadRequestException('No admin phone number found for this shop');

    const updated = await this.tenantService.prisma.shop.update({
      where: { id: shopId },
      data: { referralCode: phone },
    });
    return updated.referralCode!;
  }

  // SHOP ADMIN: Referral & Rewards overview for Shop Settings - the code
  // (auto-generated if this is a pre-existing shop that predates
  // AuthService.registerShop generating one at signup), the running points
  // balance, and the full history of shops referred so far. Points and
  // history come from the Referral ledger (see AuthService.registerShop),
  // never recomputed here - this is a read-only view of that ledger.
  async getReferralOverview(shopId: string) {
    const referralCode = await this.getOrCreateReferralCode(shopId);

    const [shop, referrals] = await Promise.all([
      this.tenantService.prisma.shop.findUnique({ where: { id: shopId }, select: { referralPoints: true } }),
      this.tenantService.prisma.referral.findMany({
        where: { referrerShopId: shopId },
        include: { referredShop: { select: { name: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      referralCode,
      referralPoints: shop?.referralPoints ?? 0,
      totalReferrals: referrals.length,
      history: referrals.map((r) => ({
        shopName: r.referredShop.name,
        registeredAt: r.referredShop.createdAt,
        pointsEarned: r.pointsAwarded,
      })),
    };
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
