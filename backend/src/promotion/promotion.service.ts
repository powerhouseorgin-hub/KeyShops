import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { FileService } from '../customer/file.service';

// Shared include shape so every response (list/create/update) surfaces the
// creator-identification fields required by the feature spec: shop name,
// shop admin (creator) name, in addition to the raw shopId/createdById FKs.
// Also surfaces the linked product/ad title for OFFER listings.
const CREATOR_INCLUDE = {
  shop: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  linkedPromotion: { select: { id: true, title: true, type: true } },
};

// Explicit allowlist for the public Machines/Products directory - deliberately
// a `select` (not the authenticated CREATOR_INCLUDE above) so no internal FK
// noise (createdById, deletedAt) or PII (createdBy.email) can leak just
// because a new scalar column gets added to Promotion later.
const PUBLIC_PROMOTION_SELECT = {
  id: true, type: true, title: true, description: true, imageUrl: true,
  price: true, productType: true, phone: true, createdAt: true,
  shop: { select: { id: true, name: true } },
};

@Injectable()
export class PromotionService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly fileService: FileService,
  ) {}

  // Uploads a listing photo to real file storage and returns a long-lived
  // URL - see FileService.uploadLongLivedFile. Deliberately a standalone
  // upload step (not part of createPromotion/updatePromotion) so the image
  // never has to pass through the JSON create/update body as base64 - that
  // was the root cause of the Machines feed shipping ~47MB of embedded
  // photos per page load (see the "why is Used Machines slow" investigation).
  // shopId is null for a Super-Admin-created product, matching
  // createPromotion's own null-shopId convention.
  async uploadImage(shopId: string | null, file: { originalname: string; buffer: Buffer }) {
    const { fileUrl } = await this.fileService.uploadLongLivedFile(file.originalname, file.buffer, shopId || 'platform');
    return { url: fileUrl };
  }

  // Cross-shop feed: every shop (and Super Admin) sees every shop's listings.
  // Promotion is intentionally NOT in TENANT_SCOPED_MODELS (see tenant.service.ts),
  // so this read is never auto-narrowed to the caller's own shop.
  //
  // By default, OFFER listings whose validUntil has passed are excluded (the
  // public/shared feed only shows "active" offers per the feature spec).
  // Pass includeExpiredOffers=true for admin moderation screens that need to
  // see/manage every offer regardless of expiry.
  //
  // Pagination is opt-in: passing `limit` switches to cursor-based paging
  // (ORDER BY createdAt DESC, backed by the createdAt index added alongside
  // this - see schema.prisma) and returns `{ items, nextCursor }` instead of
  // a flat array, so the Machines/Inventory feed can load 20 at a time
  // instead of the whole table. Existing callers that don't pass `limit`
  // (the global header search, and the offer-linking dropdown's "everything"
  // lookup) are completely unaffected - they keep getting the full flat
  // array exactly as before.
  // Shared by getAllPromotions (authenticated cross-shop feed) and
  // getPublicPromotions (anonymous machines directory) so the same
  // search/category/pagination filter logic isn't duplicated - only the
  // `include` shape and forced `type` differ between the two callers.
  private buildPromotionWhere(opts: {
    includeExpiredOffers?: boolean;
    category?: string;
    search?: string;
    type?: 'PRODUCT' | 'AD' | 'OFFER';
    excludeOffers?: boolean;
    ownerShopId?: string | null;
    ownerUserId?: string;
    shopId?: string;
  }) {
    const { includeExpiredOffers = false, category, search, type, excludeOffers, ownerShopId, ownerUserId, shopId } = opts;

    const andConditions: any[] = [];
    if (!includeExpiredOffers) {
      andConditions.push({ OR: [{ type: { not: 'OFFER' as const } }, { validUntil: null }, { validUntil: { gte: new Date() } }] });
    }
    if (category) {
      andConditions.push({ productType: category });
    }
    if (type) {
      andConditions.push({ type });
    }
    if (excludeOffers) {
      andConditions.push({ type: { not: 'OFFER' as const } });
    }
    if (ownerUserId !== undefined) {
      andConditions.push(ownerShopId ? { shopId: ownerShopId } : { shopId: null, createdById: ownerUserId });
    }
    if (shopId !== undefined) {
      andConditions.push({ shopId });
    }
    if (search) {
      andConditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { productType: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    return andConditions.length === 0
      ? undefined
      : andConditions.length === 1
        ? andConditions[0]
        : { AND: andConditions };
  }

  async getAllPromotions(opts: {
    includeExpiredOffers?: boolean;
    cursor?: string;
    limit?: number;
    category?: string;
    search?: string;
    type?: 'PRODUCT' | 'AD' | 'OFFER';
    excludeOffers?: boolean;
    // Resolved server-side from the caller's JWT (see PromotionController) -
    // never accepted as a raw client-suppliable shopId, so this can only ever
    // scope a query to the requester's own shop (or, for a Super Admin with
    // no shop, their own createdById), never anyone else's.
    ownerShopId?: string | null;
    ownerUserId?: string;
  } = {}) {
    const { cursor, limit } = opts;
    const where = this.buildPromotionWhere(opts);

    if (!limit) {
      return this.tenantService.prisma.promotion.findMany({
        where,
        include: CREATOR_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }

    // Fetch one extra row to know whether there's a next page without a
    // separate count query. `id` as the cursor field (paired with `id: 'desc'`
    // as the orderBy tiebreaker) keeps paging stable even when multiple rows
    // share the same createdAt millisecond.
    const rows = await this.tenantService.prisma.promotion.findMany({
      where,
      include: CREATOR_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  // PUBLIC: the pre-login mobile app's "Machines/Products" directory.
  // Always forced to type PRODUCT (Ads have their own carousel, Offers are a
  // separate authenticated-shop-admin concept) and always non-expired
  // (includeExpiredOffers/excludeOffers are irrelevant once type is fixed to
  // PRODUCT). Uses a deliberately narrow include - just the shop's id/name -
  // dropping `createdBy` entirely, since CREATOR_INCLUDE's `createdBy.email`
  // is a Shop Admin's personal email address that must never reach an
  // anonymous caller.
  async getPublicPromotions(opts: { category?: string; search?: string; cursor?: string; limit?: number; shopId?: string } = {}) {
    const { cursor, limit, ...rest } = opts;
    const where = this.buildPromotionWhere({ ...rest, type: 'PRODUCT' });

    if (!limit) {
      return this.tenantService.prisma.promotion.findMany({
        where,
        select: PUBLIC_PROMOTION_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    const rows = await this.tenantService.prisma.promotion.findMany({
      where,
      select: PUBLIC_PROMOTION_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  // PUBLIC: single listing for the machine/product details screen. Same
  // safe select as getPublicPromotions; returns null (controller 404s) for
  // a missing/soft-deleted listing or one that isn't type PRODUCT.
  async getPublicPromotionById(id: string) {
    return this.tenantService.prisma.promotion.findFirst({
      where: { id, type: 'PRODUCT', deletedAt: null },
      select: PUBLIC_PROMOTION_SELECT,
    });
  }

  // Create a listing. shopId is null for a Super-Admin-created product, which
  // makes it independent of every shop's inventory (see schema comment on
  // Promotion.shopId); otherwise it's the creating Shop Admin's own shop.
  async createPromotion(shopId: string | null, userId: string, dto: CreatePromotionDto) {
    return this.tenantService.prisma.promotion.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        price: dto.price,
        discountPercentage: dto.discountPercentage,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        linkedPromotionId: dto.linkedPromotionId,
        productType: dto.productType,
        phone: dto.phone,
        shopId,
        createdById: userId,
      },
      include: CREATOR_INCLUDE,
    });
  }

  // SHOP ADMIN: update a listing - only if it belongs to the caller's own shop.
  async updatePromotionAsShop(id: string, shopId: string, dto: UpdatePromotionDto) {
    const existing = await this.tenantService.prisma.promotion.findFirst({ where: { id, shopId } });
    if (!existing) throw new NotFoundException('Promotion not found');

    return this.tenantService.prisma.promotion.update({
      where: { id },
      data: this.buildUpdateData(dto),
      include: CREATOR_INCLUDE,
    });
  }

  // SHOP ADMIN: delete a listing - only if it belongs to the caller's own shop.
  async deletePromotionAsShop(id: string, shopId: string) {
    const existing = await this.tenantService.prisma.promotion.findFirst({ where: { id, shopId } });
    if (!existing) throw new NotFoundException('Promotion not found');

    await this.tenantService.prisma.promotion.delete({ where: { id } });
    return { success: true };
  }

  // SUPER ADMIN: update a listing - only if the Super Admin themselves created it.
  // Mirrors updatePromotionAsShop's ownership check (createdById instead of shopId):
  // a Super Admin moderates their own products, not every shop's listings.
  async updatePromotionAsSuperAdmin(id: string, userId: string, dto: UpdatePromotionDto) {
    const existing = await this.tenantService.prisma.promotion.findFirst({ where: { id, createdById: userId } });
    if (!existing) throw new NotFoundException('Promotion not found');

    return this.tenantService.prisma.promotion.update({
      where: { id },
      data: this.buildUpdateData(dto),
      include: CREATOR_INCLUDE,
    });
  }

  // SUPER ADMIN: delete a listing - only if the Super Admin themselves created it.
  async deletePromotionAsSuperAdmin(id: string, userId: string) {
    const existing = await this.tenantService.prisma.promotion.findFirst({ where: { id, createdById: userId } });
    if (!existing) throw new NotFoundException('Promotion not found');

    await this.tenantService.prisma.promotion.delete({ where: { id } });
    return { success: true };
  }

  // Shared update-payload builder: converts the DTO's ISO validUntil string
  // into a real Date (mirrors AdService.updateAd's startDate/endDate handling)
  // and leaves every other already-scalar field untouched.
  private buildUpdateData(dto: UpdatePromotionDto) {
    const data: any = { ...dto };
    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    }
    return data;
  }
}
