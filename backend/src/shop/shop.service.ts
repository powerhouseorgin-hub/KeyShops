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

    // 10, not 12 - see the identical PASSWORD_HASH_COST comment in
    // AuthService for why (bcrypt cost 12 measured ~1.5-1.8s per hash on
    // this app's actual production host).
    const salt = await bcrypt.genSalt(10);
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

  // SUPER ADMIN: List Shops.
  //
  // Pagination is opt-in via `pageOpts.limit`, same additive pattern used
  // throughout this codebase - omitting it preserves the exact original
  // unpaginated flat-array behavior (no explicit orderBy either), since
  // other callers (the global header search, and a couple of "all shops for
  // a picker/lookup" consumers) rely on that shape and aren't part of the
  // Shop Management screen this pagination was added for. `search` is new
  // (this endpoint never supported it before) - the Shop Management screen's
  // search box used to filter shops.name/admin name/admin email entirely
  // client-side over the full loaded list; now that the list is paginated,
  // that filtering has to happen server-side instead to stay correct across
  // pages.
  async getShops(pageOpts: { search?: string; cursor?: string; limit?: number } = {}) {
    const { search, cursor, limit } = pageOpts;
    const include = {
      subscriptions: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
      users: {
        where: { role: Role.SHOP_ADMIN },
        select: { id: true, email: true, name: true },
      },
      ...ACTIVE_DOCUMENTS_INCLUDE,
    };
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            {
              users: {
                some: {
                  role: Role.SHOP_ADMIN,
                  OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                  ],
                },
              },
            },
          ],
        }
      : undefined;

    if (!limit) {
      return this.tenantService.prisma.shop.findMany({ where, include });
    }

    const rows = await this.tenantService.prisma.shop.findMany({
      where,
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
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

  // Shared row -> public-safe DTO mapper for searchPublicShops - only safe,
  // non-sensitive fields (no GST/financial info, no user/admin records, no
  // documents), used by both the unpaginated and cursor-paginated return paths.
  private mapPublicShop(shop: {
    id: string; name: string; themeColor: string; companyDetails: string | null;
    town: string | null;
    category: { name: string } | null;
  }) {
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
        // companyDetails wasn't valid JSON - ignore, just omit address/phone/website.
      }
    }
    return {
      id: shop.id,
      name: shop.name,
      themeColor: shop.themeColor,
      address,
      phone,
      website,
      // Town/city-level locality (e.g. "Gopichettipalayam") - real Shop.town
      // column, not parsed from companyDetails. Powers the public Shops and
      // Machines/Products tabs' location filter - see getPublicShopTowns.
      town: shop.town || null,
      category: shop.category?.name || null,
    };
  }

  // PUBLIC: Search/list shops for the public landing page's "find a shop" search,
  // the Dealers directory, and the ECM/Meter/Scanning/Key Shops category screens.
  // Deliberately unauthenticated (see PublicShopController) and therefore must only
  // ever return safe, non-sensitive fields - no GST/financial info, no user/admin
  // records, no documents. Only active shops are visible publicly.
  //
  // Pagination is opt-in, same pattern as PromotionService.getAllPromotions:
  // omitting `limit` preserves the exact original behavior (a flat array,
  // capped at 50) for callers that haven't been converted to paginate yet;
  // passing `limit` switches to cursor-based paging and returns
  // `{ items, nextCursor }` instead.
  async searchPublicShops(opts: { query?: string; category?: string; town?: string; cursor?: string; limit?: number } = {}) {
    const { query, category, town, cursor, limit } = opts;
    const whereClause: any = { isActive: true };

    // Exact match against the real Shop.town column - the dropdown is built
    // from getPublicShopTowns()'s distinct values, so this is always an
    // exact match against real data rather than a substring guess.
    if (town) {
      whereClause.town = town;
    }

    if (category) {
      const catUpper = category.trim().toUpperCase();
      if (catUpper === 'KEY_SHOPS' || catUpper === 'KEY SHOPS' || catUpper === 'KEY_SHOP') {
        whereClause.category = {
          name: { equals: 'Key Shops', mode: 'insensitive' }
        };
      } else if (catUpper === 'DEALERS' || catUpper === 'DEALER') {
        whereClause.category = {
          name: { equals: 'Dealers', mode: 'insensitive' }
        };
      } else if (catUpper === 'ECM') {
        whereClause.category = {
          name: { equals: 'ECM', mode: 'insensitive' }
        };
      } else if (catUpper === 'METER') {
        whereClause.category = {
          name: { equals: 'Meter', mode: 'insensitive' }
        };
      } else if (catUpper === 'SCANNER' || catUpper === 'SCANNING') {
        whereClause.category = {
          OR: [
            { name: { equals: 'Scanning', mode: 'insensitive' } },
            { name: { equals: 'Scanner', mode: 'insensitive' } }
          ]
        };
      }
    }

    if (query) {
      const queryFilter = {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { companyDetails: { contains: query, mode: 'insensitive' } },
          { category: { name: { contains: query, mode: 'insensitive' } } },
        ],
      };
      if (whereClause.AND) {
        whereClause.AND.push(queryFilter);
      } else {
        whereClause.AND = [queryFilter];
      }
    }

    const select = {
      id: true,
      name: true,
      themeColor: true,
      companyDetails: true,
      town: true,
      createdAt: true,
      category: { select: { name: true } },
    };

    if (!limit) {
      const shops = await this.tenantService.prisma.shop.findMany({
        where: whereClause,
        select,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return shops.map((shop) => this.mapPublicShop(shop));
    }

    // Fetch one extra row to know whether there's a next page, same approach
    // as PromotionService.getAllPromotions. `id` as the cursor field (paired
    // with `id: 'desc'` as the orderBy tiebreaker) keeps paging stable even
    // when multiple shops share the same createdAt millisecond.
    const rows = await this.tenantService.prisma.shop.findMany({
      where: whereClause,
      select,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page.map((shop) => this.mapPublicShop(shop)), nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // PUBLIC: Single shop's details for the public mobile app's shop-details
  // screen - same safe projection/mapper as searchPublicShops. Returns null
  // (controller 404s) for a missing or deactivated shop rather than throwing,
  // so a stale/guessed id just looks like "not found" to an anonymous caller.
  async getPublicShopById(id: string) {
    const shop = await this.tenantService.prisma.shop.findFirst({
      where: { id, isActive: true },
      select: {
        id: true, name: true, themeColor: true, companyDetails: true, town: true,
        createdAt: true, category: { select: { name: true } },
      },
    });
    return shop ? this.mapPublicShop(shop) : null;
  }

  // PUBLIC: Distinct list of towns with at least one active shop, for the
  // public Shops/Machines tabs' location dropdown - built from real data
  // instead of a hardcoded district list, so it stays accurate as shops
  // register in new towns and never lists a town with zero results.
  async getPublicShopTowns(): Promise<string[]> {
    const rows = await this.tenantService.prisma.shop.findMany({
      where: { isActive: true, town: { not: null } },
      select: { town: true },
      distinct: ['town'],
    });
    return rows
      .map((r) => r.town)
      .filter((t): t is string => !!t)
      .sort((a, b) => a.localeCompare(b));
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

    // `totalReferrals` comes from a separate count() rather than
    // `referrals.length` so it stays accurate once the history list below is
    // capped - a shop that keeps referring new shops for years would
    // otherwise grow this history unbounded on a screen loaded every time
    // Shop Settings opens.
    const [shop, totalReferrals, referrals] = await Promise.all([
      this.tenantService.prisma.shop.findUnique({ where: { id: shopId }, select: { referralPoints: true } }),
      this.tenantService.prisma.referral.count({ where: { referrerShopId: shopId } }),
      this.tenantService.prisma.referral.findMany({
        where: { referrerShopId: shopId },
        include: { referredShop: { select: { name: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      referralCode,
      referralPoints: shop?.referralPoints ?? 0,
      totalReferrals,
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
