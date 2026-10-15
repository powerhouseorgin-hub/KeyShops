// A Super Admin's change to ONE shop's free trial. Pure (no database), so the rules are testable in one place; FirestoreShopService.updateTrial
// reads the shop's live subscription, asks planTrialUpdate what to do, and applies it.
//
//   'extend' - add N days. From the trial's current end date, or from today when it has already passed (so a lapsed trial gets N full days
//              from now, never a date that is still in the past).
//   'set'    - the trial lasts N days in total, counted from the day it started (end = start + N days). Can shorten a trial.
//   'until'  - the trial ends on a date picked on a calendar ('YYYY-MM-DD'), at the END of that day in India time (the app's home
//              time zone). Can shorten a trial (a past date ends it); a shop with no live trial needs today or a later date.
// Either way, a shop with no live trial (none ever, or its previous subscription has lapsed) simply gets a NEW trial starting now.
// A shop with a paid yearly subscription that is still running is refused: a trial does not apply to it.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TRIAL_DAYS = 365;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type TrialMode = 'set' | 'extend' | 'until';

export interface SubscriptionLike {
  plan: string;
  startDate: number;
  endDate: number;
}

export type TrialPlan =
  | { action: 'update'; endDate: number }
  | { action: 'create'; startDate: number; endDate: number };

export class TrialError extends Error {}

// 'YYYY-MM-DD' -> the last millisecond of that day in India time; null when it is not a real calendar date.
export function endOfDayIST(dateText: unknown): number | null {
  if (typeof dateText !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const [y, m, d] = dateText.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null; // e.g. 31 Feb
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS;
}

// The start of the India-time day that contains `ms`.
const startOfDayIST = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;

// `current` is the shop's latest ACTIVE subscription (null when there is none). `value` is the number of days for 'extend' / 'set', or the
// picked date text for 'until'.
export function planTrialUpdate(current: SubscriptionLike | null, mode: string, value: unknown, now: number): TrialPlan {
  if (mode !== 'set' && mode !== 'extend' && mode !== 'until') {
    throw new TrialError('Choose "extend" (add days), "set" (total trial days) or "until" (an end date).');
  }

  let days = 0;
  let untilEnd = 0;
  if (mode === 'until') {
    const end = endOfDayIST(value);
    if (end === null) throw new TrialError('Pick a valid end date.');
    if (end > startOfDayIST(now) + (MAX_TRIAL_DAYS + 1) * DAY_MS) throw new TrialError(`The end date can be at most ${MAX_TRIAL_DAYS} days from today.`);
    untilEnd = end;
  } else {
    days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_DAYS) {
      throw new TrialError(`Enter a whole number of days between 1 and ${MAX_TRIAL_DAYS}.`);
    }
  }

  if (current && current.plan !== 'TRIAL' && current.endDate > now) {
    throw new TrialError('This shop has a paid yearly subscription that is still running, so a trial does not apply to it.');
  }

  const live = current && current.plan === 'TRIAL' ? current : null;
  if (!live) {
    if (mode === 'until') {
      if (untilEnd < now) throw new TrialError('This shop has no running trial, so pick today or a later date to start a new one.');
      return { action: 'create', startDate: now, endDate: untilEnd };
    }
    return { action: 'create', startDate: now, endDate: now + days * DAY_MS };
  }
  if (mode === 'until') {
    if (untilEnd < startOfDayIST(live.startDate)) throw new TrialError('The end date cannot be before the day the trial started.');
    return { action: 'update', endDate: untilEnd };
  }
  if (mode === 'set') return { action: 'update', endDate: live.startDate + days * DAY_MS };
  return { action: 'update', endDate: Math.max(live.endDate, now) + days * DAY_MS };
}

// Whole days between now and an end date, rounded up; negative once it has passed (-1 = ended within the last day).
export function daysLeft(endDate: number, now: number): number {
  return Math.ceil((endDate - now) / DAY_MS);
}
