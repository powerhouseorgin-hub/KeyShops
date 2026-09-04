// A minimal in-process cache for read-mostly, rarely-changing data (shop
// categories, product types, platform support config) that's re-fetched from
// the database on nearly every screen load. Deliberately NOT Redis: this app
// runs a single server instance, so there's no other process that needs to
// share cache state, and no state that needs to survive a restart - a plain
// in-memory Map gives the same speed-up with no new infrastructure to run,
// pay for, or secure. If this ever becomes a multi-instance deployment,
// revisit with a real shared cache then.
//
// Callers are expected to explicitly `invalidate()` the relevant key from
// every mutation of the underlying data (see ShopCategoryService,
// ProductTypeService, ReportService.updateSupportConfig) - `ttlMs` is a
// safety net for staleness, not the primary consistency mechanism.
export class TtlCache<T = any> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  // Optional cap for callers with a high-cardinality key space (e.g.
  // GeoController's per-coordinate reverse-geocode cache) where the number
  // of distinct keys isn't small and bounded the way "one row per shop
  // category" is - every other existing caller omits this and keeps its
  // prior unbounded behavior exactly as before. Evicts the
  // longest-untouched entry (Map iteration order = insertion order, and
  // `get` below re-inserts on hit to bump it to the back), a plain
  // in-process LRU with no extra dependency.
  constructor(private readonly maxSize?: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    if (this.maxSize) {
      // Bump to most-recently-used.
      this.store.delete(key);
      this.store.set(key, entry);
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.delete(key); // re-insert to bump to the back, same as get() above
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.maxSize && this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}
