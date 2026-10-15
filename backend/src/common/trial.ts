// A Super Admin's change to ONE shop's free trial. Pure (no database), so the rules are testable in one place; FirestoreShopService.updateTrial
// reads the shop's live subscription, asks planTrialUpdate what to do, and applies it.
//
//   'extend' - add N days. From the trial's current end date, or from today when it has already passed (so a lapsed trial gets N full days
//              from now, never a date that is still in the past).
//   'set'    - the trial lasts N days in total, counted from the day it started (end = start + N days). Can shorten a trial.
// Either way, a shop with no live trial (none ever, or its previous subscription has lapsed) simply gets a NEW trial of N days starting now.
// A shop with a paid yearly subscription that is still running is refused: a trial does not apply to it.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TRIAL_DAYS = 365;

export type TrialMode = 'set' | 'extend';

export interface SubscriptionLike {
  plan: string;
  startDate: number;
  endDate: number;
}

export type TrialPlan =
  | { action: 'update'; endDate: number }
  | { action: 'create'; startDate: number; endDate: number };

export class TrialError extends Error {}

// `current` is the shop's latest ACTIVE subscription (null when there is none).
export function planTrialUpdate(current: SubscriptionLike | null, mode: string, daysRaw: unknown, now: number): TrialPlan {
  if (mode !== 'set' && mode !== 'extend') throw new TrialError('Choose "extend" (add days) or "set" (total trial days).');
  const days = Number(daysRaw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_DAYS) {
    throw new TrialError(`Enter a whole number of days between 1 and ${MAX_TRIAL_DAYS}.`);
  }

  if (current && current.plan !== 'TRIAL' && current.endDate > now) {
    throw new TrialError('This shop has a paid yearly subscription that is still running, so a trial does not apply to it.');
  }

  const live = current && current.plan === 'TRIAL' ? current : null;
  if (!live) return { action: 'create', startDate: now, endDate: now + days * DAY_MS };
  if (mode === 'set') return { action: 'update', endDate: live.startDate + days * DAY_MS };
  return { action: 'update', endDate: Math.max(live.endDate, now) + days * DAY_MS };
}

// Whole days between now and an end date, rounded up; negative once it has passed (-1 = ended within the last day).
export function daysLeft(endDate: number, now: number): number {
  return Math.ceil((endDate - now) / DAY_MS);
}
