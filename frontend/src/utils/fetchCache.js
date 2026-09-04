// Mirrors backend/src/common/ttl-cache.ts on the frontend. App.jsx renders
// each dashboard screen by conditionally mounting it on `activeTab` (see the
// `activeTab === 'dashboard' &&` gates around each view's render site), so
// switching Dashboard -> Shops -> Dashboard fully unmounts and remounts each
// component - every view's local state (including its own per-view cache
// variable, e.g. DashboardView's `dashboardCache`) is lost and re-fetched
// from scratch on every single revisit, even seconds later. Those per-view
// caches only ever avoided a blank loading spinner (show the stale value,
// then silently refetch) - they never skipped the network/DB round-trip
// itself, which is what actually caused "switching screens reloads
// everything again."
//
// This is a plain in-memory Map (same rationale as the backend's TtlCache -
// no other tab/process needs to share this, and nothing needs it to survive
// a reload), keyed by caller-chosen strings so each view can scope its own
// cache (e.g. by category, by search filter) without colliding with others.
const store = new Map();

// Returns the cached value only if it's within `ttlMs` of when it was set -
// undefined otherwise (never fetched, or stale). Callers use this to decide
// whether to skip a fetch entirely, not just to avoid a loading flash.
export function getFresh(key, ttlMs) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > ttlMs) return undefined;
  return entry.value;
}

// Returns the cached value regardless of age (or undefined if never set) -
// for the existing "show something instantly, then refresh in the
// background" pattern, kept as-is where a fetch does still need to run.
export function getStale(key) {
  const entry = store.get(key);
  return entry ? entry.value : undefined;
}

export function setCache(key, value) {
  store.set(key, { value, fetchedAt: Date.now() });
}

export function invalidate(key) {
  store.delete(key);
}
