import { DAY_MS, daysLeft, planTrialUpdate, TrialError } from './trial';

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0); // 15 Oct 2026
const day = (n: number) => n * DAY_MS;
const trial = (startDaysAgo: number, endInDays: number) => ({ plan: 'TRIAL', startDate: NOW - day(startDaysAgo), endDate: NOW + day(endInDays) });

describe('planTrialUpdate', () => {
  describe('extend (add days)', () => {
    it('adds the days to the current end date while the trial is still running', () => {
      expect(planTrialUpdate(trial(2, 5), 'extend', 7, NOW)).toEqual({ action: 'update', endDate: NOW + day(5) + day(7) });
    });

    it('a trial that has already ended gets the days counted from TODAY, never an end date in the past', () => {
      expect(planTrialUpdate(trial(30, -23), 'extend', 7, NOW)).toEqual({ action: 'update', endDate: NOW + day(7) });
    });

    it('a trial ending exactly now gets the full days', () => {
      expect(planTrialUpdate(trial(7, 0), 'extend', 3, NOW)).toEqual({ action: 'update', endDate: NOW + day(3) });
    });
  });

  describe('set (total trial days)', () => {
    it('the trial lasts N days in total, counted from its start day', () => {
      expect(planTrialUpdate(trial(3, 4), 'set', 14, NOW)).toEqual({ action: 'update', endDate: NOW - day(3) + day(14) });
    });

    it('can shorten a trial', () => {
      expect(planTrialUpdate(trial(2, 12), 'set', 5, NOW)).toEqual({ action: 'update', endDate: NOW - day(2) + day(5) });
    });

    it('setting a total shorter than the days already used ends it (the end date is simply in the past)', () => {
      const plan = planTrialUpdate(trial(10, 4), 'set', 7, NOW) as { endDate: number };
      expect(plan.endDate).toBeLessThan(NOW);
    });
  });

  describe('a shop with no live trial', () => {
    it('gets a new trial of N days starting now, for both modes', () => {
      for (const mode of ['set', 'extend']) {
        expect(planTrialUpdate(null, mode, 7, NOW)).toEqual({ action: 'create', startDate: NOW, endDate: NOW + day(7) });
      }
    });

    it('a paid yearly subscription that has already ended is treated the same way', () => {
      const lapsed = { plan: 'YEARLY', startDate: NOW - day(400), endDate: NOW - day(35) };
      expect(planTrialUpdate(lapsed, 'extend', 7, NOW)).toEqual({ action: 'create', startDate: NOW, endDate: NOW + day(7) });
    });
  });

  it('refuses a shop whose paid yearly subscription is still running', () => {
    const paid = { plan: 'YEARLY', startDate: NOW - day(36), endDate: NOW + day(329) };
    expect(() => planTrialUpdate(paid, 'extend', 7, NOW)).toThrow(TrialError);
    expect(() => planTrialUpdate(paid, 'set', 7, NOW)).toThrow(/paid yearly/);
  });

  describe('validation', () => {
    it.each([0, -3, 1.5, 366, 9999, NaN, 'abc', null, undefined])('rejects %p days', (days) => {
      expect(() => planTrialUpdate(trial(1, 6), 'extend', days, NOW)).toThrow(/whole number of days between 1 and 365/);
    });

    it('accepts the boundaries and numeric strings (form fields arrive as text)', () => {
      expect(() => planTrialUpdate(trial(1, 6), 'extend', 1, NOW)).not.toThrow();
      expect(() => planTrialUpdate(trial(1, 6), 'extend', 365, NOW)).not.toThrow();
      expect(planTrialUpdate(trial(1, 6), 'extend', '7', NOW)).toEqual({ action: 'update', endDate: NOW + day(6) + day(7) });
    });

    it('rejects an unknown mode', () => {
      expect(() => planTrialUpdate(trial(1, 6), 'renew', 7, NOW)).toThrow(/extend/);
      expect(() => planTrialUpdate(trial(1, 6), undefined as any, 7, NOW)).toThrow(TrialError);
    });
  });
});

describe('daysLeft', () => {
  it('rounds up while running and goes negative after the end', () => {
    expect(daysLeft(NOW + day(5) - 1000, NOW)).toBe(5);
    expect(daysLeft(NOW + day(1), NOW)).toBe(1);
    expect(daysLeft(NOW - day(23), NOW)).toBe(-23);
  });
});

import { endOfDayIST } from './trial';

// ---- 'until': an end date picked on a calendar -------------------------------------------------------------------------------------
describe('planTrialUpdate - until (calendar date)', () => {
  const NOW_U = Date.UTC(2026, 9, 15, 12, 0, 0); // 15 Oct 2026, 17:30 in India
  const dayU = (n: number) => n * DAY_MS;
  const trialU = (startAgo: number, endIn: number) => ({ plan: 'TRIAL', startDate: NOW_U - dayU(startAgo), endDate: NOW_U + dayU(endIn) });
  const endOf = (d: string) => endOfDayIST(d) as number;

  it('endOfDayIST is the last millisecond of that day in India time', () => {
    // 2026-10-20 23:59:59.999 IST = 2026-10-20 18:29:59.999 UTC
    expect(endOfDayIST('2026-10-20')).toBe(Date.UTC(2026, 9, 20, 18, 29, 59, 999));
    expect(endOfDayIST('2026-02-31')).toBeNull();
    expect(endOfDayIST('20-10-2026')).toBeNull();
    expect(endOfDayIST(undefined)).toBeNull();
    expect(endOfDayIST(20261020)).toBeNull();
  });

  it('moves a running trial to the picked date (later or earlier)', () => {
    expect(planTrialUpdate(trialU(2, 5), 'until', '2026-10-30', NOW_U)).toEqual({ action: 'update', endDate: endOf('2026-10-30') });
    expect(planTrialUpdate(trialU(2, 12), 'until', '2026-10-17', NOW_U)).toEqual({ action: 'update', endDate: endOf('2026-10-17') });
  });

  it('an ended trial can be given a future date', () => {
    expect(planTrialUpdate(trialU(30, -23), 'until', '2026-10-22', NOW_U)).toEqual({ action: 'update', endDate: endOf('2026-10-22') });
  });

  it('a date before now ends the trial (allowed, the end date is simply in the past) but not before its start day', () => {
    const plan = planTrialUpdate(trialU(10, 4), 'until', '2026-10-10', NOW_U) as { endDate: number };
    expect(plan.endDate).toBeLessThan(NOW_U);
    expect(() => planTrialUpdate(trialU(10, 4), 'until', '2026-09-01', NOW_U)).toThrow(/before the day the trial started/);
  });

  it('with no running trial, a date from today onwards starts a new trial now; an earlier date is refused', () => {
    expect(planTrialUpdate(null, 'until', '2026-10-25', NOW_U)).toEqual({ action: 'create', startDate: NOW_U, endDate: endOf('2026-10-25') });
    expect(planTrialUpdate(null, 'until', '2026-10-15', NOW_U)).toEqual({ action: 'create', startDate: NOW_U, endDate: endOf('2026-10-15') }); // today is fine
    expect(() => planTrialUpdate(null, 'until', '2026-10-14', NOW_U)).toThrow(/pick today or a later date/);
  });

  it('is limited to 365 days from today, and needs a real date', () => {
    expect(() => planTrialUpdate(trialU(1, 6), 'until', '2028-01-01', NOW_U)).toThrow(/at most 365 days/);
    expect(() => planTrialUpdate(trialU(1, 6), 'until', '2027-10-15', NOW_U)).not.toThrow();
    for (const bad of ['', 'tomorrow', '2026-13-01', '2026-02-30', null, undefined, 5]) {
      expect(() => planTrialUpdate(trialU(1, 6), 'until', bad, NOW_U)).toThrow(/valid end date/);
    }
  });

  it('a running paid yearly subscription is still refused', () => {
    expect(() => planTrialUpdate({ plan: 'YEARLY', startDate: NOW_U - dayU(36), endDate: NOW_U + dayU(329) }, 'until', '2026-10-30', NOW_U)).toThrow(/paid yearly/);
  });
});
