import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
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
  saleNumber?: string;
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

const LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];
const MAX_AMOUNT = 1_000_000_000;

@Injectable()
export class FirestoreVehicleSaleService {
  constructor(private readonly firestore: FirestoreService) {}

  private col(shopId: string) {
    return this.firestore.db.collection('shops').doc(shopId).collection('vehicleSales');
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

  async create(shopId: string, userId: string, dto: CreateVehicleSaleInput) {
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
    const customNumber = this.text(dto, 'saleNumber', 30);

    const db = this.firestore.db;
    const shopRef = db.collection('shops').doc(shopId);
    const saleRef = this.col(shopId).doc();
    const now = Date.now();

    // Sequential per-shop receipt number, allocated in the same transaction that writes the sale so two
    // simultaneous sales can never share one.
    const saleNumber = await db.runTransaction(async (tx) => {
      const shopSnap = await tx.get(shopRef);
      if (!shopSnap.exists) throw new NotFoundException('Shop not found');
      const seq = ((shopSnap.data() as any).vehicleSaleSeq || 0) + 1;
      const number = customNumber || `VS-${String(seq).padStart(4, '0')}`;
      tx.update(shopRef, { vehicleSaleSeq: seq });
      tx.set(saleRef, { ...fields, saleNumber: number, createdById: userId, createdAt: now, updatedAt: now, deletedAt: null });
      return number;
    });

    await this.firestore.db.collection('activityLogs').add({
      shopId,
      userId,
      action: 'VEHICLE_SALE_CREATE',
      details: JSON.stringify({ saleNumber, registrationNumber: fields.registrationNumber, saleId: saleRef.id }),
      ipAddress: null,
      createdAt: now,
    }).catch((err) => console.error('Failed to write VEHICLE_SALE_CREATE activity log', err));

    return { id: saleRef.id, ...fields, saleNumber, createdById: userId, createdAt: now, updatedAt: now };
  }

  async list(shopId: string, limit = 50) {
    const capped = Math.min(100, Math.max(1, Math.floor(limit) || 50));
    // Sort only - a `deletedAt == null` filter together with this orderBy would need a composite index,
    // and nothing can soft-delete a sale yet, so deleted rows are just dropped in memory.
    const snap = await this.col(shopId).orderBy('createdAt', 'desc').limit(capped).get();
    return snap.docs.filter((d) => !(d.data() as any).deletedAt).map((d) => ({ id: d.id, ...d.data() }));
  }

  async get(shopId: string, id: string) {
    const doc = await this.col(shopId).doc(id).get();
    if (!doc.exists || (doc.data() as any).deletedAt) throw new NotFoundException('Vehicle sale not found');
    return { id: doc.id, ...doc.data() };
  }
}
