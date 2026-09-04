import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PromotionService } from './promotion.service';

// PUBLIC (no auth): powers the pre-login mobile app's Machines/Products
// directory. Only PromotionService.getPublicPromotions/getPublicPromotionById
// may be called from here - they're the two methods vetted to return a
// safe, non-PII projection (see their doc comments in promotion.service.ts).
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('public/machines')
export class PublicPromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  // HTTP-cacheable at any query-string combination - see
  // PublicShopController.search's identical comment for why a free-text
  // `search` value is fine to cache too (the browser keys by full URL).
  // Matches PromotionService.getPublicPromotions's own TTL for its cached
  // (non-search) branch.
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async list(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('town') town?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.promotionService.getPublicPromotions({
      category, search, town, cursor, shopId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const promotion = await this.promotionService.getPublicPromotionById(id);
    if (!promotion) throw new NotFoundException('Listing not found');
    return promotion;
  }
}
