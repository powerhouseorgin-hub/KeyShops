import { Controller, Get, Header } from '@nestjs/common';
import { AdService } from './ad.service';

// PUBLIC (no auth): powers the pre-login mobile app's ad carousel. Split out
// of AdController because that controller applies
// @UseGuards(JwtAuthGuard, RolesGuard) at the class level - see
// AdService.getPublicAds for the safe projection this returns.
//
// Cache-Control here is safe specifically because this is a route no
// authenticated view shares - the Super Admin's own ad management list is
// the separate /api/super/advertisements route (AdController), so caching
// this response can never make an admin's own edit look like it didn't
// take effect. Matches the service-level TtlCache TTL (see AdService) so a
// repeat request within the window skips the network entirely instead of
// still round-tripping to a cache that would've said the same thing.
@Controller('public/ads')
export class PublicAdController {
  constructor(private readonly adService: AdService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async getPublicAds() {
    return this.adService.getPublicAds();
  }

  // Route registered before any :id-style route would exist on this
  // controller (there isn't one today, but this ordering avoids ever
  // shadowing one added later) - the full-screen app-open poster.
  @Get('poster')
  @Header('Cache-Control', 'public, max-age=60')
  async getPublicAppPoster() {
    return this.adService.getPublicAppPoster();
  }
}
