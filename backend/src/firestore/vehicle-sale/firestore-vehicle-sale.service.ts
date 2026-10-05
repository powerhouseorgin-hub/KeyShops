import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { FirestoreService } from '../firestore.service';
import { FirebaseFileService } from '../storage/firebase-file.service';
import { normalizePhone } from '../../common/validators/phone';

// A vehicle (bike/car) sale recorded by a Shop Admin: the data behind the "Delivery Receipt" invoice
// (seller, buyer, vehicle, price / advance / balance, witness). Stored per shop under
// shops/{shopId}/vehicleSales/{id} - the same structural tenant scoping the customers use, so one shop's
// sales can never be read through another shop's routes.
//
// The request body is a plain interface (no class-validator), so every field is read explicitly,
// type-checked and length-limited here - nothing from the body is spread into the document, and the
// balance is always recomputed server-side (never trusted from the client).
export interface CreateVehicleSaleInput {
  saleDate?: string; // YYYY-MM-DD
  saleTime?: string; // HH:MM (24h)
  sellerName: string;
  sellerAddress?: string;
  sellerPhone?: string;
  buyerName: string;
  buyerAddress?: string;
  buyerPhone?: string;
  registrationNumber: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleName?: string;
  chassisNumber?: string;
  engineNumber?: string;
  vehiclePrice: number;
  advanceAmount?: number;
  officeCommission?: number;
  balanceLastDate?: string; // YYYY-MM-DD
  witnessName?: string;
  witnessAddress?: string;
  notes?: string;
  lang?: string;
}

// The receipt number is never supplied by the client: it is generated here as "VS-" + 10 random digits (first digit
// non-zero) and made globally unique by an index document, vehicleSaleNumbers/{number}, that is created in the same
// transaction as the sale. If a generated number already exists the transaction is abandoned and a new one is drawn.
export const SALE_NUMBER_PREFIX = 'VS-';
export function generateSaleNumber(): string {
  return `${SALE_NUMBER_PREFIX}${randomInt(1, 10)}${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
}
const MAX_NUMBER_ATTEMPTS = 10;

// Photos of the vehicle / the handover attached to a sale. At most MAX_SALE_PHOTOS per sale - enforced here, so it
// holds whatever the client does. Each is a JPEG, PNG or WebP of at most 5 MB (the app resizes before uploading).
export const MAX_SALE_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Who a sale belongs to. A Shop Admin's sales live under their shop (shops/{shopId}/vehicleSales); a Super Admin has no
// shop, so their own sales live under their user document (users/{uid}/vehicleSales) - both are collections named
// "vehicleSales", which lets one collection-group query read every sale on the platform for the review screen.
// A plain string is treated as a shop id (the original, shop-only signature).
export type SaleOwner = { type: 'SHOP'; id: string } | { type: 'SUPER_ADMIN'; id: string };
const asOwner = (o: string | SaleOwner): SaleOwner => (typeof o === 'string' ? { type: 'SHOP', id: o } : o);
// Ids are Firestore auto-ids (letters and digits) or, for records migrated from the original database, UUIDs (with hyphens).
const ID = '[A-Za-z0-9_-]{1,64}';
const ID_ONLY = new RegExp(`^${ID}$`);
const SALE_PATH = new RegExp(`^(shops|users)/${ID}/vehicleSales/${ID}$`);

export interface SalePhoto { key: string; url: string; size: number; createdAt: number; }

// The seller's and buyer's hand-drawn signatures: one PNG each, stored in file storage like the photos (the sale only holds the
// key and URL). Signing again replaces the previous file. PNG only - the signature pad exports PNG - checked by its magic bytes,
// not just the declared type.
export const SIGNATURE_PARTIES = ['seller', 'buyer'] as const;
export type SignatureParty = (typeof SIGNATURE_PARTIES)[number];
const MAX_SIGNATURE_BYTES = 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];
const MAX_AMOUNT = 1_000_000_000;

@Injectable()
export class FirestoreVehicleSaleService {
  constructor(private readonly firestore: FirestoreService, private readonly files: FirebaseFileService) {}

  private parentRef(owner: SaleOwner) {
    return this.firestore.db.collection(owner.type === 'SHOP' ? 'shops' : 'users').doc(owner.id);
  }

  private col(owner: SaleOwner) {
    return this.parentRef(owner).collection('vehicleSales');
  }

  private text(dto: any, key: string, max: number, required = false): string | null {
    const raw = dto?.[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required) throw new BadRequestException(`${key} is required`);
      return null;
    }
    if (typeof raw !== 'string') throw new BadRequestException(`${key} must be text`);
    const value = raw.trim();
    if (!value) {
      if (required) throw new BadRequestException(`${key} is required`);
      return null;
    }
    if (value.length > max) throw new BadRequestException(`${key} must be at most ${max} characters`);
    return value;
  }

  private amount(dto: any, key: string, required = false): number | null {
    const raw = dto?.[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required) throw new BadRequestException(`${key} is required`);
      return null;
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
      throw new BadRequestException(`${key} must be a number between 0 and ${MAX_AMOUNT}`);
    }
    return Math.round(n * 100) / 100;
  }

  private dateString(dto: any, key: string): string | null {
    const value = this.text(dto, key, 10);
    if (value === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
      throw new BadRequestException(`${key} must be a date in YYYY-MM-DD format`);
    }
    return value;
  }

  private timeString(dto: any, key: string): string | null {
    const value = this.text(dto, key, 5);
    if (value === null) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new BadRequestException(`${key} must be a time in HH:MM format`);
    }
    return value;
  }

  private phone(dto: any, key: string): string | null {
    const value = this.text(dto, key, 20);
    if (value === null) return null;
    // A valid Indian mobile is stored in the canonical 10-digit form (what WhatsApp sharing expects);
    // anything else is kept as digits only so a non-Indian number is not silently dropped.
    const normalized = normalizePhone(value);
    if (normalized) return normalized;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 6) throw new BadRequestException(`${key} is not a valid phone number`);
    return digits;
  }

  async create(ownerArg: string | SaleOwner, userId: string, dto: CreateVehicleSaleInput) {
    const owner = asOwner(ownerArg);
    const vehiclePrice = this.amount(dto, 'vehiclePrice', true) as number;
    if (vehiclePrice <= 0) throw new BadRequestException('vehiclePrice must be greater than 0');
    const advanceAmount = this.amount(dto, 'advanceAmount') ?? 0;
    if (advanceAmount > vehiclePrice) throw new BadRequestException('advanceAmount cannot be more than the vehicle price');

    const lang = this.text(dto, 'lang', 5) || 'en';
    if (!LANGS.includes(lang)) throw new BadRequestException(`lang must be one of ${LANGS.join(', ')}`);

    const fields = {
      saleDate: this.dateString(dto, 'saleDate') || new Date().toISOString().slice(0, 10),
      saleTime: this.timeString(dto, 'saleTime'),
      sellerName: this.text(dto, 'sellerName', 120, true),
      sellerAddress: this.text(dto, 'sellerAddress', 300),
      sellerPhone: this.phone(dto, 'sellerPhone'),
      buyerName: this.text(dto, 'buyerName', 120, true),
      buyerAddress: this.text(dto, 'buyerAddress', 300),
      buyerPhone: this.phone(dto, 'buyerPhone'),
      registrationNumber: this.text(dto, 'registrationNumber', 40, true),
      vehicleModel: this.text(dto, 'vehicleModel', 80),
      vehicleColor: this.text(dto, 'vehicleColor', 40),
      vehicleName: this.text(dto, 'vehicleName', 100),
      chassisNumber: this.text(dto, 'chassisNumber', 60),
      engineNumber: this.text(dto, 'engineNumber', 60),
      vehiclePrice,
      advanceAmount,
      // Always derived here - a client-supplied balance is ignored.
      balanceAmount: Math.round((vehiclePrice - advanceAmount) * 100) / 100,
      officeCommission: this.amount(dto, 'officeCommission'),
      balanceLastDate: this.dateString(dto, 'balanceLastDate'),
      witnessName: this.text(dto, 'witnessName', 120),
      witnessAddress: this.text(dto, 'witnessAddress', 300),
      notes: this.text(dto, 'notes', 500),
      lang,
    };
    // (A `saleNumber` in the request body is deliberately ignored - the server owns the numbering.)

    const db = this.firestore.db;
    const parentRef = this.parentRef(owner);
    const saleRef = this.col(owner).doc();
    const now = Date.now();

    let saleNumber: string | null = null;
    let ownerFields: { ownerType: string; ownerId: string; shopId: string | null; ownerName: string } = { ownerType: owner.type, ownerId: owner.id, shopId: owner.type === 'SHOP' ? owner.id : null, ownerName: '' };
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS && !saleNumber; attempt++) {
      const candidate = generateSaleNumber();
      const indexRef = db.collection('vehicleSaleNumbers').doc(candidate);
      // Claim the number and write the sale atomically: either both exist or neither does, and two simultaneous
      // sales that drew the same number cannot both commit (the loser's transaction retries, finds the index
      // document, and draws again).
      saleNumber = await db.runTransaction(async (tx) => {
        const [parentSnap, indexSnap] = await Promise.all([tx.get(parentRef), tx.get(indexRef)]);
        if (!parentSnap.exists) throw new NotFoundException(owner.type === 'SHOP' ? 'Shop not found' : 'User not found');
        if (indexSnap.exists) return null;
        // ownerName is copied onto the sale so the review screen can show who sold it without extra lookups.
        const ownerName = String((parentSnap.data() as any)?.name || '') || (owner.type === 'SUPER_ADMIN' ? 'Super Admin' : '');
        ownerFields = { ownerType: owner.type, ownerId: owner.id, shopId: owner.type === 'SHOP' ? owner.id : null, ownerName };
        tx.set(indexRef, { shopId: ownerFields.shopId, ownerId: owner.id, saleId: saleRef.id, createdAt: now });
        tx.set(saleRef, { ...fields, ...ownerFields, saleNumber: candidate, createdById: userId, createdAt: now, updatedAt: now, deletedAt: null });
        return candidate;
      });
    }
    if (!saleNumber) throw new InternalServerErrorException('Could not allocate a receipt number, please try again');

    await this.firestore.db.collection('activityLogs').add({
      shopId: owner.type === 'SHOP' ? owner.id : null,
      userId,
      action: 'VEHICLE_SALE_CREATE',
      details: JSON.stringify({ saleNumber, registrationNumber: fields.registrationNumber, saleId: saleRef.id }),
      ipAddress: null,
      createdAt: now,
    }).catch((err) => console.error('Failed to write VEHICLE_SALE_CREATE activity log', err));

    return { id: saleRef.id, ...fields, ...ownerFields, saleNumber, createdById: userId, createdAt: now, updatedAt: now };
  }

  // Adds one photo to a sale. The count is checked before the upload (so a full sale never receives a file) and
  // again inside the transaction that records it (so two simultaneous uploads cannot both take the last slot);
  // if that second check loses, the just-uploaded file is deleted again.
  async addPhoto(ownerArg: string | SaleOwner, saleId: string, file: { originalname: string; buffer: Buffer; size: number; mimetype: string } | undefined) {
    if (!file || !file.buffer?.length) throw new BadRequestException('A photo file is required');
    if (!PHOTO_TYPES.includes(file.mimetype)) throw new BadRequestException('Only JPEG, PNG or WebP photos are accepted');
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException('Each photo must be 5 MB or smaller');

    const owner = asOwner(ownerArg);
    const saleRef = this.col(owner).doc(saleId);
    const before = await saleRef.get();
    if (!before.exists || (before.data() as any).deletedAt) throw new NotFoundException('Vehicle sale not found');
    if (((before.data() as any).photos || []).length >= MAX_SALE_PHOTOS) {
      throw new BadRequestException(`A sale can have at most ${MAX_SALE_PHOTOS} photos`);
    }

    const upload = await this.files.uploadLongLivedFile(file.originalname || 'photo.jpg', file.buffer, owner.type === 'SHOP' ? owner.id : 'platform');
    const photo: SalePhoto = { key: upload.fileKey, url: upload.fileUrl, size: file.size, createdAt: Date.now() };

    try {
      const photos = await this.firestore.db.runTransaction(async (tx) => {
        const snap = await tx.get(saleRef);
        const current: SalePhoto[] = ((snap.data() as any)?.photos) || [];
        if (current.length >= MAX_SALE_PHOTOS) throw new BadRequestException(`A sale can have at most ${MAX_SALE_PHOTOS} photos`);
        const next = [...current, photo];
        tx.update(saleRef, { photos: next, updatedAt: Date.now() });
        return next;
      });
      return { id: saleId, photos };
    } catch (err) {
      await this.files.deleteFile(upload.fileKey);
      throw err;
    }
  }

  // Stores (or replaces) the seller's or buyer's signature on a sale. Returns the sale id and its current signatures.
  async addSignature(ownerArg: string | SaleOwner, saleId: string, partyRaw: string, file: { originalname: string; buffer: Buffer; size: number; mimetype: string } | undefined) {
    if (!(SIGNATURE_PARTIES as readonly string[]).includes(partyRaw)) throw new BadRequestException('party must be seller or buyer');
    const party = partyRaw as SignatureParty;
    if (!file || !file.buffer?.length) throw new BadRequestException('A signature image is required');
    if (file.mimetype !== 'image/png' || file.buffer.length < PNG_MAGIC.length || !file.buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      throw new BadRequestException('The signature must be a PNG image');
    }
    if (file.size > MAX_SIGNATURE_BYTES) throw new BadRequestException('The signature image must be 1 MB or smaller');

    const owner = asOwner(ownerArg);
    const saleRef = this.col(owner).doc(saleId);
    const before = await saleRef.get();
    if (!before.exists || (before.data() as any).deletedAt) throw new NotFoundException('Vehicle sale not found');

    const upload = await this.files.uploadLongLivedFile(`${party}-signature.png`, file.buffer, owner.type === 'SHOP' ? owner.id : 'platform');
    const field = `${party}Signature`;
    const signature: SalePhoto = { key: upload.fileKey, url: upload.fileUrl, size: file.size, createdAt: Date.now() };
    let previousKey: string | null = null;
    try {
      const sale = await this.firestore.db.runTransaction(async (tx) => {
        const snap = await tx.get(saleRef);
        const data: any = snap.data() || {};
        previousKey = data[field]?.key || null;
        tx.update(saleRef, { [field]: signature, updatedAt: Date.now() });
        return data;
      });
      if (previousKey) await this.files.deleteFile(previousKey);
      return { id: saleId, sellerSignature: party === 'seller' ? signature : sale.sellerSignature || null, buyerSignature: party === 'buyer' ? signature : sale.buyerSignature || null };
    } catch (err) {
      await this.files.deleteFile(upload.fileKey);
      throw err;
    }
  }

  async list(ownerArg: string | SaleOwner, limit = 50) {
    const owner = asOwner(ownerArg);
    const capped = Math.min(100, Math.max(1, Math.floor(limit) || 50));
    // Sort only - a `deletedAt == null` filter together with this orderBy would need a composite index,
    // and nothing can soft-delete a sale yet, so deleted rows are just dropped in memory.
    const snap = await this.col(owner).orderBy('createdAt', 'desc').limit(capped).get();
    return snap.docs.filter((d) => !(d.data() as any).deletedAt).map((d) => ({ id: d.id, ...d.data() }));
  }

  // One owner's sales in pages (the shop's "All Sales" screen): newest first, `nextCursor` is the path of the last sale of
  // the page. A cursor must point inside THIS owner's own collection - one pointing anywhere else is refused.
  async listPage(ownerArg: string | SaleOwner, opts: { limit?: number; cursor?: string } = {}) {
    const owner = asOwner(ownerArg);
    const limit = Math.min(100, Math.max(1, Math.floor(Number(opts.limit)) || 30));
    const prefix = `${owner.type === 'SHOP' ? 'shops' : 'users'}/${owner.id}/vehicleSales/`;
    if (opts.cursor && !(SALE_PATH.test(opts.cursor) && opts.cursor.startsWith(prefix))) throw new BadRequestException('Invalid cursor');
    let q: FirebaseFirestore.Query = this.col(owner).orderBy('createdAt', 'desc');
    if (opts.cursor) {
      const after = await this.firestore.db.doc(opts.cursor).get();
      if (after.exists) q = q.startAfter(after);
    }
    const snap = await q.limit(limit + 1).get();
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit).filter((d) => !(d.data() as any).deletedAt);
    return { items: docs.map((d) => ({ id: d.id, path: d.ref.path, ...d.data() })), nextCursor: hasMore && docs.length ? docs[docs.length - 1].ref.path : null };
  }

  async get(ownerArg: string | SaleOwner, id: string) {
    const doc = await this.col(asOwner(ownerArg)).doc(id).get();
    if (!doc.exists || (doc.data() as any).deletedAt) throw new NotFoundException('Vehicle sale not found');
    return { id: doc.id, ...doc.data() };
  }

  // SUPER ADMIN review: every sale on the platform (every shop's, plus the Super Admin's own), newest first, in pages.
  // `shopId` narrows it to one shop, or to the Super Admin's own sales when it is the literal "SUPER_ADMIN".
  // The cursor is the path of the last sale of the previous page, so paging is exact even when sales share a timestamp.
  // Sales saved before owners were recorded are still returned: their owner is read from the document's path.
  async listAll(opts: { limit?: number; cursor?: string; shopId?: string } = {}) {
    const limit = Math.min(100, Math.max(1, Math.floor(Number(opts.limit)) || 30));
    // a shop id, or the literal SUPER_ADMIN (the Super Admin's own sales)
    if (opts.shopId && opts.shopId !== 'SUPER_ADMIN' && !ID_ONLY.test(opts.shopId)) throw new BadRequestException('Invalid shopId');
    if (opts.cursor && !SALE_PATH.test(opts.cursor)) throw new BadRequestException('Invalid cursor');
    const db = this.firestore.db;
    let q: FirebaseFirestore.Query = db.collectionGroup('vehicleSales');
    if (opts.shopId) q = q.where('shopId', '==', opts.shopId === 'SUPER_ADMIN' ? null : opts.shopId);
    q = q.orderBy('createdAt', 'desc');
    if (opts.cursor) {
      const after = await db.doc(opts.cursor).get();
      if (after.exists) q = q.startAfter(after);
    }
    const snap = await q.limit(limit + 1).get();
    const hasMore = snap.docs.length > limit;
    const docs = snap.docs.slice(0, limit).filter((d) => !(d.data() as any).deletedAt);

    // Owner info for sales that predate the owner fields: derive it from the path, and look up shop names in one batch.
    const legacyShopIds = new Set<string>();
    const rows = docs.map((d) => {
      const data = d.data() as any;
      const parentCol = d.ref.parent.parent?.parent?.id; // 'shops' | 'users'
      const ownerId = d.ref.parent.parent?.id || '';
      const ownerType = data.ownerType || (parentCol === 'users' ? 'SUPER_ADMIN' : 'SHOP');
      const shopId = data.shopId !== undefined ? data.shopId : ownerType === 'SHOP' ? ownerId : null;
      if (!data.ownerName && ownerType === 'SHOP' && shopId) legacyShopIds.add(shopId);
      return { id: d.id, path: d.ref.path, ...data, ownerType, ownerId: data.ownerId || ownerId, shopId };
    });
    if (legacyShopIds.size) {
      const shopSnaps = await db.getAll(...[...legacyShopIds].map((id) => db.collection('shops').doc(id)));
      const names = new Map(shopSnaps.map((x) => [x.id, String((x.data() as any)?.name || '')]));
      rows.forEach((r: any) => { if (!r.ownerName) r.ownerName = r.ownerType === 'SUPER_ADMIN' ? 'Super Admin' : names.get(r.shopId) || ''; });
    }
    rows.forEach((r: any) => { if (!r.ownerName && r.ownerType === 'SUPER_ADMIN') r.ownerName = 'Super Admin'; });

    return { items: rows, nextCursor: hasMore && docs.length ? docs[docs.length - 1].ref.path : null };
  }
}
