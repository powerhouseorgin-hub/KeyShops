import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { TtlCache } from '../../common/ttl-cache';
import { FirebaseFileService } from '../storage/firebase-file.service';
import { pick } from '../../common/pick.util';

// Advertisements: a flat top-level `ads` collection with no relations (targetShops is a plain denormalized
// string array). Public/app-poster reads are served from short-TTL in-memory TtlCache instances.
const PUBLIC_ADS_CACHE_KEY = 'all';
const APP_POSTER_CACHE_KEY = 'current';
const PUBLIC_ADS_CACHE_TTL_MS = 2 * 60 * 1000;

export interface CreateAdInput {
  title: string;
  imageUrl: string;
  type: 'BANNER' | 'POPUP' | 'NOTICE' | 'APP_POSTER';
  startDate: string;
  endDate: string;
  priority?: number;
  targetAll?: boolean;
  targetShops?: string[];
}

@Injectable()
export class FirestoreAdService {
  private publicAdsCache = new TtlCache();
  private appPosterCache = new TtlCache();

  constructor(
    private readonly firestore: FirestoreService,
    private readonly fileService: FirebaseFileService,
  ) {}

  private col() {
    return this.firestore.db.collection('advertisements');
  }

  async uploadImage(file: { originalname: string; buffer: Buffer }) {
    const { fileUrl } = await this.fileService.uploadLongLivedFile(file.originalname, file.buffer, 'ads');
    return { url: fileUrl };
  }

  private invalidatePublicAdCaches() {
    this.publicAdsCache.invalidate(PUBLIC_ADS_CACHE_KEY);
    this.appPosterCache.invalidate(APP_POSTER_CACHE_KEY);
  }

  async createAd(dto: CreateAdInput) {
    const now = Date.now();
    const data = {
      title: dto.title,
      imageUrl: dto.imageUrl,
      type: dto.type,
      startDate: new Date(dto.startDate).getTime(),
      endDate: new Date(dto.endDate).getTime(),
      priority: dto.priority || 0,
      targetAll: dto.targetAll ?? true,
      targetShops: dto.targetShops || [],
      createdAt: now,
      updatedAt: now,
    };
    const ref = await this.col().add(data);
    this.invalidatePublicAdCaches();
    return { id: ref.id, ...data };
  }

  async updateAd(id: string, dto: Partial<CreateAdInput>) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists) throw new NotFoundException('Ad not found');

    const updateData: any = {
      ...pick(dto, ['title', 'imageUrl', 'type', 'startDate', 'endDate', 'priority', 'targetAll', 'targetShops']),
      updatedAt: Date.now(),
    };
    if (dto.startDate) updateData.startDate = new Date(dto.startDate).getTime();
    if (dto.endDate) updateData.endDate = new Date(dto.endDate).getTime();

    await this.col().doc(id).update(updateData);
    this.invalidatePublicAdCaches();
    return { id, ...doc.data(), ...updateData };
  }

  async deleteAd(id: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists) throw new NotFoundException('Ad not found');
    await this.col().doc(id).delete();
    this.invalidatePublicAdCaches();
    return { id };
  }

  async getAllAds() {
    const snap = await this.col().orderBy('createdAt', 'desc').limit(200).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async getTargetedAds(shopId: string) {
    const now = Date.now();
    const snap = await this.col()
      .where('startDate', '<=', now)
      .orderBy('startDate')
      .orderBy('priority', 'desc')
      .limit(200)
      .get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .filter((ad) => ad.endDate >= now && (ad.targetAll || ad.targetShops.includes(shopId)));
  }

  async getPublicAds() {
    const cached = this.publicAdsCache.get(PUBLIC_ADS_CACHE_KEY);
    if (cached) return cached;

    const now = Date.now();
    const snap = await this.col()
      .where('type', '==', 'BANNER')
      .where('targetAll', '==', true)
      .where('startDate', '<=', now)
      .orderBy('startDate')
      .limit(20)
      .get();
    const ads = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .filter((ad) => ad.endDate >= now)
      .sort((a, b) => b.priority - a.priority)
      .map(({ id, title, imageUrl, type, priority }) => ({ id, title, imageUrl, type, priority }));
    this.publicAdsCache.set(PUBLIC_ADS_CACHE_KEY, ads, PUBLIC_ADS_CACHE_TTL_MS);
    return ads;
  }

  async getPublicAppPoster() {
    const cached = this.appPosterCache.get(APP_POSTER_CACHE_KEY);
    if (cached !== undefined) return cached;

    const now = Date.now();
    const snap = await this.col()
      .where('type', '==', 'APP_POSTER')
      .where('targetAll', '==', true)
      .where('startDate', '<=', now)
      .orderBy('startDate')
      .get();
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .filter((ad) => ad.endDate >= now)
      .sort((a, b) => b.priority - a.priority);
    const poster = candidates.length ? { id: candidates[0].id, title: candidates[0].title, imageUrl: candidates[0].imageUrl } : null;
    this.appPosterCache.set(APP_POSTER_CACHE_KEY, poster, PUBLIC_ADS_CACHE_TTL_MS);
    return poster;
  }
}
