import { BadRequestException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';

// Shared shape for ShopCategory, ProductType, and KeyType - all three are
// Super-Admin-curated dropdown lists with identical semantics in the old
// schema: `name` unique (case-insensitive), soft-deleted, and (for
// ShopCategory only) a `sortOrder`. One generic class instead of three
// near-duplicate files - subclassed per collection below.
export interface NamedReferenceItem {
  id: string;
  name: string;
  sortOrder?: number;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export class NamedReferenceListService {
  constructor(private readonly db: Firestore, private readonly collectionName: string, private readonly hasSortOrder = false) {}

  private col() {
    return this.db.collection(this.collectionName);
  }

  async getAll(): Promise<NamedReferenceItem[]> {
    let q = this.col().where('deletedAt', '==', null) as FirebaseFirestore.Query;
    q = this.hasSortOrder ? q.orderBy('sortOrder', 'asc') : q.orderBy('name', 'asc');
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  }

  // Revives a soft-deleted item with the same name instead of inserting a new
  // one: the doc id is derived from the lowercased name, so a straight insert
  // after a soft delete would collide with the existing (deleted) document.
  async create(name: string): Promise<NamedReferenceItem> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name is required');
    const docId = trimmed.toLowerCase().replace(/\s+/g, '-');
    const ref = this.col().doc(docId);
    const existing = await ref.get();
    const now = Date.now();

    if (existing.exists && !(existing.data() as any).deletedAt) {
      throw new BadRequestException(`"${trimmed}" already exists`);
    }

    let sortOrder: number | undefined;
    if (this.hasSortOrder) {
      const maxSnap = await this.col().orderBy('sortOrder', 'desc').limit(1).get();
      sortOrder = maxSnap.empty ? 0 : ((maxSnap.docs[0].data() as any).sortOrder ?? 0) + 1;
    }

    const payload: any = { name: trimmed, deletedAt: null, createdAt: existing.exists ? (existing.data() as any).createdAt : now, updatedAt: now };
    if (this.hasSortOrder) payload.sortOrder = sortOrder;
    await ref.set(payload);
    return { id: docId, ...payload };
  }

  async update(id: string, name: string): Promise<void> {
    await this.col().doc(id).update({ name: name.trim(), updatedAt: Date.now() });
  }

  async softDelete(id: string): Promise<void> {
    await this.col().doc(id).update({ deletedAt: Date.now(), updatedAt: Date.now() });
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const batch = this.db.batch();
    orderedIds.forEach((id, index) => {
      batch.update(this.col().doc(id), { sortOrder: index, updatedAt: Date.now() });
    });
    await batch.commit();
  }
}
