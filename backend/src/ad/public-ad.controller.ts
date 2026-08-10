import { Controller, Get } from '@nestjs/common';
import { AdService } from './ad.service';

// PUBLIC (no auth): powers the pre-login mobile app's ad carousel. Split out
// of AdController because that controller applies
// @UseGuards(JwtAuthGuard, RolesGuard) at the class level - see
// AdService.getPublicAds for the safe projection this returns.
@Controller('public/ads')
export class PublicAdController {
  constructor(private readonly adService: AdService) {}

  @Get()
  async getPublicAds() {
    return this.adService.getPublicAds();
  }

  // Route registered before any :id-style route would exist on this
  // controller (there isn't one today, but this ordering avoids ever
  // shadowing one added later) - the full-screen app-open poster.
  @Get('poster')
  async getPublicAppPoster() {
    return this.adService.getPublicAppPoster();
  }
}
