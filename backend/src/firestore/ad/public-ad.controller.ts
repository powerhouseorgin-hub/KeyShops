import { Controller, Get, Header } from '@nestjs/common';
import { FirestoreAdService } from './firestore-ad.service';

@Controller('public/ads')
export class PublicAdController {
  constructor(private readonly ads: FirestoreAdService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async getPublicAds() {
    return this.ads.getPublicAds();
  }

  @Get('poster')
  @Header('Cache-Control', 'public, max-age=60')
  async getPublicAppPoster() {
    return this.ads.getPublicAppPoster();
  }
}
