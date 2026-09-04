import { TtlCache } from '../common/ttl-cache';

// Caches JwtStrategy.validate()'s result - a real DB lookup that runs on
// EVERY authenticated request, not just at login. Measured impact: a Shop
// Admin request pays 2 extra sequential cross-region round-trips beyond
// what a Super Admin request pays (shop.isActive + subscription-state
// check, neither of which applies to SUPER_ADMIN) - confirmed live, this
// added 2-4+ seconds versus a Super Admin's ~0.6s for the identical
// /api/auth/me endpoint. Every screen a shop owner opens pays this on top
// of that screen's own query cost.
//
// A short TTL means a shop that gets suspended (or whose subscription lapses
// mid-session) is locked out within TTL_MS instead of on its very next
// request, as before - a small, deliberate trade of immediacy for
// eliminating this cost on every other request in between. Callers that
// change shop status, subscription status, or a user's login-identifier
// fields (email/phone) MUST call invalidateAuthCache() for every affected
// userId immediately, so the common case (a Super Admin suspending a shop
// and expecting it to take effect) isn't delayed by the full TTL.
const TTL_MS = 60 * 1000;

export type CachedAuthCheck = {
  user: { id: string; email: string | null; phone: string | null; name: string; role: string; shopId: string | null };
  // null for SUPER_ADMIN / any user with no shop - the checks below simply don't apply.
  shopActive: boolean | null;
  subscriptionState: string | null;
};

const cache = new TtlCache<CachedAuthCheck>();

export function getCachedAuthCheck(userId: string): CachedAuthCheck | undefined {
  return cache.get(userId);
}

export function setCachedAuthCheck(userId: string, value: CachedAuthCheck): void {
  cache.set(userId, value, TTL_MS);
}

export function invalidateAuthCache(userId: string): void {
  cache.invalidate(userId);
}
