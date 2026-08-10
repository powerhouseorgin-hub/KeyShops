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
}
