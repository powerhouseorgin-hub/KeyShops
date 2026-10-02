import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FirestoreService } from '../firestore.service';
import { TtlCache } from '../../common/ttl-cache';
import { FirebaseFileService } from '../storage/firebase-file.service';
import { AlgoliaSearchService, facetFilter } from '../search/algolia-search.service';
import { pick } from '../../common/pick.util';

// Promotions: the most structurally complex service (cross-shop feed, dynamic filter composition, a linked
// shop's town/district used as a filter). Two Firestore limits to know about:
// 1. Free-text `search` (title/description/productType) runs through the "promotions" Algolia index when
//    AlgoliaSearchService.isConfigured (see that service's doc comment); otherwise it has no effect. Every
//    OTHER filter (category, type, town, shopId, excludeOffers, includeExpiredOffers) is a Firestore query.
// 2. Cross-collection filtering by the linked Shop's town/district (used
//    for the location filter) can't be a single Firestore query the way a
//    SQL join could - it's done as a post-fetch filter: query everything
//    else first, batch-fetch the referenced shops, then filter by
//    town/district match. Correct, but does more read work than a
//    denormalized `shopTown`/`shopDistrict` field on Promotion would -
//    worth denormalizing later if this feed's query volume grows.
const PUBLIC_PROMOTIONS_TTL_MS = 60 * 1000;
const publicPromotionsCache = new TtlCache<any>(500);
const publicPromotionsCacheKey = (category?: string, town?: string, shopId?: string, limit?: number) =>
  `${category || ''}|${town || ''}|${shopId || ''}|${limit || ''}`;

const PRODUCT_MAX_VALIDITY_DAYS = 30;
const PROMOTION_MAX_PHOTOS = 4;

export interface PromotionQueryOpts {
  includeExpiredOffers?: boolean;
  cursor?: string;
  limit?: number;
  category?: string;
  type?: 'PRODUCT' | 'AD' | 'OFFER';
  excludeOffers?: boolean;
  ownerShopId?: string | null;
  ownerUserId?: string;
  shopId?: string;
  town?: string;
  search?: string;
}

export interface CreatePromotionInput {
  type: 'PRODUCT' | 'AD' | 'OFFER';
  title: string;
  description?: string;
  imageUrls?: string[];
  price?: number;
  discountPercentage?: number;
  validUntil?: string;
  linkedPromotionId?: string;
  productType?: string;
  phone?: string;
}

function extractFileKeyFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url, 'http://internal');
    const segments = pathname.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  } catch {
    return null;
  }
}

@Injectable()
export class FirestorePromotionService {
  private readonly logger = new Logger(FirestorePromotionService.name);

  constructor(
    private readonly firestore: FirestoreService,
    private readonly fileService: FirebaseFileService,
    private readonly algolia: AlgoliaSearchService,
  ) {}

  private col() {
    return this.firestore.db.collection('promotions');
  }

  async uploadImage(shopId: string | null, file: { originalname: string; buffer: Buffer }) {
    const { fileUrl } = await this.fileService.uploadLongLivedFile(file.originalname, file.buffer, shopId || 'platform');
    return { url: fileUrl };
  }

  private clampProductExpiry(type: string, requestedIso: string | undefined, anchor: Date): number | undefined {
    if (type !== 'PRODUCT') return requestedIso ? new Date(requestedIso).getTime() : undefined;
    const maxDate = anchor.getTime() + PRODUCT_MAX_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
    if (!requestedIso) return maxDate;
    const requested = new Date(requestedIso).getTime();
    return requested > maxDate ? maxDate : requested;
  }

  private clampImageUrls(requested: string[] | undefined): { imageUrl: string | null; imageUrls: string[] } {
    // These URLs come straight from the client and are later used to derive storage keys for deletion (see
    // deleteExpiredProducts), so only keep plausible string URLs rather than arbitrary values.
    const imageUrls = (Array.isArray(requested) ? requested : [])
      .filter((u): u is string => typeof u === 'string' && u.length > 0 && u.length <= 2048)
      .slice(0, PROMOTION_MAX_PHOTOS);
    return { imageUrl: imageUrls[0] ?? null, imageUrls };
  }

  // Applies every filter EXCEPT town (needs the post-fetch shop join - see
  // class doc comment) and search (needs Algolia, not yet built).
  private buildQuery(opts: PromotionQueryOpts): FirebaseFirestore.Query {
    let q = this.col().where('deletedAt', '==', null) as FirebaseFirestore.Query;
    const now = Date.now();

    if (!opts.includeExpiredOffers) {
      // Firestore can't express "validUntil IS NULL OR validUntil >= now" as
      // one query (an inequality filter excludes docs where the field is
      // absent/null) - handled as a post-fetch filter alongside town instead.
    }
    if (opts.category) q = q.where('productType', '==', opts.category);
    if (opts.type) q = q.where('type', '==', opts.type);
    if (opts.shopId !== undefined) q = q.where('shopId', '==', opts.shopId);
    else if (opts.ownerUserId !== undefined) {
      q = opts.ownerShopId ? q.where('shopId', '==', opts.ownerShopId) : q.where('shopId', '==', null).where('createdById', '==', opts.ownerUserId);
    }
    return q;
  }

  private async postFilterAndEnrich(
    docs: FirebaseFirestore.QueryDocumentSnapshot[],
    opts: { includeExpiredOffers?: boolean; excludeOffers?: boolean; town?: string; withCreatorInfo?: boolean },
  ) {
    const now = Date.now();
    let rows = docs.map((d) => ({ id: d.id, ...d.data() }) as any);

    if (!opts.includeExpiredOffers) {
      rows = rows.filter((r) => r.validUntil == null || r.validUntil >= now);
    }
    if (opts.excludeOffers) {
      rows = rows.filter((r) => r.type !== 'OFFER');
    }

    const shopIds = [...new Set(rows.map((r) => r.shopId).filter(Boolean))];
    const shopDocs = shopIds.length
      ? await this.firestore.db.getAll(...shopIds.map((id) => this.firestore.db.collection('shops').doc(id)))
      : [];
    const shopMap = new Map(shopDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as any]));

    if (opts.town) {
      rows = rows.filter((r) => {
        const shop = r.shopId ? shopMap.get(r.shopId) : null;
        return shop && (shop.town === opts.town || shop.district === opts.town);
      });
    }

    if (!opts.withCreatorInfo) {
      return rows;
    }

    const userIds = [...new Set(rows.map((r) => r.createdById).filter(Boolean))];
    const userDocs = userIds.length
      ? await this.firestore.db.getAll(...userIds.map((id) => this.firestore.db.collection('users').doc(id)))
      : [];
    const userMap = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as any]));

    return rows.map((r) => ({
      ...r,
      shop: r.shopId && shopMap.has(r.shopId) ? { id: r.shopId, ...pickShopFields(shopMap.get(r.shopId)) } : null,
      createdBy: r.createdById && userMap.has(r.createdById) ? { id: r.createdById, name: userMap.get(r.createdById).name, email: userMap.get(r.createdById).email } : null,
    }));

    function pickShopFields(shop: any) {
      return { name: shop.name, town: shop.town, district: shop.district, companyDetails: shop.companyDetails };
    }
  }

  async getAllPromotions(opts: PromotionQueryOpts = {}) {
    const { cursor, limit, search } = opts;

    if (search && this.algolia.isConfigured) {
      const filters = opts.shopId ? facetFilter('shopId', opts.shopId) : undefined;
      const result = await this.algolia.search('promotions', search, { filters });
      if (result.ok) {
        const refs = result.hits.map((h) => this.col().doc(h.objectID));
        const snaps = refs.length ? await this.firestore.db.getAll(...refs) : [];
        const existing = snaps.filter((d) => d.exists) as unknown as FirebaseFirestore.QueryDocumentSnapshot[];
        const items = await this.postFilterAndEnrich(existing, { includeExpiredOffers: opts.includeExpiredOffers, excludeOffers: opts.excludeOffers, town: opts.town, withCreatorInfo: true });
        return limit ? { items, nextCursor: null } : items;
      }
    }

    let q = this.buildQuery(opts).orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    if (limit) {
      q = q.limit(limit + 1);
      if (cursor) {
        const cursorDoc = await this.col().doc(cursor).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc);
      }
    }
    const snap = await q.get();

    if (!limit) {
      return this.postFilterAndEnrich(snap.docs, { includeExpiredOffers: opts.includeExpiredOffers, excludeOffers: opts.excludeOffers, town: opts.town, withCreatorInfo: true });
    }
    const hasMore = snap.docs.length > limit;
    const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const items = await this.postFilterAndEnrich(page, { includeExpiredOffers: opts.includeExpiredOffers, excludeOffers: opts.excludeOffers, town: opts.town, withCreatorInfo: true });
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getPublicPromotions(opts: { category?: string; town?: string; cursor?: string; limit?: number; shopId?: string; search?: string } = {}) {
    const { cursor, limit, search, ...rest } = opts;

    // Free-text search: the public listing pool is small (live PRODUCT
    // listings, hard-capped at 30 days of validity each), so match in
    // memory over the most recent 200 rather than depend on the Algolia
    // index for an unauthenticated feature. Filtering must happen BEFORE
    // paging - slicing first would silently drop matches - so this path
    // returns one filtered page and never a cursor.
    const needle = (search || '').trim().toLowerCase();
    if (needle) {
      const snap = await this.buildQuery({ ...rest, type: 'PRODUCT' }).orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(200).get();
      const rows = await this.postFilterAndEnrich(snap.docs, { town: rest.town, withCreatorInfo: true });
      const matched = rows
        .filter((r: any) => [r.title, r.description, r.productType, r.shop?.name].filter(Boolean).join(' ').toLowerCase().includes(needle))
        .map((r: any) => ({
          id: r.id, type: r.type, title: r.title, description: r.description, imageUrl: r.imageUrl, imageUrls: r.imageUrls,
          price: r.price, discountPercentage: r.discountPercentage, productType: r.productType, phone: r.phone, createdAt: r.createdAt,
          shop: r.shop ? { id: r.shop.id, name: r.shop.name, town: r.shop.town, district: r.shop.district } : null,
        }));
      return limit ? { items: matched.slice(0, limit), nextCursor: null } : matched.slice(0, 50);
    }

    const cacheable = !cursor;
    const cacheKey = cacheable ? publicPromotionsCacheKey(rest.category, rest.town, rest.shopId, limit) : null;
    if (cacheKey) {
      const cached = publicPromotionsCache.get(cacheKey);
      if (cached) return cached;
    }

    let q = this.buildQuery({ ...rest, type: 'PRODUCT' }).orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    q = limit ? q.limit(limit + 1) : q.limit(50);
    if (cursor) {
      const cursorDoc = await this.col().doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }
    const snap = await q.get();

    const publicShape = (r: any) => ({
      id: r.id, type: r.type, title: r.title, description: r.description, imageUrl: r.imageUrl, imageUrls: r.imageUrls,
      price: r.price, discountPercentage: r.discountPercentage, productType: r.productType, phone: r.phone, createdAt: r.createdAt,
      shop: r.shop ? { id: r.shop.id, name: r.shop.name, town: r.shop.town, district: r.shop.district } : null,
    });

    if (!limit) {
      const rows = await this.postFilterAndEnrich(snap.docs, { town: rest.town, withCreatorInfo: true });
      const result = rows.map(publicShape);
      if (cacheKey) publicPromotionsCache.set(cacheKey, result, PUBLIC_PROMOTIONS_TTL_MS);
      return result;
    }

    const hasMore = snap.docs.length > limit;
    const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const rows = await this.postFilterAndEnrich(page, { town: rest.town, withCreatorInfo: true });
    const result = { items: rows.map(publicShape), nextCursor: hasMore ? page[page.length - 1].id : null };
    if (cacheKey) publicPromotionsCache.set(cacheKey, result, PUBLIC_PROMOTIONS_TTL_MS);
    return result;
  }

  async getPublicPromotionById(id: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as any;
    if (data.type !== 'PRODUCT' || data.deletedAt) return null;
    const [enriched] = await this.postFilterAndEnrich([doc as any], { includeExpiredOffers: true, withCreatorInfo: true });
    return enriched
      ? { id, type: enriched.type, title: enriched.title, description: enriched.description, imageUrl: enriched.imageUrl, imageUrls: enriched.imageUrls, price: enriched.price, discountPercentage: enriched.discountPercentage, productType: enriched.productType, phone: enriched.phone, createdAt: enriched.createdAt, shop: enriched.shop }
      : null;
  }

  async createPromotion(shopId: string | null, userId: string, dto: CreatePromotionInput) {
    const now = new Date();
    const { imageUrl, imageUrls } = this.clampImageUrls(dto.imageUrls);
    const data = {
      type: dto.type,
      title: dto.title,
      description: dto.description || null,
      imageUrl,
      imageUrls,
      price: dto.price ?? null,
      discountPercentage: dto.discountPercentage ?? null,
      validUntil: this.clampProductExpiry(dto.type, dto.validUntil, now) ?? null,
      linkedPromotionId: dto.linkedPromotionId || null,
      productType: dto.productType || null,
      phone: dto.phone || null,
      shopId,
      createdById: userId,
      deletedAt: null,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    };
    const ref = await this.col().add(data);
    const [enriched] = await this.postFilterAndEnrich([{ id: ref.id, data: () => data } as any], { includeExpiredOffers: true, withCreatorInfo: true });
    return enriched;
  }

  async updatePromotionAsShop(id: string, shopId: string, dto: Partial<CreatePromotionInput>) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists || (doc.data() as any).shopId !== shopId) throw new NotFoundException('Promotion not found');
    return this.applyUpdate(doc, dto);
  }

  async deletePromotionAsShop(id: string, shopId: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists || (doc.data() as any).shopId !== shopId) throw new NotFoundException('Promotion not found');
    await doc.ref.delete();
    return { success: true };
  }

  async updatePromotionAsSuperAdmin(id: string, userId: string, dto: Partial<CreatePromotionInput>) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists || (doc.data() as any).createdById !== userId) throw new NotFoundException('Promotion not found');
    return this.applyUpdate(doc, dto);
  }

  async deletePromotionAsSuperAdmin(id: string, userId: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists || (doc.data() as any).createdById !== userId) throw new NotFoundException('Promotion not found');
    await doc.ref.delete();
    return { success: true };
  }

  private async applyUpdate(doc: FirebaseFirestore.DocumentSnapshot, dto: Partial<CreatePromotionInput>) {
    const existing = doc.data() as any;
    // Allowlist (not `...dto`): a Shop Admin must not be able to rewrite shopId, createdById, createdAt,
    // deletedAt or the promotion `type` through this body. imageUrls is handled separately below.
    const data: any = {
      ...pick(dto, ['title', 'description', 'price', 'discountPercentage', 'validUntil', 'linkedPromotionId', 'productType', 'phone']),
      updatedAt: Date.now(),
    };
    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil ? this.clampProductExpiry(existing.type, dto.validUntil, new Date(existing.createdAt)) : null;
    }
    if (dto.imageUrls !== undefined) {
      const { imageUrl, imageUrls } = this.clampImageUrls(dto.imageUrls);
      data.imageUrl = imageUrl;
      data.imageUrls = imageUrls;
    }
    await doc.ref.update(data);
    const [enriched] = await this.postFilterAndEnrich([{ id: doc.id, data: () => ({ ...existing, ...data }) } as any], { includeExpiredOffers: true, withCreatorInfo: true });
    return enriched;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async deleteExpiredProducts() {
    const now = Date.now();
    const snap = await this.col().where('type', '==', 'PRODUCT').where('validUntil', '<', now).get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const promo = doc.data() as any;
      const urls = new Set([...(promo.imageUrls || []), ...(promo.imageUrl ? [promo.imageUrl] : [])]);
      // Uploaded images are named `<shopId>_<timestamp>_<random>.<ext>` (FirebaseFileService.uploadFile), and
      // the URLs stored on a promotion are client-supplied. Only delete a storage object whose name carries
      // THIS promotion's own shop prefix - otherwise a crafted URL could make this job delete another
      // shop's file.
      const ownerPrefix = `${String(promo.shopId || 'platform').replace(/[^a-zA-Z0-9]/g, '')}_`;
      for (const url of urls) {
        const fileKey = extractFileKeyFromUrl(url);
        if (!fileKey) continue;
        if (!fileKey.startsWith(ownerPrefix)) {
          this.logger.warn(`Skipping storage delete for expired promotion ${doc.id}: "${fileKey}" is not one of its shop's uploads`);
          continue;
        }
        try {
          await this.fileService.deleteFile(fileKey);
        } catch (err: any) {
          this.logger.warn(`Failed to delete storage file "${fileKey}" for expired promotion ${doc.id}: ${err?.message}`);
        }
      }
    }

    const batch = this.firestore.db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    this.logger.log(`Auto-deleted ${snap.size} expired machine/product listing(s) and their storage files`);
  }
}
