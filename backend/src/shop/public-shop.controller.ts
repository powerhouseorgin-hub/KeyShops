import { Controller, Get, Query } from '@nestjs/common';
import { ShopService } from './shop.service';

// Deliberately NOT behind JwtAuthGuard/RolesGuard - this powers the public
// landing page's shop search (by name or location) for anonymous visitors.
// Only ShopService.searchPublicShops() may be called from here, since it's
// the one method vetted to return safe, non-sensitive fields only.
@Controller('public/shops')
export class PublicShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  async search(@Query('query') query?: string, @Query('category') category?: string) {
    return this.shopService.searchPublicShops(query, category);
  }
}
