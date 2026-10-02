import type { CollectionReference, Query, DocumentData, Firestore } from 'firebase-admin/firestore';

// Base for collections that keep the app's "never hard-delete, mark deletedAt instead" convention. Firestore
// has no query-interceptor, so every repository built on this base applies the soft-delete filter itself (the
// backend is the sole data-access point via the Admin SDK, so there is no other path to bypass it).
//
// Deliberately NOT tenant-scoping here - tenancy is structural: shop-owned data is nested under
// shops/{shopId}/... (see ShopScopedRepository below), not filtered at runtime.
export abstract class FirestoreRepository<T extends DocumentData> {
  protected abstract collection(): CollectionReference<T>;

  // Soft-delete convention: every doc gets `deletedAt: number | null`.
  // Firestore has no `IS NULL`-in-a-composite-index gotcha the way some
  // NoSQL stores do, but every reader must still remember to add this
  // filter explicitly - there's no automatic injection.
  protected activeQuery(): Query<T> {
    return this.collection().where('deletedAt', '==', null) as Query<T>;
  }

  async findById(id: string): Promise<(T & { id: string }) | null> {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as T;
    if ((data as any).deletedAt) return null;
    return { ...data, id: doc.id };
  }

  // Bypasses the soft-delete filter - for internal use only (e.g. a Super
  // Admin "restore" screen, or cascade logic that must see everything).
  async findByIdIncludingDeleted(id: string): Promise<(T & { id: string }) | null> {
    const doc = await this.collection().doc(id).get();
    if (!doc.exists) return null;
    return { ...(doc.data() as T), id: doc.id };
  }

  async create(id: string | null, data: Omit<T, 'deletedAt' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Date.now();
    const payload = { ...data, deletedAt: null, createdAt: now, updatedAt: now } as unknown as T;
    if (id) {
      await this.collection().doc(id).set(payload);
      return id;
    }
    const ref = await this.collection().add(payload);
    return ref.id;
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    await this.collection().doc(id).update({ ...data, updatedAt: Date.now() } as any);
  }

  // Soft delete: stamps deletedAt instead of removing the document.
  async softDelete(id: string): Promise<void> {
    await this.collection().doc(id).update({ deletedAt: Date.now(), updatedAt: Date.now() } as any);
  }

  async restore(id: string): Promise<void> {
    await this.collection().doc(id).update({ deletedAt: null, updatedAt: Date.now() } as any);
  }
}

// Base for data that lives under shops/{shopId}/{subcollection} - tenant
// scoping is structural (the parent path IS the scope), so there's no
// separate "inject shopId filter" step needed.
export abstract class ShopScopedRepository<T extends DocumentData> extends FirestoreRepository<T> {
  constructor(protected readonly db: Firestore, protected readonly shopId: string) {
    super();
  }
}
