import { addMonthsUTC, cleanText, ExtensionError, MAX_NOTES_LENGTH, MAX_REASON_LENGTH, planSubscriptionExtension } from './subscription-extension';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0); // 15 Oct 2026
const row = (plan: string, startAgo: number, endIn: number) => ({ plan, startDate: NOW - startAgo * DAY, endDate: NOW + endIn * DAY });

describe('addMonthsUTC', () => {
  it('adds calendar months', () => {
    expect(addMonthsUTC(Date.UTC(2026, 9, 15), 1)).toBe(Date.UTC(2026, 10, 15));
    expect(addMonthsUTC(Date.UTC(2026, 9, 15), 12)).toBe(Date.UTC(2027, 9, 15));
    expect(addMonthsUTC(Date.UTC(2026, 9, 15), 24)).toBe(Date.UTC(2028, 9, 15));
  });

  it('clamps to the end of a shorter month instead of rolling into the next one', () => {
    expect(addMonthsUTC(Date.UTC(2026, 10, 30), 3)).toBe(Date.UTC(2027, 1, 28)); // 30 Nov + 3 months = 28 Feb
    expect(addMonthsUTC(Date.UTC(2027, 0, 31), 1)).toBe(Date.UTC(2027, 1, 28)); // 31 Jan + 1 month
    expect(addMonthsUTC(Date.UTC(2028, 1, 29), 12)).toBe(Date.UTC(2029, 1, 28)); // 29 Feb (leap) + 1 year
    expect(addMonthsUTC(Date.UTC(2026, 7, 31), 6)).toBe(Date.UTC(2027, 1, 28)); // 31 Aug + 6 months
  });
});

describe('planSubscriptionExtension', () => {
  it('a running subscription is extended from its current end date, keeping the days already paid for', () => {
    const plan = planSubscriptionExtension(row('YEARLY', 100, 265), 3, NOW);
    expect(plan).toEqual({ action: 'update', plan: 'YEARLY', endDate: addMonthsUTC(NOW + 265 * DAY, 3) });
  });

  it('a running TRIAL extended by a subscription period becomes a YEARLY-plan subscription, from the trial end', () => {
    const plan = planSubscriptionExtension(row('TRIAL', 2, 5), 1, NOW);
    expect(plan).toEqual({ action: 'update', plan: 'YEARLY', endDate: addMonthsUTC(NOW + 5 * DAY, 1) });
  });

  it('a subscription that has already ended starts a NEW one from now', () => {
    for (const ended of [row('TRIAL', 30, -23), row('YEARLY', 400, -35)]) {
      expect(planSubscriptionExtension(ended, 6, NOW)).toEqual({ action: 'create', plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 6) });
    }
  });

  it('no subscription at all starts a new one from now', () => {
    expect(planSubscriptionExtension(null, 12, NOW)).toEqual({ action: 'create', plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 12) });
  });

  it.each([1, 3, 6, 12, 24])('accepts %p months', (m) => {
    expect(() => planSubscriptionExtension(null, m, NOW)).not.toThrow();
    expect(() => planSubscriptionExtension(null, String(m), NOW)).not.toThrow(); // form values arrive as text
  });

  it.each([0, 2, 5, 13, 36, -1, 1.5, NaN, 'abc', null, undefined])('rejects %p months', (m) => {
    expect(() => planSubscriptionExtension(row('YEARLY', 1, 300), m, NOW)).toThrow(ExtensionError);
  });
});

describe('cleanText', () => {
  it('blank or missing is null; text is trimmed', () => {
    expect(cleanText(undefined, MAX_REASON_LENGTH, 'Reason')).toBeNull();
    expect(cleanText(null, MAX_REASON_LENGTH, 'Reason')).toBeNull();
    expect(cleanText('   ', MAX_REASON_LENGTH, 'Reason')).toBeNull();
    expect(cleanText('  Payment received  ', MAX_REASON_LENGTH, 'Reason')).toBe('Payment received');
  });

  it('refuses non-text and text over the limit', () => {
    expect(() => cleanText(5, MAX_REASON_LENGTH, 'Reason')).toThrow(/must be text/);
    expect(() => cleanText('x'.repeat(MAX_REASON_LENGTH + 1), MAX_REASON_LENGTH, 'Reason')).toThrow(/at most 200/);
    expect(cleanText('x'.repeat(MAX_NOTES_LENGTH), MAX_NOTES_LENGTH, 'Notes')).toHaveLength(MAX_NOTES_LENGTH);
    expect(() => cleanText('x'.repeat(MAX_NOTES_LENGTH + 1), MAX_NOTES_LENGTH, 'Notes')).toThrow(/at most 1000/);
  });
});

import { MAX_PREPAID_MONTHS, planRenewal, RENEWAL_MONTHS } from './subscription-extension';

describe('planRenewal (a shop pays for its own renewal)', () => {
  it('paying before the end date stacks one year AFTER it - no paid day is lost', () => {
    const plan = planRenewal(row('YEARLY', 335, 30), NOW);
    expect(plan).toEqual({ action: 'update', plan: 'YEARLY', endDate: addMonthsUTC(NOW + 30 * DAY, RENEWAL_MONTHS) });
  });

  it('a trial that is still running keeps its remaining days: the year starts after the trial ends', () => {
    expect(planRenewal(row('TRIAL', 2, 5), NOW)).toEqual({ action: 'update', plan: 'YEARLY', endDate: addMonthsUTC(NOW + 5 * DAY, 12) });
  });

  it('a subscription that has ended (grace period or locked out) starts a new year today', () => {
    for (const ended of [row('TRIAL', 10, -2), row('YEARLY', 400, -35)]) {
      expect(planRenewal(ended, NOW)).toEqual({ action: 'create', plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 12) });
    }
  });

  it('a shop with no subscription gets a new year today', () => {
    expect(planRenewal(null, NOW)).toEqual({ action: 'create', plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 12) });
  });

  it(`refuses to go more than ${MAX_PREPAID_MONTHS} months ahead of today`, () => {
    // 24 months already paid + 12 more = exactly 36 months: allowed
    expect(() => planRenewal({ plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 24) }, NOW)).not.toThrow();
    // 25 months paid + 12 = 37 months: refused
    expect(() => planRenewal({ plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 25) }, NOW)).toThrow(/longest period allowed/);
    expect(() => planRenewal({ plan: 'YEARLY', startDate: NOW, endDate: addMonthsUTC(NOW, 35) }, NOW)).toThrow(ExtensionError);
  });
});
