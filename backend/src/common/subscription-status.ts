// After a subscription's `endDate` passes, the Shop Admin keeps login access for
// this many additional days before being locked out - gives a shop time to renew
// without an abrupt, no-warning cutoff.
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  'Your subscription and grace period have expired. Please renew your subscription to continue accessing your shop dashboard.';

export type SubscriptionState = 'ACTIVE' | 'GRACE_PERIOD' | 'GRACE_PERIOD_EXPIRED';

// Pure function so the exact Day1/Day2/Day3 boundary math is testable/reviewable
// in one place, independent of the Firestore lookup (see firestore/auth/firestore-subscription-status.ts).
export function computeSubscriptionState(
  endDate: Date,
  now: Date = new Date(),
): { state: SubscriptionState; daysRemaining: number | null } {
  if (now <= endDate) {
    return { state: 'ACTIVE', daysRemaining: null };
  }

  const graceEndsAt = new Date(endDate.getTime() + SUBSCRIPTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  if (now <= graceEndsAt) {
    const msRemaining = graceEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    return { state: 'GRACE_PERIOD', daysRemaining };
  }

  return { state: 'GRACE_PERIOD_EXPIRED', daysRemaining: 0 };
}
