import { TtlCache } from '../common/ttl-cache';

// Caches FirebaseAuthGuard's per-user check - Firestore lookups (shop.isActive + subscription state, neither
// of which applies to SUPER_ADMIN) that would otherwise run on EVERY authenticated request, not just at
// login. A Shop Admin request pays those extra sequential reads on top of what a Super Admin request pays,
// and every screen a shop owner opens would pay that on top of its own query cost.
//
// A short TTL means a shop that gets suspended (or whose subscription lapses
// mid-session) is locked out within TTL_MS instead of on its very next
// request - a small, deliberate trade of immediacy for
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
