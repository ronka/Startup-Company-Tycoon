import { describe, expect, it } from 'vitest';

import {
  canRoll,
  initialRollBudget,
  isRollBudgetExhausted,
  refreshRollBudget,
  ROLLS_BANK_CAP,
  ROLLS_PER_DAY,
  spendRoll,
  type RollBudget,
} from '../roll-budget';
import { dateKey } from '../week-budget';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('initialRollBudget', () => {
  it("grants exactly one day's allotment", () => {
    const budget = initialRollBudget(day(2026, 8, 14));
    expect(budget.rollsRemaining).toBe(ROLLS_PER_DAY);
    expect(budget.lastSessionDate).toBe(dateKey(day(2026, 8, 14)));
  });
});

describe('refreshRollBudget', () => {
  it('is a no-op within the same local day', () => {
    const budget: RollBudget = { lastSessionDate: dateKey(day(2026, 8, 14)), rollsRemaining: 1 };
    expect(refreshRollBudget(budget, day(2026, 8, 14, 23))).toEqual(budget);
  });

  it('grants a fresh ROLLS_PER_DAY on the first session of a new day', () => {
    const budget: RollBudget = { lastSessionDate: dateKey(day(2026, 8, 14)), rollsRemaining: 1 };
    const next = refreshRollBudget(budget, day(2026, 8, 15));
    expect(next.rollsRemaining).toBe(1 + ROLLS_PER_DAY);
    expect(next.lastSessionDate).toBe(dateKey(day(2026, 8, 15)));
  });

  it('banks to the cap and no further', () => {
    const budget: RollBudget = {
      lastSessionDate: dateKey(day(2026, 8, 14)),
      rollsRemaining: ROLLS_BANK_CAP,
    };
    expect(refreshRollBudget(budget, day(2026, 8, 15)).rollsRemaining).toBe(ROLLS_BANK_CAP);
  });

  it('grants one day worth for a gap of many days, not one per day skipped', () => {
    const budget: RollBudget = { lastSessionDate: dateKey(day(2026, 8, 1)), rollsRemaining: 0 };
    expect(refreshRollBudget(budget, day(2026, 8, 14)).rollsRemaining).toBe(ROLLS_PER_DAY);
  });

  it('refreshes across a month boundary', () => {
    const budget: RollBudget = { lastSessionDate: dateKey(day(2026, 8, 31)), rollsRemaining: 0 };
    expect(refreshRollBudget(budget, day(2026, 9, 1)).rollsRemaining).toBe(ROLLS_PER_DAY);
  });
});

describe('spendRoll', () => {
  it('spends one and floors at zero', () => {
    const budget: RollBudget = { lastSessionDate: '2026-08-14', rollsRemaining: 1 };
    const spent = spendRoll(budget);
    expect(spent.rollsRemaining).toBe(0);
    expect(canRoll(spent)).toBe(false);
    expect(spendRoll(spent).rollsRemaining).toBe(0);
  });

  it('leaves the session date alone', () => {
    const budget: RollBudget = { lastSessionDate: '2026-08-14', rollsRemaining: 2 };
    expect(spendRoll(budget).lastSessionDate).toBe('2026-08-14');
  });
});

describe('isRollBudgetExhausted', () => {
  it('is true only once the budget is actually spent', () => {
    expect(isRollBudgetExhausted({ lastSessionDate: '2026-08-14', rollsRemaining: 1 }, false)).toBe(false);
    expect(isRollBudgetExhausted({ lastSessionDate: '2026-08-14', rollsRemaining: 0 }, false)).toBe(true);
  });

  it('never walls a dev free-play session', () => {
    expect(isRollBudgetExhausted({ lastSessionDate: '2026-08-14', rollsRemaining: 0 }, true)).toBe(false);
  });

  it('treats an unresolved read as not exhausted, so a slow load never blocks a spin', () => {
    expect(isRollBudgetExhausted(null, false)).toBe(false);
  });
});
