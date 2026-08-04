import { Controller, Get, Query } from '@nestjs/common';
import { ShopService } from './shop.service';

// Deliberately NOT behind JwtAuthGuard/RolesGuard - this powers the public
// landing page's shop search (by name or location) for anonymous visitors.
// Only ShopService.searchPublicShops() may be called from here, since it's
// the one method vetted to return safe, non-sensitive fields only.
@Controller('public/shops')
export class PublicShopController {
  constructor(private readonly shopService: ShopService) {}

  // cursor/limit are optional - see ShopService.searchPublicShops for how
  // omitting `limit` preserves the original unpaginated (top-50) behavior
  // for callers not yet converted to paginate (the public marketing site's
  // "Find a Shop" search, and the ECM/Meter/Scanning/Key Shops category
  // screens); the Dealers directory passes `limit` to page through everything.
  @Get()
  async search(
    @Query('query') query?: string,
    @Query('category') category?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shopService.searchPublicShops({ query, category, cursor, limit: limit ? Number(limit) : undefined });
  }
}
