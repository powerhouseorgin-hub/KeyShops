import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { ShopRepository } from './shop.repository';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { FirebaseFileService } from '../storage/firebase-file.service';
import { ShopCategoryService } from '../config/reference-lists.module';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../../common/validators/phone';
import { forwardGeocodeAddress } from '../../common/geocode.util';
import { parseBase64DataUri } from '../../common/base64.util';
import { invalidateAuthCache } from '../../auth/auth-cache';
import { TtlCache } from '../../common/ttl-cache';
import { AlgoliaSearchService, facetFilter } from '../search/algolia-search.service';
import { pick } from '../../common/pick.util';

// Shops: Super Admin shop provisioning/management, Shop Admin settings, the public shop directory and
// referral queries (the largest service in the backend). Two Firestore limits to know about:
// 1. Free-text `search`/`query` (shop name, admin name/email, companyDetails
//    substring match) runs through the "shops" Algolia index when
//    AlgoliaSearchService.isConfigured (see that service's doc comment and
//    FirestoreCustomerService's identical pattern); otherwise it's accepted
//    for API-shape compatibility but has no effect.
// 2. Combining a town/district filter with cursor pagination is an
//    approximation, not exact: Firestore can't express "town OR district"
//    as a single indexed query the way SQL can, so both are queried and
//    merged in memory, then paginated over the merged (capped) set rather
//    than via a single cursor-friendly index scan. Fine at this app's shop
//    counts; would need denormalizing a single `locality` field to scale
//    further.
const PUBLIC_SHOP_SEARCH_TTL_MS = 60 * 1000;
const publicShopSearchCache = new TtlCache<any>(500);
const publicShopSearchCacheKey = (category?: string, town?: string, limit?: number) =>
  `${category || ''}|${town || ''}|${limit || ''}`;

const CATEGORY_NAME_BY_FILTER: Record<string, string[]> = {
  KEY_SHOPS: ['Key Shops'], 'KEY SHOPS': ['Key Shops'], KEY_SHOP: ['Key Shops'],
  DEALERS: ['Dealers'], DEALER: ['Dealers'],
  ECM: ['ECM'],
  METER: ['Meter'],
  SCANNER: ['Scanning', 'Scanner'], SCANNING: ['Scanning', 'Scanner'],
};

function extractAddressText(companyDetails: string | null | undefined): string | null {
  if (!companyDetails) return null;
  try {
    const parsed = JSON.parse(companyDetails);
    return typeof parsed?.address === 'string' ? parsed.address : null;
  } catch {
    return null;
  }
}

export interface CreateShopInput {
  name: string;
  companyDetails?: string;
  themeColor?: string;
  shopPhoto?: string;
  shopLicense?: string;
  ownerAadhaar?: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  adminPhone: string;
  categoryId: string;
  town?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateShopInput {
  name?: string;
  companyDetails?: string;
  themeColor?: string;
  isActive?: boolean;
}

export interface UpdateSettingsInput {
  name?: string;
  companyDetails?: string;
  themeColor?: string;
}

@Injectable()
export class FirestoreShopService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly shops: ShopRepository,
    private readonly firebaseAuth: FirebaseAuthService,
    private readonly files: FirebaseFileService,
    private readonly categories: ShopCategoryService,
    private readonly algolia: AlgoliaSearchService,
  ) {}

  private get db() {
    return this.firestore.db;
  }

  private async uploadShopDocumentInputs(shopId: string, docs: { shopPhoto?: string; shopLicense?: string; ownerAadhaar?: string }) {
    const entries: Array<[string, string | undefined]> = [
      ['SHOP_PHOTO', docs.shopPhoto],
      ['SHOP_LICENSE', docs.shopLicense],
      ['OWNER_AADHAAR', docs.ownerAadhaar],
    ];
    const results: Array<{ documentType: string; fileUrl: string; fileKey: string; fileSize: number; originalName: string }> = [];
    for (const [documentType, value] of entries) {
      const parsed = parseBase64DataUri(value);
      if (!parsed) continue;
      const originalName = `${documentType.toLowerCase()}${parsed.ext}`;
      const upload = await this.files.uploadFile(originalName, parsed.buffer, shopId);
      results.push({ documentType, fileUrl: upload.fileUrl, fileKey: upload.fileKey, fileSize: parsed.buffer.length, originalName });
    }
    return results;
  }

  private async invalidateShopAuthCache(shopId: string) {
    const snap = await this.db.collection('users').where('shopId', '==', shopId).get();
    snap.docs.forEach((d) => invalidateAuthCache(d.id));
  }

  // Re-fetches a shop by id - used for Algolia search hits (see
  // FirestoreCustomerService.enrichCustomerRowById's identical rationale).
  private async enrichShopRowById(id: string) {
    const doc = await this.db.collection('shops').doc(id).get();
    if (!doc.exists) return null;
    return this.enrichShopRow(id, doc.data());
  }

  private async enrichShopRow(id: string, data: any) {
    const [subsSnap, adminsSnap, docsSnap] = await Promise.all([
      this.shops.subscriptions(id).orderBy('createdAt', 'desc').limit(1).get(),
      this.db.collection('users').where('shopId', '==', id).where('role', '==', 'SHOP_ADMIN').get(),
      this.shops.documents(id).orderBy('createdAt', 'desc').get(),
    ]);
    return {
      id,
      ...data,
      subscriptions: subsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      users: adminsSnap.docs.map((d) => ({ id: d.id, email: (d.data() as any).email, name: (d.data() as any).name })),
      documents: docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  }

  // SUPER ADMIN: Create Shop - Firebase Auth counterpart to
  // ShopRegistrationService.registerShop, but Super-Admin-provisioned: no
  // payment/trial branch (straight to a one-year YEARLY subscription), no
  // RevenueRecord (nothing was actually paid), and verification documents
  // arrive as base64 up front instead of via a separate upload step.
  async createShop(dto: CreateShopInput) {
    const normalizedPhone = normalizePhone(dto.adminPhone);
    if (!normalizedPhone) throw new BadRequestException(PHONE_REGEX_MESSAGE);

    const shopRef = this.db.collection('shops').doc();

    let resolvedTown = dto.town ?? null;
    let resolvedDistrict = dto.district ?? null;
    let resolvedLat = dto.latitude ?? null;
    let resolvedLng = dto.longitude ?? null;
    if (!resolvedTown && !resolvedDistrict) {
      const geocoded = await forwardGeocodeAddress(extractAddressText(dto.companyDetails));
      if (geocoded) {
        resolvedTown = geocoded.town || null;
        resolvedDistrict = geocoded.district || null;
        resolvedLat = resolvedLat ?? geocoded.latitude;
        resolvedLng = resolvedLng ?? geocoded.longitude;
      }
    }

    const documentUploads = await this.uploadShopDocumentInputs(shopRef.id, {
      shopPhoto: dto.shopPhoto, shopLicense: dto.shopLicense, ownerAadhaar: dto.ownerAadhaar,
    });

    const authUser = await this.firebaseAuth.createUser({
      email: dto.adminEmail,
      phoneNumber: normalizedPhone,
      password: dto.adminPassword,
      displayName: dto.adminName,
    });

    try {
      await this.db.runTransaction(async (tx) => {
        const emailIndexRef = this.db.collection('emailIndex').doc(dto.adminEmail.toLowerCase());
        const phoneIndexRef = this.db.collection('phoneIndex').doc(normalizedPhone);
        const categoryRef = this.db.collection('shopCategories').doc(dto.categoryId);

        const [emailIndexSnap, phoneIndexSnap, categorySnap] = await Promise.all([
          tx.get(emailIndexRef), tx.get(phoneIndexRef), tx.get(categoryRef),
        ]);
        if (emailIndexSnap.exists) throw new BadRequestException('Email address already registered to another user');
        if (phoneIndexSnap.exists) throw new BadRequestException('This mobile number is already registered to another shop');
        if (!categorySnap.exists || (categorySnap.data() as any).deletedAt) throw new BadRequestException('Please select a valid shop category');

        const now = Date.now();
        tx.set(shopRef, {
          name: dto.name,
          companyDetails: dto.companyDetails || null,
          themeColor: dto.themeColor || '#9C27B0',
          isActive: true,
          storageUsed: 0,
          aadhaarNumber: null,
          logoUrl: null,
          latitude: resolvedLat,
          longitude: resolvedLng,
          town: resolvedTown,
          district: resolvedDistrict,
          categoryId: dto.categoryId,
          referralCode: normalizedPhone,
          referredByCode: null,
          referralPoints: 0,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });

        tx.set(this.db.collection('users').doc(authUser.uid), {
          email: dto.adminEmail,
          phone: normalizedPhone,
          name: dto.adminName,
          role: 'SHOP_ADMIN',
          shopId: shopRef.id,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        tx.set(emailIndexRef, { uid: authUser.uid });
        tx.set(phoneIndexRef, { uid: authUser.uid });

        const endDate = new Date(now);
        endDate.setFullYear(endDate.getFullYear() + 1);
        tx.set(shopRef.collection('subscriptions').doc(), {
          plan: 'YEARLY', status: 'ACTIVE', startDate: now, endDate: endDate.getTime(), createdAt: now, updatedAt: now,
        });

        for (const doc of documentUploads) {
          tx.set(shopRef.collection('documents').doc(), { ...doc, createdAt: now, updatedAt: now });
        }

        tx.set(this.db.collection('activityLogs').doc(), {
          shopId: shopRef.id, userId: authUser.uid, action: 'SHOP_REGISTERED',
          details: JSON.stringify({ message: `Shop "${dto.name}" provisioned by Super Admin`, shopName: dto.name }),
          ipAddress: null, createdAt: now,
        });
      });
    } catch (err) {
      await this.firebaseAuth.deleteUser(authUser.uid).catch(() => {});
      throw err;
    }

    await this.firebaseAuth.setCustomClaims(authUser.uid, { role: 'SHOP_ADMIN', shopId: shopRef.id });
    return this.getShopById(shopRef.id);
  }

  // SUPER ADMIN: List shops. `search` accepted for shape-compat only (see
  // class doc comment - Algolia-blocked). Town/district filter + pagination
  // is an in-memory merge - see class doc comment for the tradeoff.
  async getShops(opts: { search?: string; town?: string; cursor?: string; limit?: number } = {}) {
    const { search, town, cursor, limit } = opts;

    if (search && this.algolia.isConfigured) {
      const filters = town ? `${facetFilter('town', town)} OR ${facetFilter('district', town)}` : undefined;
      const result = await this.algolia.search('shops', search, { filters });
      if (result.ok) {
        const rows = await Promise.all(result.hits.map((h) => this.enrichShopRowById(h.objectID)));
        const filtered = rows.filter((r): r is NonNullable<typeof r> => r !== null);
        return limit ? { items: filtered, nextCursor: null } : filtered;
      }
    }

    if (!town) {
      let q = this.db.collection('shops') as FirebaseFirestore.Query;
      if (!limit) {
        const snap = await q.get();
        return Promise.all(snap.docs.map((d) => this.enrichShopRow(d.id, d.data())));
      }
      q = q.orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(limit + 1);
      if (cursor) {
        const cursorDoc = await this.db.collection('shops').doc(cursor).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc);
      }
      const snap = await q.get();
      const hasMore = snap.docs.length > limit;
      const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const items = await Promise.all(page.map((d) => this.enrichShopRow(d.id, d.data())));
      return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
    }

    const [byTown, byDistrict] = await Promise.all([
      this.db.collection('shops').where('town', '==', town).get(),
      this.db.collection('shops').where('district', '==', town).get(),
    ]);
    const merged = new Map<string, any>();
    [...byTown.docs, ...byDistrict.docs].forEach((d) => merged.set(d.id, d.data()));
    const sorted = [...merged.entries()].sort((a, b) => (b[1].createdAt ?? 0) - (a[1].createdAt ?? 0));

    if (!limit) {
      return Promise.all(sorted.map(([id, data]) => this.enrichShopRow(id, data)));
    }
    const startIndex = cursor ? sorted.findIndex(([id]) => id === cursor) + 1 : 0;
    const page = sorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < sorted.length;
    const items = await Promise.all(page.map(([id, data]) => this.enrichShopRow(id, data)));
    return { items, nextCursor: hasMore ? page[page.length - 1][0] : null };
  }

  async getShopById(id: string) {
    const doc = await this.db.collection('shops').doc(id).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');
    return this.enrichShopRow(id, doc.data());
  }

  async updateShop(id: string, dto: UpdateShopInput, actorUserId: string) {
    const doc = await this.db.collection('shops').doc(id).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');
    const shop = doc.data() as any;

    await this.shops.update(id, dto as any);

    await this.db.collection('activityLogs').add({
      userId: actorUserId, shopId: id, action: 'SHOP_UPDATED',
      details: JSON.stringify({ message: `Shop "${shop.name}" details updated by Super Admin` }),
      ipAddress: null, createdAt: Date.now(),
    }).catch((err) => console.error('Failed to write SHOP_UPDATED activity log for shop', id, err));

    return this.getShopById(id);
  }

  async setShopStatus(id: string, isActive: boolean, actorUserId: string) {
    const doc = await this.db.collection('shops').doc(id).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');
    const shop = doc.data() as any;

    await this.shops.update(id, { isActive } as any);
    await this.invalidateShopAuthCache(id);

    await this.db.collection('activityLogs').add({
      userId: actorUserId, shopId: id, action: isActive ? 'SHOP_REACTIVATED' : 'SHOP_SUSPENDED',
      details: JSON.stringify({ message: `Shop "${shop.name}" ${isActive ? 'reactivated' : 'suspended'} by Super Admin` }),
      ipAddress: null, createdAt: Date.now(),
    }).catch((err) => console.error('Failed to write SHOP_SUSPENDED/REACTIVATED activity log for shop', id, err));

    return this.getShopById(id);
  }

  async updateSubscription(shopId: string, dto: { status: string }, actorUserId: string) {
    const doc = await this.db.collection('shops').doc(shopId).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');
    const shop = doc.data() as any;

    const now = Date.now();
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const subscription = await this.db.runTransaction(async (tx) => {
      const activeSnap = await tx.get(this.shops.subscriptions(shopId).where('status', '==', 'ACTIVE'));
      activeSnap.docs.forEach((d) => tx.update(d.ref, { status: 'EXPIRED', updatedAt: now }));

      const newSubRef = this.shops.subscriptions(shopId).doc();
      tx.set(newSubRef, { plan: 'YEARLY', status: dto.status, startDate: now, endDate: endDate.getTime(), createdAt: now, updatedAt: now });
      return { id: newSubRef.id, plan: 'YEARLY', status: dto.status, startDate: now, endDate: endDate.getTime() };
    });
    await this.invalidateShopAuthCache(shopId);

    await this.db.collection('activityLogs').add({
      userId: actorUserId, shopId, action: 'SUBSCRIPTION_RENEWED',
      details: JSON.stringify({ message: `Subscription renewed for shop "${shop.name}" by Super Admin`, plan: 'YEARLY', status: dto.status, endDate: endDate.getTime() }),
      ipAddress: null, createdAt: now,
    }).catch((err) => console.error('Failed to write SUBSCRIPTION_RENEWED activity log for shop', shopId, err));

    return subscription;
  }

  private mapPublicShop(id: string, shop: any, categoryName: string | null) {
    let address: string | null = null;
    let phone: string | null = null;
    let website: string | null = null;
    if (shop.companyDetails) {
      try {
        const details = JSON.parse(shop.companyDetails);
        address = details.address || null;
        phone = details.phone || null;
        website = details.website || null;
      } catch {
        // not valid JSON - omit address/phone/website
      }
    }
    return {
      id, name: shop.name, themeColor: shop.themeColor, address, phone, website,
      town: shop.town || null, district: shop.district || null, logoUrl: shop.logoUrl || null,
      category: categoryName,
    };
  }

  // PUBLIC: search/list shops. `query` accepted for shape-compat only (not
  // implemented - see class doc comment).
  async searchPublicShops(opts: { query?: string; category?: string; town?: string; cursor?: string; limit?: number } = {}) {
    const { category, town, cursor, limit } = opts;
    const cacheable = !opts.query && !cursor;
    const cacheKey = cacheable ? publicShopSearchCacheKey(category, town, limit) : null;
    if (cacheKey) {
      const cached = publicShopSearchCache.get(cacheKey);
      if (cached) return cached;
    }

    let categoryIds: string[] | null = null;
    if (category) {
      const names = CATEGORY_NAME_BY_FILTER[category.trim().toUpperCase()];
      if (names) {
        const allCategories = await this.categories.getAll();
        categoryIds = allCategories.filter((c) => names.some((n) => n.toLowerCase() === c.name.toLowerCase())).map((c) => c.id);
        if (categoryIds.length === 0) {
          const empty = limit ? { items: [], nextCursor: null } : [];
          if (cacheKey) publicShopSearchCache.set(cacheKey, empty, PUBLIC_SHOP_SEARCH_TTL_MS);
          return empty;
        }
      }
    }

    const applyCommonFilters = (q: FirebaseFirestore.Query) => {
      let out = q.where('isActive', '==', true);
      if (categoryIds) out = out.where('categoryId', 'in', categoryIds.slice(0, 30));
      return out;
    };

    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (town) {
      const [byTown, byDistrict] = await Promise.all([
        applyCommonFilters(this.db.collection('shops')).where('town', '==', town).get(),
        applyCommonFilters(this.db.collection('shops')).where('district', '==', town).get(),
      ]);
      const merged = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      [...byTown.docs, ...byDistrict.docs].forEach((d) => merged.set(d.id, d));
      docs = [...merged.values()];
    } else {
      const snap = await applyCommonFilters(this.db.collection('shops')).get();
      docs = snap.docs;
    }
    docs.sort((a, b) => ((b.data() as any).createdAt ?? 0) - ((a.data() as any).createdAt ?? 0));

    const categoryIdsInPage = [...new Set(docs.map((d) => (d.data() as any).categoryId).filter(Boolean))];
    const categoryDocs = categoryIdsInPage.length
      ? await this.db.getAll(...categoryIdsInPage.map((id) => this.db.collection('shopCategories').doc(id)))
      : [];
    const categoryNameMap = new Map(categoryDocs.filter((d) => d.exists).map((d) => [d.id, (d.data() as any).name]));

    // Free-text match over name/address/town/district/category. Public
    // directory only ever holds active shops (a handful today), so an
    // in-memory pass is exact and instant - no Algolia sync lag, and no
    // dependency on an index for an unauthenticated landing-page feature.
    const needle = (opts.query || '').trim().toLowerCase();
    if (needle) {
      docs = docs.filter((d) => {
        const s = d.data() as any;
        const hay = [s.name, s.companyDetails, s.town, s.district, s.categoryId ? categoryNameMap.get(s.categoryId) : '']
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      });
    }

    const toPublic = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data() as any;
      return this.mapPublicShop(d.id, data, data.categoryId ? categoryNameMap.get(data.categoryId) || null : null);
    };

    if (!limit) {
      const result = docs.slice(0, 50).map(toPublic);
      if (cacheKey) publicShopSearchCache.set(cacheKey, result, PUBLIC_SHOP_SEARCH_TTL_MS);
      return result;
    }
    const startIndex = cursor ? docs.findIndex((d) => d.id === cursor) + 1 : 0;
    const page = docs.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < docs.length;
    const result = { items: page.map(toPublic), nextCursor: hasMore ? page[page.length - 1].id : null };
    if (cacheKey) publicShopSearchCache.set(cacheKey, result, PUBLIC_SHOP_SEARCH_TTL_MS);
    return result;
  }

  async getPublicShopById(id: string) {
    const doc = await this.db.collection('shops').doc(id).get();
    if (!doc.exists) return null;
    const shop = doc.data() as any;
    if (!shop.isActive) return null;
    const categoryName = shop.categoryId ? (await this.db.collection('shopCategories').doc(shop.categoryId).get()).data()?.name ?? null : null;
    return this.mapPublicShop(id, shop, categoryName);
  }

  async getSettings(shopId: string) {
    return this.getShopById(shopId);
  }

  async updateSettings(shopId: string, dto: UpdateSettingsInput) {
    // Allowlist: this body comes straight from a Shop Admin and the DTO is a plain interface, so nothing
    // else strips unknown fields - without it `referralPoints`, `categoryId`, `isActive`, `aadhaarNumber`
    // etc. could be written to the shop document by any Shop Admin.
    const data: Record<string, any> = pick(dto, ['name', 'companyDetails', 'themeColor']);
    // The DTO is only a TypeScript interface, so nothing has checked the types or sizes of these values yet.
    const limits: Record<string, number> = { name: 200, companyDetails: 10000, themeColor: 32 };
    for (const [key, max] of Object.entries(limits)) {
      const value = data[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.length > max) {
        throw new BadRequestException(`${key} must be text of at most ${max} characters`);
      }
    }
    if (dto.companyDetails) {
      try {
        const details = JSON.parse(dto.companyDetails);
        const newPhone = details.phone ? normalizePhone(details.phone) || details.phone : null;
        if (newPhone) {
          const current = await this.db.collection('shops').doc(shopId).get();
          if (current.exists && (current.data() as any).referralCode !== newPhone) {
            data.referralCode = newPhone;
          }
        }
      } catch {
        // malformed companyDetails JSON - save the rest untouched
      }
    }

    try {
      await this.shops.update(shopId, data);
    } catch (e: any) {
      if (data.referralCode) {
        const { referralCode, ...rest } = data;
        await this.shops.update(shopId, rest);
      } else {
        throw e;
      }
    }
    return this.getShopById(shopId);
  }

  async uploadLogo(shopId: string, file: { originalname: string; buffer: Buffer }) {
    const doc = await this.db.collection('shops').doc(shopId).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');

    const { fileUrl } = await this.files.uploadLongLivedFile(file.originalname, file.buffer, shopId);
    await this.shops.update(shopId, { logoUrl: fileUrl } as any);
    return this.getShopById(shopId);
  }

  // Unlike the app-wide soft-delete convention, shop document rows are hard
  // deleted (see addOrReplaceShopDocument/deleteShopDocument).
  async addOrReplaceShopDocument(shopId: string, documentType: string, file: any) {
    const doc = await this.db.collection('shops').doc(shopId).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');

    const upload = await this.files.uploadFile(file.originalname, file.buffer, shopId);

    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(this.shops.documents(shopId).where('documentType', '==', documentType));
      existing.docs.forEach((d) => tx.delete(d.ref));

      const now = Date.now();
      const newRef = this.shops.documents(shopId).doc();
      const data = {
        documentType, fileUrl: upload.fileUrl, fileKey: upload.fileKey,
        fileSize: file.size, originalName: file.originalname || null,
        createdAt: now, updatedAt: now,
      };
      tx.set(newRef, data);
      return { id: newRef.id, ...data };
    });
  }

  async deleteShopDocument(shopId: string, documentId: string) {
    const doc = await this.shops.documents(shopId).doc(documentId).get();
    if (!doc.exists) throw new NotFoundException('Document not found');
    await doc.ref.delete();
    return { success: true };
  }

  async getOrCreateReferralCode(shopId: string): Promise<string> {
    const doc = await this.db.collection('shops').doc(shopId).get();
    if (!doc.exists) throw new NotFoundException('Shop not found');
    const shop = doc.data() as any;
    if (shop.referralCode) return shop.referralCode;

    const adminSnap = await this.db.collection('users').where('shopId', '==', shopId).where('role', '==', 'SHOP_ADMIN').limit(1).get();
    const phone = adminSnap.docs[0]?.data()?.phone;
    if (!phone) throw new BadRequestException('No admin phone number found for this shop');

    await this.shops.update(shopId, { referralCode: phone } as any);
    return phone;
  }

  async getReferralOverview(shopId: string) {
    const referralCode = await this.getOrCreateReferralCode(shopId);

    const [shopDoc, totalReferralsSnap, referralsSnap] = await Promise.all([
      this.db.collection('shops').doc(shopId).get(),
      this.db.collection('referrals').where('referrerShopId', '==', shopId).count().get(),
      this.db.collection('referrals').where('referrerShopId', '==', shopId).orderBy('createdAt', 'desc').limit(100).get(),
    ]);

    const referredShopIds = referralsSnap.docs.map((d) => (d.data() as any).referredShopId);
    const referredShopDocs = referredShopIds.length
      ? await this.db.getAll(...referredShopIds.map((id) => this.db.collection('shops').doc(id)))
      : [];
    const referredShopMap = new Map(referredShopDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as any]));

    return {
      referralCode,
      referralPoints: (shopDoc.data() as any)?.referralPoints ?? 0,
      totalReferrals: totalReferralsSnap.data().count,
      history: referralsSnap.docs.map((d) => {
        const data = d.data() as any;
        const referredShop = referredShopMap.get(data.referredShopId);
        return {
          shopName: referredShop?.name ?? null,
          registeredAt: referredShop?.createdAt ?? null,
          pointsEarned: data.pointsAwarded,
        };
      }),
    };
  }
}
