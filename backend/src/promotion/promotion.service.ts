import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

// Shared include shape so every response (list/create/update) surfaces the
// creator-identification fields required by the feature spec: shop name,
// shop admin (creator) name, in addition to the raw shopId/createdById FKs.
// Also surfaces the linked product/ad title for OFFER listings.
const CREATOR_INCLUDE = {
  shop: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  linkedPromotion: { select: { id: true, title: true, type: true } },
};

@Injectable()
export class PromotionService {
  constructor(private readonly tenantService: TenantService) {}

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
    const { includeExpiredOffers = false, cursor, limit, category, search, type, excludeOffers, ownerShopId, ownerUserId } = opts;

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
    if (search) {
      andConditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { productType: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    const where = andConditions.length === 0
      ? undefined
      : andConditions.length === 1
        ? andConditions[0]
        : { AND: andConditions };

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
