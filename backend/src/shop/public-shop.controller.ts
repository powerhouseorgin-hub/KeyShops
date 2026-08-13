import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ShopService } from './shop.service';
import { PromotionService } from '../promotion/promotion.service';

// Deliberately NOT behind JwtAuthGuard/RolesGuard - this powers the public
// landing page's shop search (by name or location) for anonymous visitors,
// plus the pre-login mobile app's shop-details screen. Only
// ShopService.searchPublicShops()/getPublicShopById() and
// PromotionService.getPublicPromotions() may be called from here, since
// those are the methods vetted to return safe, non-sensitive fields only.
@Controller('public/shops')
export class PublicShopController {
  constructor(
    private readonly shopService: ShopService,
    private readonly promotionService: PromotionService,
  ) {}

  // cursor/limit are optional - see ShopService.searchPublicShops for how
  // omitting `limit` preserves the original unpaginated (top-50) behavior
  // for callers not yet converted to paginate (the public marketing site's
  // "Find a Shop" search, and the ECM/Meter/Scanning/Key Shops category
  // screens); the Dealers directory passes `limit` to page through everything.
  @Get()
  async search(
    @Query('query') query?: string,
    @Query('category') category?: string,
    @Query('town') town?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shopService.searchPublicShops({ query, category, town, cursor, limit: limit ? Number(limit) : undefined });
  }

  // Distinct town list for the Shops/Machines tabs' location dropdown - must
  // be declared before the `:id` route below, or NestJS would match "towns"
  // as an :id param instead of this static segment.
  @Get('towns')
  async getTowns() {
    return this.shopService.getPublicShopTowns();
  }

  // Declared after the bare GET above - a static path segment would
  // otherwise never be reachable here anyway since there is none, but kept
  // in this order for consistency with the rest of the codebase's
  // static-before-:id route convention.
  @Get(':id')
  async getById(@Param('id') id: string) {
    const shop = await this.shopService.getPublicShopById(id);
    if (!shop) throw new NotFoundException('Shop not found');
    const products = await this.promotionService.getPublicPromotions({ shopId: id, limit: 20 });
    return { ...shop, products: products.items };
  }
}
