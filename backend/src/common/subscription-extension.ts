// A Super Admin extends ONE shop's subscription by a fixed period (1, 3, 6, 12 or 24 months), with a reason and internal notes for the audit
// trail. Pure (no database), so the rules are testable in one place; FirestoreShopService.extendSubscription reads the shop's live subscription,
// asks planSubscriptionExtension what to do, and applies it.
//
//   - A subscription that is still running is extended from its current end date (the days already paid for are kept).
//   - A shop with no running subscription (none, or the last one has ended) gets a NEW subscription starting now.
//   - The result is always a YEARLY-plan subscription: extending a TRIAL by a subscription period turns it into one. Nothing was paid through
//     the app, so no revenue record is written (the same as the existing Super Admin renewal).
// Months are calendar months (UTC), so 12 months from 15 Oct 2026 is 15 Oct 2027; a day that does not exist in the target month is clamped
// to that month's last day (30 Nov + 3 months = 28 Feb).
export const EXTENSION_MONTHS = [1, 3, 6, 12, 24] as const;
export const MAX_REASON_LENGTH = 200;
export const MAX_NOTES_LENGTH = 1000;

export class ExtensionError extends Error {}

export interface SubscriptionRow {
  plan: string;
  startDate: number;
  endDate: number;
}

export type ExtensionPlan =
  | { action: 'update'; plan: 'YEARLY'; endDate: number }
  | { action: 'create'; plan: 'YEARLY'; startDate: number; endDate: number };

// Calendar months, clamped to the end of a shorter month (30 Nov + 3 months = 28 Feb, not 2 Mar).
export function addMonthsUTC(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d.getTime();
}

// `current` is the shop's latest ACTIVE subscription (null when there is none).
export function planSubscriptionExtension(current: SubscriptionRow | null, monthsRaw: unknown, now: number): ExtensionPlan {
  const months = Number(monthsRaw);
  if (!(EXTENSION_MONTHS as readonly number[]).includes(months)) {
    throw new ExtensionError('Choose an extension of 1, 3, 6, 12 or 24 months.');
  }
  if (!current || current.endDate < now) {
    return { action: 'create', plan: 'YEARLY', startDate: now, endDate: addMonthsUTC(now, months) };
  }
  return { action: 'update', plan: 'YEARLY', endDate: addMonthsUTC(current.endDate, months) };
}

// The free-text fields: optional, trimmed, and bounded. Returns null for blank.
export function cleanText(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ExtensionError(`${label} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new ExtensionError(`${label} must be at most ${max} characters.`);
  return text || null;
}
