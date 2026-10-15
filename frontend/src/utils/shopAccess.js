// Whether a shop can ACTUALLY get in, as the Super Admin should see it - not just the manual "Suspend" switch (`isActive`).
// A shop whose subscription AND 3-day grace period are over is locked out at login (see computeSubscriptionState on the server), so it must
// read "Suspended" even though `isActive` is still true. `accessState` / `graceDaysRemaining` come with every shop from the server.
//   tone   'active' | 'suspended'
//   reason null | 'manual' (switched off by a Super Admin) | 'expired' (subscription and grace period are over) | 'grace' (still allowed in)
export function shopAccess(shop) {
  if (!shop) return { tone: 'active', reason: null };
  if (shop.isActive === false) return { tone: 'suspended', reason: 'manual', expired: shop.accessState === 'GRACE_PERIOD_EXPIRED' };
  if (shop.accessState === 'GRACE_PERIOD_EXPIRED') return { tone: 'suspended', reason: 'expired', expired: true };
  if (shop.accessState === 'GRACE_PERIOD') return { tone: 'active', reason: 'grace', graceDays: shop.graceDaysRemaining };
  return { tone: 'active', reason: null };
}
