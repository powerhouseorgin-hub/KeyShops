import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateShopDto, UpdateShopDto, UpdateSettingsDto, ManageSubscriptionDto } from './dto/shop.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { FileService } from '../customer/file.service';
import { persistShopDocuments } from '../common/shop-document.util';
import { normalizePhone } from '../common/validators/phone';

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
  async getShops(pageOpts: { search?: string; town?: string; cursor?: string; limit?: number } = {}) {
    const { search, town, cursor, limit } = pageOpts;
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
    const andConditions: any[] = [];
    if (search) {
      andConditions.push({
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
      });
    }
    // Matches either granularity (town or district), same as the public
    // Shops/Machines directories - see ShopService.searchPublicShops.
    if (town) {
      andConditions.push({ OR: [{ town }, { district: town }] });
    }
    const where = andConditions.length === 0
      ? undefined
      : andConditions.length === 1
        ? andConditions[0]
        : { AND: andConditions };

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
  async updateShop(id: string, dto: UpdateShopDto, actorUserId: string) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');

    const updated = await this.tenantService.prisma.shop.update({
      where: { id },
      data: dto,
    });

    await this.tenantService.prisma.activityLog
      .create({
        data: {
          userId: actorUserId,
          shopId: id,
          action: 'SHOP_UPDATED',
          details: JSON.stringify({ message: `Shop "${shop.name}" details updated by Super Admin` }),
        },
      })
      .catch((err) => console.error('Failed to write SHOP_UPDATED activity log for shop', id, err));

    return updated;
  }

  // SUPER ADMIN: Toggle Shop Active/Suspend
  async setShopStatus(id: string, isActive: boolean, actorUserId: string) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');

    const updated = await this.tenantService.prisma.shop.update({
      where: { id },
      data: { isActive },
    });

    await this.tenantService.prisma.activityLog
      .create({
        data: {
          userId: actorUserId,
          shopId: id,
          action: isActive ? 'SHOP_REACTIVATED' : 'SHOP_SUSPENDED',
          details: JSON.stringify({ message: `Shop "${shop.name}" ${isActive ? 'reactivated' : 'suspended'} by Super Admin` }),
        },
      })
      .catch((err) => console.error('Failed to write SHOP_SUSPENDED/REACTIVATED activity log for shop', id, err));

    return updated;
  }

  // SUPER ADMIN: Manage Subscriptions. Always renews for a fresh one-year
  // YEARLY window starting now, with the requested status - there's only one
  // plan tier, so "managing" a subscription just means renew + set status.
  async updateSubscription(shopId: string, dto: ManageSubscriptionDto, actorUserId: string) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    // Expiring the old subscription and creating the new one must succeed or
    // fail together - a crash between the two steps used to be able to leave
    // a shop with zero ACTIVE subscriptions (old one expired, new one never
    // created), same risk pattern as createShop above.
    const subscription = await this.tenantService.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { shopId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });

      return tx.subscription.create({
        data: {
          shopId,
          plan: 'YEARLY',
          status: dto.status,
          startDate,
          endDate,
        },
      });
    });

    await this.tenantService.prisma.activityLog
      .create({
        data: {
          userId: actorUserId,
          shopId,
          action: 'SUBSCRIPTION_RENEWED',
          details: JSON.stringify({ message: `Subscription renewed for shop "${shop.name}" by Super Admin`, plan: 'YEARLY', status: dto.status, endDate }),
        },
      })
      .catch((err) => console.error('Failed to write SUBSCRIPTION_RENEWED activity log for shop', shopId, err));

    return subscription;
  }

  // Shared row -> public-safe DTO mapper for searchPublicShops - only safe,
  // non-sensitive fields (no GST/financial info, no user/admin records, no
  // documents), used by both the unpaginated and cursor-paginated return paths.
  private mapPublicShop(shop: {
    id: string; name: string; themeColor: string; companyDetails: string | null;
    town: string | null; district: string | null; logoUrl: string | null;
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
      // Town/city and district-level locality - real Shop.town/Shop.district
      // columns, not parsed from companyDetails. Powers the public Shops and
      // Machines/Products tabs' location filter (see searchPublicShops's
      // `town` param, matched against either column) and the shop card's
      // location badge.
      town: shop.town || null,
      district: shop.district || null,
      // Shop's own uploaded logo/photo (see ShopService.uploadLogo) - null
      // for most existing shops that predate this field; callers fall back
      // to a category icon when this is absent.
      logoUrl: shop.logoUrl || null,
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

    // Exact match against EITHER Shop.town or Shop.district - the dropdown
    // (frontend/src/utils/tamilNaduLocations.js) lists every Tamil Nadu
    // district and town regardless of whether a shop is registered there,
    // so `town` here may hold either granularity depending on what the
    // visitor picked; matching both columns means a district pick surfaces
    // every shop in that district while a town pick stays exact.
    if (town) {
      const locationFilter = { OR: [{ town }, { district: town }] };
      if (whereClause.AND) {
        whereClause.AND.push(locationFilter);
      } else {
        whereClause.AND = [locationFilter];
      }
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
      district: true,
      logoUrl: true,
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
        id: true, name: true, themeColor: true, companyDetails: true, town: true, district: true, logoUrl: true,
        createdAt: true, category: { select: { name: true } },
      },
    });
    return shop ? this.mapPublicShop(shop) : null;
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
    // Referral codes are simply the shop's own phone number (see
    // AuthService.registerShop's newShopReferralCode / getOrCreateReferralCode
    // above) - when the Workspace Profile phone changes, whether the Shop
    // Admin edits their own or a Super Admin edits it on their behalf, the
    // referral code needs to follow it so the shop keeps sharing the number
    // it actually shows people, not a stale one from before the edit.
    const data: Record<string, any> = { ...dto };
    if (dto.companyDetails) {
      try {
        const details = JSON.parse(dto.companyDetails);
        const newPhone = details.phone ? normalizePhone(details.phone) || details.phone : null;
        if (newPhone) {
          const current = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId }, select: { referralCode: true } });
          if (current && current.referralCode !== newPhone) {
            data.referralCode = newPhone;
          }
        }
      } catch {
        // Malformed companyDetails JSON - fall through and save the rest of
        // the update untouched, same as before this referral-sync existed.
      }
    }

    try {
      return await this.tenantService.prisma.shop.update({ where: { id: shopId }, data });
    } catch (e: any) {
      // referralCode is @unique - the new phone number could collide with
      // another shop's existing code (companyDetails.phone is free text, not
      // validated for uniqueness across shops). Retry without touching
      // referralCode so the rest of the workspace edit still saves rather
      // than failing the whole request over an unrelated field.
      if (e?.code === 'P2002' && data.referralCode) {
        const { referralCode, ...rest } = data;
        return this.tenantService.prisma.shop.update({ where: { id: shopId }, data: rest });
      }
      throw e;
    }
  }

  // SHOP ADMIN: Upload/replace the shop's logo - a single always-current
  // image (unlike ShopDocument rows below, which are versioned/verifiable
  // documents), so this just overwrites Shop.logoUrl directly rather than
  // soft-deleting a prior row. Long-lived URL via uploadLongLivedFile, same
  // pattern as PromotionService.uploadImage.
  async uploadLogo(shopId: string, file: { originalname: string; buffer: Buffer }) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    const { fileUrl } = await this.fileService.uploadLongLivedFile(file.originalname, file.buffer, shopId);

    return this.tenantService.prisma.shop.update({
      where: { id: shopId },
      data: { logoUrl: fileUrl },
    });
  }

  // SHOP ADMIN: Add/Replace a verification document (shop photo, license, owner Aadhaar, etc.)
  // Any existing active document of the same documentType for this shop is soft-deleted first,
  // so there's at most one active ShopDocument per (shopId, documentType) at a time - mirroring
  // how the registration/provisioning flows only ever store one of each document type.
  async addOrReplaceShopDocument(shopId: string, documentType: string, file: any) {
    const shop = await this.tenantService.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    // Upload first (external I/O, can't be part of a DB transaction) so a
    // failed upload never touches the existing document row. Then the
    // delete-old + create-new pair runs as one $transaction - previously
    // these were two separate calls, so a crash in between (or the create
    // failing e.g. on a DB constraint) could leave the shop with zero active
    // documents of this type even though the old one was already deleted.
    const upload = await this.fileService.uploadFile(file.originalname, file.buffer, shopId);

    return this.tenantService.prisma.$transaction(async (tx) => {
      await tx.shopDocument.deleteMany({
        where: { shopId, documentType },
      });

      return tx.shopDocument.create({
        data: {
          shopId,
          documentType,
          fileUrl: upload.fileUrl,
          fileKey: upload.fileKey,
          fileSize: file.size,
          originalName: file.originalname || null,
        },
      });
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
