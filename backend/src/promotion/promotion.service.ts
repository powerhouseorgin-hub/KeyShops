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
  async getAllPromotions(includeExpiredOffers = false) {
    const where = includeExpiredOffers
      ? undefined
      : {
          OR: [{ type: { not: 'OFFER' as const } }, { validUntil: null }, { validUntil: { gte: new Date() } }],
        };

    return this.tenantService.prisma.promotion.findMany({
      where,
      include: CREATOR_INCLUDE,
      orderBy: { createdAt: 'desc' },
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
