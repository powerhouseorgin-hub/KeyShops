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

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}
