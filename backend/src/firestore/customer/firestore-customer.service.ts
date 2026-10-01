import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { ShopRepository } from '../shop/shop.repository';
import { CustomerRegistrationService, type CreateCustomerInput } from './customer-registration.service';
import { CryptoService } from '../../crypto/crypto.service';
import { FirebaseFileService } from '../storage/firebase-file.service';
import { AlgoliaSearchService } from '../search/algolia-search.service';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../../common/validators/phone';

// Firestore port of CustomerService's remaining surface - creation itself
// already lives in CustomerRegistrationService (the transactional
// Customer+MasterKey+ActivityLog+Notification write); this covers the
// list/search/update paths CustomerRegistrationService doesn't touch.
//
// `query`/`search`: when AlgoliaSearchService.isConfigured, free-text search
// across name/phone/keyNumber/vehicleNumber/address runs through the
// "customers" Algolia index (synced from this collection group by a
// "Search with Algolia" Firebase Extension instance - see that service's
// doc comment). Search hits are re-fetched from Firestore by objectID
// (= doc ID) rather than trusted directly, so results stay authoritative
// and still go through enrichCustomerRow's shop/masterKey join. When
// Algolia isn't configured, this falls back to the original fail-soft
// behavior: an exact match against phone or keyNumber only (both
// structured fields Firestore can query directly) - still enough for
// App.jsx's checkDuplicateKey (exact key code) and phone-based lookup.
export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  address?: string;
  idProofType?: string;
  idProofNumber?: string;
  reason?: string;
  keyNumber?: string;
  keyType?: string;
  vehicleNumber?: string;
  masterKeyId?: string;
  latitude?: number;
  longitude?: number;
  mapsLink?: string;
  capturedAddress?: string;
  billAmount?: number;
  vehicleName?: string;
  lostKey?: boolean;
  addKey?: boolean;
  homeOfficeName?: string;
  vehicleCategory?: string;
}

export interface CreateCustomerDtoInput extends UpdateCustomerInput {
  name: string;
  phone: string;
  photoBase64?: string;
  manualKey?: { category: string };
}

@Injectable()
export class FirestoreCustomerService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly shops: ShopRepository,
    private readonly registration: CustomerRegistrationService,
    private readonly crypto: CryptoService,
    private readonly files: FirebaseFileService,
    private readonly algolia: AlgoliaSearchService,
  ) {}

  private get db() {
    return this.firestore.db;
  }

  private decryptPII(customer: any) {
    if (customer?.idProofNumber) {
      customer.idProofNumber = this.crypto.decrypt(customer.idProofNumber);
    }
    return customer;
  }

  private async findCustomerShopId(customerId: string): Promise<string | null> {
    const doc = await this.db.collection('customerShopIndex').doc(customerId).get();
    return doc.exists ? (doc.data() as any).shopId : null;
  }

  async createCustomer(shopId: string, actorUserId: string, dto: CreateCustomerDtoInput) {
    const normalizedPhone = normalizePhone(dto.phone);
    if (!normalizedPhone) throw new BadRequestException(PHONE_REGEX_MESSAGE);

    const encryptedIdNumber = dto.idProofNumber ? this.crypto.encrypt(dto.idProofNumber) : undefined;

    let photoUrl: string | undefined;
    if ((dto as any).photoBase64) {
      try {
        const cleanBase64 = (dto as any).photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const upload = await this.files.uploadFile('photo.png', buffer, shopId);
        photoUrl = upload.fileUrl;
      } catch (err: any) {
        console.error('Failed to save webcam customer photo:', err.message);
      }
    }

    let billNumber: string | undefined;
    if (dto.billAmount !== null && dto.billAmount !== undefined && (dto.billAmount as any) !== '') {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      billNumber = `BILL-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const input: CreateCustomerInput = {
      shopId,
      actorUserId,
      name: dto.name,
      phone: normalizedPhone,
      address: dto.address,
      idProofType: dto.idProofType,
      idProofNumber: encryptedIdNumber,
      reason: dto.reason,
      keyNumber: dto.keyNumber,
      keyType: dto.keyType,
      vehicleNumber: dto.vehicleNumber,
      latitude: dto.latitude,
      longitude: dto.longitude,
      mapsLink: dto.mapsLink,
      capturedAddress: dto.capturedAddress,
      billAmount: dto.billAmount,
      billNumber,
      vehicleName: dto.vehicleName,
      lostKey: dto.lostKey,
      addKey: dto.addKey,
      homeOfficeName: dto.homeOfficeName,
      vehicleCategory: dto.vehicleCategory || dto.manualKey?.category,
    };

    const { customerId } = await this.registration.createCustomer(input);

    if (photoUrl) {
      await this.shops.customers(shopId).doc(customerId).update({ photoUrl, updatedAt: Date.now() });
    }

    const doc = await this.shops.customers(shopId).doc(customerId).get();
    return this.enrichCustomerRow(customerId, shopId, doc.data());
  }

  // Re-fetches a customer by (shopId, id) - used for Algolia search hits,
  // which only give an objectID (= doc ID) and whatever stale fields were
  // last synced. Returns null for a hit whose underlying doc has since been
  // deleted (sync lag), which callers filter out rather than erroring.
  private async enrichCustomerRowById(shopId: string, id: string) {
    const doc = await this.shops.customers(shopId).doc(id).get();
    if (!doc.exists) return null;
    return this.enrichCustomerRow(id, shopId, doc.data());
  }

  private async enrichCustomerRow(id: string, shopId: string, data: any) {
    const [masterKeyDoc, shopDoc] = await Promise.all([
      data.masterKeyId ? this.db.collection('masterKeys').doc(data.masterKeyId).get() : Promise.resolve(null),
      this.db.collection('shops').doc(shopId).get(),
    ]);
    return {
      id,
      shopId,
      ...this.decryptPII({ ...data }),
      masterKey: masterKeyDoc?.exists ? { category: (masterKeyDoc.data() as any).category } : null,
      shop: shopDoc.exists ? { id: shopId, name: (shopDoc.data() as any).name, companyDetails: (shopDoc.data() as any).companyDetails } : null,
    };
  }

  async updateCustomer(shopId: string, id: string, actorUserId: string, dto: UpdateCustomerInput) {
    const ref = this.shops.customers(shopId).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Customer record not found');
    const existing = doc.data() as any;

    return this.applyUpdate(ref, shopId, id, existing, dto, actorUserId);
  }

  async updateSuperCustomer(id: string, dto: UpdateCustomerInput) {
    const shopId = await this.findCustomerShopId(id);
    if (!shopId) throw new NotFoundException('Customer record not found');
    const ref = this.shops.customers(shopId).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Customer record not found');
    const existing = doc.data() as any;

    return this.applyUpdate(ref, shopId, id, existing, dto, null);
  }

  private async applyUpdate(
    ref: FirebaseFirestore.DocumentReference,
    shopId: string,
    id: string,
    existing: any,
    dto: UpdateCustomerInput,
    actorUserId: string | null,
  ) {
    let normalizedPhone: string | undefined;
    if (dto.phone !== undefined) {
      normalizedPhone = normalizePhone(dto.phone) || undefined;
      if (!normalizedPhone) throw new BadRequestException(PHONE_REGEX_MESSAGE);
    }

    const data: Record<string, any> = {
      name: dto.name,
      phone: normalizedPhone,
      address: dto.address,
      idProofType: dto.idProofType,
      reason: dto.reason,
      keyNumber: dto.keyNumber || null,
      keyType: dto.keyType || null,
      vehicleNumber: dto.vehicleNumber || null,
      masterKeyId: dto.masterKeyId || null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      mapsLink: dto.mapsLink || null,
      capturedAddress: dto.capturedAddress || null,
      billAmount: dto.billAmount ?? null,
      vehicleName: dto.vehicleName || null,
      lostKey: dto.lostKey ?? false,
      addKey: dto.addKey ?? false,
      homeOfficeName: dto.homeOfficeName || null,
      vehicleCategory: dto.vehicleCategory || null,
    };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    if (dto.billAmount !== null && dto.billAmount !== undefined && (dto.billAmount as any) !== '' && !existing.billNumber) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      data.billNumber = `BILL-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    if (dto.idProofNumber) {
      data.idProofNumber = this.crypto.encrypt(dto.idProofNumber);
    }

    await ref.update({ ...data, updatedAt: Date.now() });

    if (actorUserId) {
      await this.db.collection('activityLogs').add({
        shopId, userId: actorUserId, action: 'CUSTOMER_UPDATE',
        details: JSON.stringify({ customerId: id, name: data.name ?? existing.name }),
        ipAddress: null, createdAt: Date.now(),
      });
    }

    return this.enrichCustomerRow(id, shopId, (await ref.get()).data());
  }

  // SHOP ADMIN: list/search customers within one shop. `town` (free-text
  // address substring match) is still Algolia-blocked (no per-shop use case
  // for it yet) - see class doc comment for `query`'s Algolia path.
  async getCustomers(shopId: string, query?: string, pageOpts: { cursor?: string; limit?: number; keysOnly?: boolean; town?: string } = {}) {
    const { cursor, limit, keysOnly } = pageOpts;

    if (query && this.algolia.isConfigured) {
      const result = await this.algolia.search('customers', query, { filters: `shopId:${shopId}` });
      if (result.ok) {
        let rows = await Promise.all(result.hits.map((h) => this.enrichCustomerRowById(shopId, h.objectID)));
        let filtered = rows.filter((r): r is NonNullable<typeof r> => r !== null);
        if (keysOnly) filtered = filtered.filter((r) => !!r.keyNumber);
        return limit ? { items: filtered, nextCursor: null } : filtered;
      }
      // Algolia configured but this index isn't ready yet (no Extension/
      // backfill) - fall through to the exact-match path below instead of
      // silently returning zero results for a search that used to work.
    }

    let q = this.shops.customers(shopId) as FirebaseFirestore.Query;
    if (keysOnly) q = q.where('keyNumber', '!=', null);

    if (query) {
      const normalizedQuery = normalizePhone(query);
      const exactField = normalizedQuery ? 'phone' : 'keyNumber';
      const exactValue = normalizedQuery || query;
      q = q.where(exactField, '==', exactValue);
    }

    // A `!=` filter forces Firestore's first orderBy to be on that same
    // field (its own rule, not a stylistic choice) - keysOnly's listing is
    // therefore sorted by keyNumber, not createdAt, when active.
    if (!limit) {
      const snap = keysOnly ? await q.orderBy('keyNumber', 'asc').get() : await q.orderBy('createdAt', 'desc').get();
      return Promise.all(snap.docs.map((d) => this.enrichCustomerRow(d.id, shopId, d.data())));
    }

    q = keysOnly
      ? q.orderBy('keyNumber', 'asc').orderBy('__name__', 'asc').limit(limit + 1)
      : q.orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(limit + 1);
    if (cursor) {
      const cursorDoc = await this.shops.customers(shopId).doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }
    const snap = await q.get();
    const hasMore = snap.docs.length > limit;
    const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const items = await Promise.all(page.map((d) => this.enrichCustomerRow(d.id, shopId, d.data())));
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // SUPER ADMIN: list/search customers platform-wide via a collectionGroup
  // query - see the migration plan's decision #1 for why Customer nests
  // under shops/{shopId}/customers (structural tenant scoping) while still
  // supporting this cross-shop view.
  async getSuperCustomers(query?: string, pageOpts: { cursor?: string; limit?: number; keysOnly?: boolean } = {}) {
    const { cursor, limit, keysOnly } = pageOpts;

    if (query && this.algolia.isConfigured) {
      const result = await this.algolia.search('customers', query, { attributesToRetrieve: ['objectID', 'shopId'] });
      if (result.ok) {
        // shopId is injected by the sync Cloud Function from the Firestore
        // path wildcard (see functions/index.js), not stored on the
        // document itself - a hit missing it means it was indexed before
        // that was added and hasn't been re-synced yet; skip rather than
        // crash on an invalid Firestore path.
        const hitsWithShop = result.hits.filter((h) => typeof h.shopId === 'string' && h.shopId);
        let rows = await Promise.all(hitsWithShop.map((h) => this.enrichCustomerRowById(h.shopId as string, h.objectID)));
        let filtered = rows.filter((r): r is NonNullable<typeof r> => r !== null);
        if (keysOnly) filtered = filtered.filter((r) => !!r.keyNumber);
        return limit ? { items: filtered, nextCursor: null } : filtered;
      }
    }

    let q = this.db.collectionGroup('customers') as FirebaseFirestore.Query;
    if (keysOnly) q = q.where('keyNumber', '!=', null);

    if (query) {
      const normalizedQuery = normalizePhone(query);
      const exactField = normalizedQuery ? 'phone' : 'keyNumber';
      const exactValue = normalizedQuery || query;
      q = q.where(exactField, '==', exactValue);
    }

    const rowShopId = (doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.ref.parent.parent!.id;

    // See getCustomers's identical comment - a `!=` filter forces the first
    // orderBy onto that same field.
    if (!limit) {
      const snap = keysOnly ? await q.orderBy('keyNumber', 'asc').limit(200).get() : await q.orderBy('createdAt', 'desc').limit(200).get();
      return Promise.all(snap.docs.map((d) => this.enrichCustomerRow(d.id, rowShopId(d), d.data())));
    }

    q = keysOnly
      ? q.orderBy('keyNumber', 'asc').orderBy('__name__', 'asc').limit(limit + 1)
      : q.orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(limit + 1);
    if (cursor) {
      const shopId = await this.findCustomerShopId(cursor);
      if (shopId) {
        const cursorDoc = await this.shops.customers(shopId).doc(cursor).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc);
      }
    }
    const snap = await q.get();
    const hasMore = snap.docs.length > limit;
    const page = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const items = await Promise.all(page.map((d) => this.enrichCustomerRow(d.id, rowShopId(d), d.data())));
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }
}
