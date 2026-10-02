import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FirestoreShopService } from './firestore-shop.service';
import { FirestorePromotionService } from '../promotion/firestore-promotion.service';

// PUBLIC (no auth): the landing page's shop search and the pre-login
// mobile app's shop-details screen. Only
// FirestoreShopService.searchPublicShops/getPublicShopById and
// FirestorePromotionService.getPublicPromotions may be called from here -
// see their own doc comments for why those are the safe, non-sensitive
// projections.
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('public/shops')
export class PublicShopController {
  constructor(
    private readonly shopService: FirestoreShopService,
    private readonly promotions: FirestorePromotionService,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async search(
    @Query('query') query?: string,
    @Query('category') category?: string,
    @Query('town') town?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shopService.searchPublicShops({ query, category, town, cursor, limit: limit ? Number(limit) : undefined });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const shop = await this.shopService.getPublicShopById(id);
    if (!shop) throw new NotFoundException('Shop not found');
    const products = await this.promotions.getPublicPromotions({ shopId: id, limit: 20 });
    return { ...shop, products: (products as any).items };
  }
}

// PUBLIC (no auth): the pre-login app's combined search overlay. Deliberately only calls the
// two vetted public projections above and never touches customer data.
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('public/search')
export class PublicSearchController {
  constructor(
    private readonly shopService: FirestoreShopService,
    private readonly promotions: FirestorePromotionService,
  ) {}

  @Get()
  async search(@Query('q') q?: string) {
    const query = (q || '').trim();
    if (!query) return { shops: [], machines: [] };
    const [shops, machines] = await Promise.all([
      this.shopService.searchPublicShops({ query, limit: 10 }),
      this.promotions.getPublicPromotions({ search: query, limit: 10 }),
    ]);
    return { shops: (shops as any).items, machines: (machines as any).items };
  }
}
