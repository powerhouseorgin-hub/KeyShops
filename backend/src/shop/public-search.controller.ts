import { Controller, Get, Query } from '@nestjs/common';
import { ShopService } from './shop.service';
import { PromotionService } from '../promotion/promotion.service';

// PUBLIC (no auth): the pre-login mobile app's combined search overlay.
// Composes ShopService.searchPublicShops and
// PromotionService.getPublicPromotions - both already vetted to return
// only safe, non-sensitive fields - and deliberately never touches
// CustomerService, since Customer records must never be reachable from any
// public endpoint.
@Controller('public/search')
export class PublicSearchController {
  constructor(
    private readonly shopService: ShopService,
    private readonly promotionService: PromotionService,
  ) {}

  @Get()
  async search(@Query('q') q?: string) {
    const query = (q || '').trim();
    if (!query) return { shops: [], machines: [] };

    const [shopResults, machineResults] = await Promise.all([
      this.shopService.searchPublicShops({ query, limit: 10 }),
      this.promotionService.getPublicPromotions({ search: query, limit: 10 }),
    ]);

    return {
      shops: shopResults.items,
      machines: machineResults.items,
    };
  }
}
