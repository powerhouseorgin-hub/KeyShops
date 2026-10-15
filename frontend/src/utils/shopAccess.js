// Whether a shop can ACTUALLY get in, as the Super Admin should see it - not just the manual "Suspend" switch (`isActive`).
// A shop whose subscription AND 3-day grace period are over is locked out at login (see computeSubscriptionState on the server), so it must
// read "Suspended" even though `isActive` is still true.
//
// The server sends `accessState` ('ACTIVE' | 'GRACE_PERIOD' | 'GRACE_PERIOD_EXPIRED') and `graceDaysRemaining` with every shop. When it
// does not (an older server), the state is worked out here from the shop's latest subscription with the same rule, so the screen is
// right either way. GRACE_DAYS must stay equal to SUBSCRIPTION_GRACE_PERIOD_DAYS in backend/src/common/subscription-status.ts.
//   tone   'active' | 'suspended'
//   reason null | 'manual' (switched off by a Super Admin) | 'expired' (subscription and grace period are over) | 'grace' (still allowed in)
const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// The server's rule: no ACTIVE subscription = locked out; otherwise ACTIVE until the end date, then GRACE_PERIOD for GRACE_DAYS, then locked out.
export function accessFromSubscription(subscription, now = Date.now()) {
  if (!subscription || subscription.status !== 'ACTIVE' || typeof subscription.endDate !== 'number') return { state: 'GRACE_PERIOD_EXPIRED', graceDays: 0 };
  if (now <= subscription.endDate) return { state: 'ACTIVE', graceDays: null };
  const graceEnd = subscription.endDate + GRACE_DAYS * DAY_MS;
  if (now <= graceEnd) return { state: 'GRACE_PERIOD', graceDays: Math.max(1, Math.ceil((graceEnd - now) / DAY_MS)) };
  return { state: 'GRACE_PERIOD_EXPIRED', graceDays: 0 };
}

// `subscription` is optional: the shop's latest subscription when `shop.subscriptions[0]` is not at hand.
export function shopAccess(shop, subscription, now = Date.now()) {
  if (!shop) return { tone: 'active', reason: null };
  let state = shop.accessState;
  let graceDays = shop.graceDaysRemaining;
  if (!state) {
    const derived = accessFromSubscription(subscription ?? (Array.isArray(shop.subscriptions) ? shop.subscriptions[0] : null), now);
    state = derived.state;
    graceDays = derived.graceDays;
  }
  if (shop.isActive === false) return { tone: 'suspended', reason: 'manual', expired: state === 'GRACE_PERIOD_EXPIRED' };
  if (state === 'GRACE_PERIOD_EXPIRED') return { tone: 'suspended', reason: 'expired', expired: true };
  if (state === 'GRACE_PERIOD') return { tone: 'active', reason: 'grace', graceDays };
  return { tone: 'active', reason: null };
}
