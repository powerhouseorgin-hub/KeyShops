import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PromotionService } from './promotion.service';

// PUBLIC (no auth): powers the pre-login mobile app's Machines/Products
// directory. Only PromotionService.getPublicPromotions/getPublicPromotionById
// may be called from here - they're the two methods vetted to return a
// safe, non-PII projection (see their doc comments in promotion.service.ts).
@Controller('public/machines')
export class PublicPromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get()
  async list(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.promotionService.getPublicPromotions({
      category, search, cursor, shopId,
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
