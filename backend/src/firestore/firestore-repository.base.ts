import type { CollectionReference, Query, DocumentData, Firestore } from 'firebase-admin/firestore';

// Replaces TenantService's Prisma extension (soft-delete filtering) for
// collections that keep the app's "never hard-delete, mark deletedAt
// instead" convention. There is no Firestore query-interceptor equivalent,
// so every repository built on this base applies the same filter itself -
// see the migration plan's decision #9 for why this is fine (the backend
// is the sole data-access point via the Admin SDK; there's no other choke
// point to bypass).
//
// Deliberately NOT tenant-scoping here (unlike TenantService's
// TENANT_SCOPED_MODELS) - that half of the old middleware is replaced
// structurally by nesting shop-owned data under shops/{shopId}/... instead
// (see ShopScopedRepository below), not by a runtime filter.
export abstract class FirestoreRepository<T extends DocumentData> {
  protected abstract collection(): CollectionReference<T>;

  // Soft-delete convention: every doc gets `deletedAt: number | null`.
  // Firestore has no `IS NULL`-in-a-composite-index gotcha the way some
  // NoSQL stores do, but every reader must still remember to add this
  // filter explicitly - there's no automatic injection like the old
  // Prisma extension provided.
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

  // Soft delete - matches the old Prisma extension's delete->update rewrite.
  async softDelete(id: string): Promise<void> {
    await this.collection().doc(id).update({ deletedAt: Date.now(), updatedAt: Date.now() } as any);
  }

  async restore(id: string): Promise<void> {
    await this.collection().doc(id).update({ deletedAt: null, updatedAt: Date.now() } as any);
  }
}

// Base for data that lives under shops/{shopId}/{subcollection} - tenant
// scoping is structural (the parent path IS the scope), so there's no
// separate "inject shopId filter" step the way the old middleware needed.
export abstract class ShopScopedRepository<T extends DocumentData> extends FirestoreRepository<T> {
  constructor(protected readonly db: Firestore, protected readonly shopId: string) {
    super();
  }
}
