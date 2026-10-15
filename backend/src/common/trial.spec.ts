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
