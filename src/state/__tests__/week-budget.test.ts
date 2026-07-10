import { describe, expect, it } from 'vitest';

import {
  canSpendAnyWeek,
  canSpendWeek,
  creditTransaction,
  creditTransactions,
  dateKey,
  grantPurchasedWeeks,
  initialPurchasedWeeksPool,
  initialWeekBudget,
  refreshWeekBudget,
  spendWeek,
  spendWeekFromPools,
  WEEKS_BANK_CAP,
  WEEKS_PER_DAY,
  type PurchasedWeeksPool,
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

describe('purchased-weeks pool', () => {
  it('starts empty', () => {
    expect(initialPurchasedWeeksPool()).toEqual({ weeksRemaining: 0, grantedTransactionIds: [] });
  });

  it('grantPurchasedWeeks credits the pool additively', () => {
    const pool = grantPurchasedWeeks(initialPurchasedWeeksPool(), 20);
    expect(pool.weeksRemaining).toBe(20);
    expect(grantPurchasedWeeks(pool, 60).weeksRemaining).toBe(80);
  });

  it('canSpendAnyWeek is true if either pool has weeks', () => {
    const emptyBudget: WeekBudget = { lastSessionDate: 'x', weeksRemaining: 0 };
    const fullBudget: WeekBudget = { lastSessionDate: 'x', weeksRemaining: 3 };
    const emptyPool = initialPurchasedWeeksPool();
    const fullPool: PurchasedWeeksPool = { weeksRemaining: 5, grantedTransactionIds: [] };

    expect(canSpendAnyWeek(emptyBudget, emptyPool)).toBe(false);
    expect(canSpendAnyWeek(fullBudget, emptyPool)).toBe(true);
    expect(canSpendAnyWeek(emptyBudget, fullPool)).toBe(true);
    expect(canSpendAnyWeek(fullBudget, fullPool)).toBe(true);
  });

  it('spendWeekFromPools spends free weeks before touching the purchased pool', () => {
    const budget: WeekBudget = { lastSessionDate: 'x', weeksRemaining: 1 };
    const purchased: PurchasedWeeksPool = { weeksRemaining: 5, grantedTransactionIds: ['tx1'] };

    const afterFirst = spendWeekFromPools(budget, purchased);
    expect(afterFirst.budget.weeksRemaining).toBe(0);
    expect(afterFirst.purchased.weeksRemaining).toBe(5);

    const afterSecond = spendWeekFromPools(afterFirst.budget, afterFirst.purchased);
    expect(afterSecond.budget.weeksRemaining).toBe(0);
    expect(afterSecond.purchased.weeksRemaining).toBe(4);
    // Spending never touches the transaction ledger.
    expect(afterSecond.purchased.grantedTransactionIds).toEqual(['tx1']);
  });

  it('spendWeekFromPools is a no-op once both pools are empty', () => {
    const budget: WeekBudget = { lastSessionDate: 'x', weeksRemaining: 0 };
    const purchased = initialPurchasedWeeksPool();

    const result = spendWeekFromPools(budget, purchased);
    expect(result.budget.weeksRemaining).toBe(0);
    expect(result.purchased.weeksRemaining).toBe(0);
  });

  it('day-rollover refreshes the free budget without touching a non-zero purchased pool', () => {
    const budget: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 3)), weeksRemaining: 0 };
    const purchased: PurchasedWeeksPool = { weeksRemaining: 12, grantedTransactionIds: [] };

    const refreshed = refreshWeekBudget(budget, day(2026, 7, 4));
    expect(refreshed.weeksRemaining).toBe(WEEKS_PER_DAY);
    // refreshWeekBudget never touches the purchased pool — it's a separate object.
    expect(purchased.weeksRemaining).toBe(12);
  });

  it('survives a persistence round-trip (JSON serialize/deserialize)', () => {
    const pool = grantPurchasedWeeks(initialPurchasedWeeksPool(), 20);
    const roundTripped = JSON.parse(JSON.stringify(pool)) as PurchasedWeeksPool;
    expect(roundTripped).toEqual(pool);
  });
});

describe('creditTransaction / creditTransactions', () => {
  it('credits weeks and marks the transaction granted in one update', () => {
    const pool = creditTransaction(initialPurchasedWeeksPool(), 'tx1', 20);
    expect(pool.weeksRemaining).toBe(20);
    expect(pool.grantedTransactionIds).toEqual(['tx1']);
  });

  it('is idempotent — crediting an already-granted transaction is a no-op', () => {
    const pool = creditTransaction(initialPurchasedWeeksPool(), 'tx1', 20);
    const again = creditTransaction(pool, 'tx1', 20);
    expect(again).toEqual(pool);
    expect(again.weeksRemaining).toBe(20);
  });

  it('the pool and its ledger always update together — a crash cannot land one without the other', () => {
    const pool = creditTransaction(initialPurchasedWeeksPool(), 'tx1', 20);
    // Anything holding a reference to `pool` sees weeksRemaining and
    // grantedTransactionIds in sync by construction — there is no
    // intermediate state where one field reflects the credit and the other
    // doesn't, because both are set in the same object literal.
    expect(pool).toEqual({ weeksRemaining: 20, grantedTransactionIds: ['tx1'] });
  });

  it('creditTransactions applies a batch, skipping already-granted ones', () => {
    const pool = creditTransactions(initialPurchasedWeeksPool(), [
      { transactionId: 'tx1', weeks: 20 },
      { transactionId: 'tx2', weeks: 60 },
    ]);
    expect(pool.weeksRemaining).toBe(80);
    expect(pool.grantedTransactionIds.sort()).toEqual(['tx1', 'tx2']);

    const again = creditTransactions(pool, [
      { transactionId: 'tx1', weeks: 20 },
      { transactionId: 'tx3', weeks: 20 },
    ]);
    expect(again.weeksRemaining).toBe(100);
    expect(again.grantedTransactionIds.sort()).toEqual(['tx1', 'tx2', 'tx3']);
  });
});
