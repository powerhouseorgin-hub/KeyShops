import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateAdDto, UpdateAdDto } from './dto/ad.dto';
import { FileService } from '../customer/file.service';
import { TtlCache } from '../common/ttl-cache';

const PUBLIC_ADS_CACHE_KEY = 'all';
const APP_POSTER_CACHE_KEY = 'current';
// Short TTL, unlike the 5-min lookup-table caches elsewhere: this result set
// can also change purely from time passing (an ad's startDate/endDate window
// opening or closing), not just from an admin mutation - a short TTL bounds
// how stale an expiring/starting ad can be, on top of the immediate
// invalidation below on every actual create/update/delete.
const PUBLIC_ADS_CACHE_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class AdService {
  private publicAdsCache = new TtlCache();
  private appPosterCache = new TtlCache();

  constructor(
    private readonly tenantService: TenantService,
    private readonly fileService: FileService,
  ) {}

  // Uploads a banner image to real file storage and returns a long-lived
  // URL - see FileService.uploadLongLivedFile and the identical rationale
  // in PromotionService.uploadImage (this had the same base64-in-the-
  // database bug as listing photos).
  async uploadImage(file: { originalname: string; buffer: Buffer }) {
    const { fileUrl } = await this.fileService.uploadLongLivedFile(file.originalname, file.buffer, 'ads');
    return { url: fileUrl };
  }

  // Invalidates both public ad caches - called from every mutation below,
  // since any of them (a new BANNER, an edited APP_POSTER's dates, a
  // deleted ad) can change either endpoint's result.
  private invalidatePublicAdCaches() {
    this.publicAdsCache.invalidate(PUBLIC_ADS_CACHE_KEY);
    this.appPosterCache.invalidate(APP_POSTER_CACHE_KEY);
  }

  // SUPER ADMIN: Create Ad
  async createAd(dto: CreateAdDto) {
    this.invalidatePublicAdCaches();
    return this.tenantService.prisma.advertisement.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        priority: dto.priority || 0,
        targetAll: dto.targetAll ?? true,
        targetShops: dto.targetShops || [],
      },
    });
  }

  // SUPER ADMIN: Update Ad
  async updateAd(id: string, dto: UpdateAdDto) {
    const existing = await this.tenantService.prisma.advertisement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ad not found');

    const updateData: any = { ...dto };
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate) updateData.endDate = new Date(dto.endDate);

    this.invalidatePublicAdCaches();
    return this.tenantService.prisma.advertisement.update({
      where: { id },
      data: updateData,
    });
  }

  // SUPER ADMIN: Delete Ad
  async deleteAd(id: string) {
    const existing = await this.tenantService.prisma.advertisement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ad not found');

    this.invalidatePublicAdCaches();
    return this.tenantService.prisma.advertisement.delete({ where: { id } });
  }

  // SUPER ADMIN: List all ads. Ads are manually curated (low volume) so this
  // doesn't need real pagination, but a `take` cap bounds the worst case
  // instead of leaving the query fully unbounded as the table grows.
  async getAllAds() {
    return this.tenantService.prisma.advertisement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // SHOP ADMIN: List targeted ads
  async getTargetedAds(shopId: string) {
    const now = new Date();
    // Fetch advertisements that are currently active - same defensive cap as
    // getAllAds above, for consistency (ads are manually curated/low volume).
    const ads = await this.tenantService.prisma.advertisement.findMany({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { priority: 'desc' },
      take: 200,
    });

    // Filter by targeting on application layer
    return ads.filter(ad => ad.targetAll || ad.targetShops.includes(shopId));
  }

  // PUBLIC (no auth): active, platform-wide BANNER ads for the pre-login
  // app's ad carousel/My Ads list - shop-targeted ads (targetAll: false) are
  // meant for a specific shop admin's dashboard, not anonymous visitors, so
  // they're excluded at the query level rather than filtered after the fact
  // like getTargetedAds does. Restricted to type BANNER so a POPUP/NOTICE/
  // APP_POSTER campaign (meant for a different surface - see
  // getPublicAppPoster below) never shows up here. Never returns
  // targetShops (a raw shop-ID array with no business being public).
  async getPublicAds() {
    const cached = this.publicAdsCache.get(PUBLIC_ADS_CACHE_KEY);
    if (cached) return cached;

    const now = new Date();
    const ads = await this.tenantService.prisma.advertisement.findMany({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
        targetAll: true,
        type: 'BANNER',
      },
      orderBy: { priority: 'desc' },
      take: 20,
      select: { id: true, title: true, imageUrl: true, type: true, priority: true },
    });
    this.publicAdsCache.set(PUBLIC_ADS_CACHE_KEY, ads, PUBLIC_ADS_CACHE_TTL_MS);
    return ads;
  }

  // PUBLIC (no auth): the single highest-priority active APP_POSTER ad, shown
  // full-screen by the native app every time it's opened or resumed from the
  // background (see PublicMobileApp/App.jsx's appStateChange listener).
  // Returns null when there's nothing to show, so the app can skip the
  // overlay entirely rather than showing an empty screen.
  async getPublicAppPoster() {
    const cached = this.appPosterCache.get(APP_POSTER_CACHE_KEY);
    if (cached !== undefined) return cached;

    const now = new Date();
    const poster = await this.tenantService.prisma.advertisement.findFirst({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
        targetAll: true,
        type: 'APP_POSTER',
      },
      orderBy: { priority: 'desc' },
      select: { id: true, title: true, imageUrl: true },
    });
    this.appPosterCache.set(APP_POSTER_CACHE_KEY, poster, PUBLIC_ADS_CACHE_TTL_MS);
    return poster;
  }
}
