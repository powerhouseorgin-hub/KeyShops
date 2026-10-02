import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { MasterKeyRepository } from '../customer/master-key.repository';

// Firestore port of KeyService - the Super Admin's direct "Blank Key
// Catalog" management (create/rename/delete a MasterKey row directly,
// separate from the customer-registration flow that upserts one
// automatically - see customer-registration.service.ts).
//
// `search` here is a genuine in-memory substring filter, not the
// exact-match-only workaround used for Customer/Shop/Promotion search
// elsewhere - a key catalog (global or per-shop) is small enough, and capped at a 500-row
// safety limit, that filtering the fetched batch in application code is both correct and cheap. The one edge
// case this doesn't cover: a search term matching a key ranked past the 500th alphabetically would be missed.
const MAX_ROWS = 500;

export interface CreateKeyInput {
  keyNumber: string;
  category: string;
  backImageUrl?: string;
}

export interface UpdateKeyInput {
  keyNumber?: string;
  category?: string;
  backImageUrl?: string;
}

@Injectable()
export class FirestoreKeyService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly masterKeys: MasterKeyRepository,
  ) {}

  private get db() {
    return this.firestore.db;
  }

  private col() {
    return this.db.collection('masterKeys');
  }

  // SUPER ADMIN: create a global (shopId: null) blank key.
  async createKey(dto: CreateKeyInput) {
    const id = MasterKeyRepository.docId(null, dto.keyNumber);
    const existing = await this.col().doc(id).get();
    if (existing.exists && !(existing.data() as any).deletedAt) {
      throw new BadRequestException(`Key "${dto.keyNumber}" already exists in the catalog`);
    }
    const now = Date.now();
    const data = {
      keyNumber: dto.keyNumber, category: dto.category, backImageUrl: dto.backImageUrl || null,
      shopId: null, deletedAt: null, createdAt: now, updatedAt: now,
    };
    await this.col().doc(id).set(data);
    return { id, ...data };
  }

  // SUPER ADMIN: update a key's category/image, or rename its keyNumber.
  // Renaming changes the document's own id (deterministic from shopId +
  // keyNumber - see MasterKeyRepository.docId), since there's no separate
  // surrogate id: `id` moves to a new value and any Customer.masterKeyId
  // already pointing at the previous id goes stale. This is a rare admin action
  // (renaming a not-yet-issued blank key's catalog entry); if it is ever used
  // on a key that customers already reference, those customers need a rewrite
  // pass.
  async updateKey(id: string, dto: UpdateKeyInput) {
    const ref = this.col().doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Key not found');
    const existing = doc.data() as any;

    if (dto.keyNumber && dto.keyNumber !== existing.keyNumber) {
      const newId = MasterKeyRepository.docId(existing.shopId, dto.keyNumber);
      const collision = await this.col().doc(newId).get();
      if (collision.exists && !(collision.data() as any).deletedAt) {
        throw new BadRequestException(`Key "${dto.keyNumber}" already exists in the catalog`);
      }
      const now = Date.now();
      const data = {
        keyNumber: dto.keyNumber,
        category: dto.category ?? existing.category,
        backImageUrl: dto.backImageUrl !== undefined ? dto.backImageUrl : existing.backImageUrl,
        shopId: existing.shopId, deletedAt: null, createdAt: existing.createdAt, updatedAt: now,
      };
      await this.db.runTransaction(async (tx) => {
        tx.set(this.col().doc(newId), data);
        tx.delete(ref);
      });
      return { id: newId, ...data };
    }

    const data: Record<string, any> = { updatedAt: Date.now() };
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.backImageUrl !== undefined) data.backImageUrl = dto.backImageUrl;
    await ref.update(data);
    return { id, ...existing, ...data };
  }

  // SUPER ADMIN: hard delete - matches the original exactly (MasterKey has
  // a deletedAt column but deleteKey() never used it; not "fixed" into a
  // soft delete here either, for the same behavior-parity reason).
  async deleteKey(id: string) {
    const doc = await this.col().doc(id).get();
    if (!doc.exists) throw new NotFoundException('Key not found');
    await doc.ref.delete();
    return { success: true };
  }

  private matchesSearch(row: any, search?: string) {
    if (!search) return true;
    const q = search.toLowerCase();
    return (row.keyNumber || '').toLowerCase().includes(q) || (row.category || '').toLowerCase().includes(q);
  }

  private async enrichKeyRow(id: string, data: any) {
    const [shopDoc, customersSnap] = await Promise.all([
      data.shopId ? this.db.collection('shops').doc(data.shopId).get() : Promise.resolve(null),
      this.db.collectionGroup('customers').where('masterKeyId', '==', id).limit(20).get(),
    ]);
    return {
      id,
      ...data,
      shop: shopDoc?.exists ? { id: data.shopId, name: (shopDoc.data() as any).name } : null,
      customers: customersSnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name, phone: (d.data() as any).phone })),
    };
  }

  // SUPER ADMIN: cross-shop key catalog (global + every shop's keys).
  async getKeys(search?: string, pageOpts: { cursor?: string; limit?: number } = {}) {
    const { cursor, limit } = pageOpts;
    const snap = await this.col().orderBy('keyNumber', 'asc').limit(MAX_ROWS).get();
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((r) => this.matchesSearch(r, search));

    if (!limit) {
      return Promise.all(rows.slice(0, MAX_ROWS).map((r) => this.enrichKeyRow(r.id, r)));
    }
    const startIndex = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
    const page = rows.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < rows.length;
    const items = await Promise.all(page.map((r) => this.enrichKeyRow(r.id, r)));
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // SUPER ADMIN browsing one shop's catalog (e.g. registering a customer on
  // that shop's behalf) and SHOP ADMIN's own key search - same shape,
  // unpaginated flat array, matching the original.
  async getShopKeys(shopId: string, search?: string) {
    const snap = await this.db.collection('masterKeys').where('shopId', '==', shopId).orderBy('keyNumber', 'asc').limit(MAX_ROWS).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((r) => this.matchesSearch(r, search));
  }
}
