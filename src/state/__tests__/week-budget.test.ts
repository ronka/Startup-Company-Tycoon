import { describe, expect, it } from 'vitest';

import {
  canSpendWeek,
  dateKey,
  initialWeekBudget,
  refreshWeekBudget,
  spendWeek,
  WEEKS_BANK_CAP,
  WEEKS_PER_DAY,
  type WeekBudget,
} from '../week-budget';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('dateKey', () => {
  it('is a local calendar-day key, stable within the same day', () => {
    expect(dateKey(day(2026, 7, 3, 0))).toBe(dateKey(day(2026, 7, 3, 23)));
    expect(dateKey(day(2026, 7, 3))).not.toBe(dateKey(day(2026, 7, 4)));
  });
});

describe('initialWeekBudget', () => {
  it('grants exactly one day\'s allotment', () => {
    const budget = initialWeekBudget(day(2026, 7, 3));
    expect(budget.weeksRemaining).toBe(WEEKS_PER_DAY);
    expect(budget.lastSessionDate).toBe(dateKey(day(2026, 7, 3)));
  });
});

describe('refreshWeekBudget', () => {
  it('is a no-op within the same local day', () => {
    const budget: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 3)), weeksRemaining: 2 };
    expect(refreshWeekBudget(budget, day(2026, 7, 3, 23))).toEqual(budget);
  });

  it('grants a fresh WEEKS_PER_DAY on the first session of a new day', () => {
    const budget: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 3)), weeksRemaining: 1 };
    const next = refreshWeekBudget(budget, day(2026, 7, 4));
    expect(next.weeksRemaining).toBe(1 + WEEKS_PER_DAY);
    expect(next.lastSessionDate).toBe(dateKey(day(2026, 7, 4)));
  });

  it('banks to WEEKS_BANK_CAP rather than growing unbounded', () => {
    const budget: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 3)), weeksRemaining: 9 };
    const next = refreshWeekBudget(budget, day(2026, 7, 4));
    expect(next.weeksRemaining).toBe(WEEKS_BANK_CAP);
  });

  it('grants only one day\'s worth even after skipping several days', () => {
    const budget: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 1)), weeksRemaining: 0 };
    const next = refreshWeekBudget(budget, day(2026, 7, 8));
    expect(next.weeksRemaining).toBe(WEEKS_PER_DAY);
  });

  it('is deterministic for the same budget and instant', () => {
    const budget: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 3)), weeksRemaining: 4 };
    expect(refreshWeekBudget(budget, day(2026, 7, 4))).toEqual(refreshWeekBudget(budget, day(2026, 7, 4)));
  });
});

describe('canSpendWeek / spendWeek', () => {
  it('allows spending while weeks remain, and blocks at zero', () => {
    const budget: WeekBudget = { lastSessionDate: 'x', weeksRemaining: 1 };
    expect(canSpendWeek(budget)).toBe(true);
    const spent = spendWeek(budget);
    expect(spent.weeksRemaining).toBe(0);
    expect(canSpendWeek(spent)).toBe(false);
  });

  it('spendWeek never goes negative', () => {
    const budget: WeekBudget = { lastSessionDate: 'x', weeksRemaining: 0 };
    expect(spendWeek(budget).weeksRemaining).toBe(0);
  });
});
