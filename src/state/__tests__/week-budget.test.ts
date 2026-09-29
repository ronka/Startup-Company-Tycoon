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
  isWeekBudgetExhausted,
  formatClockCountdown,
  formatRefillCountdown,
  nextWeekRegenAt,
  refreshWeekBudget,
  spendWeek,
  spendWeekFromPools,
  weekBankFullAt,
  WEEK_REGEN_MS,
  WEEKS_BANK_CAP,
  type PurchasedWeeksPool,
  type WeekBudget,
} from '../week-budget';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const T0 = day(2026, 7, 3);
const at = (ms: number) => new Date(T0.getTime() + ms);
/** A budget whose regen clock started at `T0`. */
const regen = (weeksRemaining: number): WeekBudget => ({ weeksRemaining, regenFrom: T0.getTime() });

describe('dateKey', () => {
  it('is a local calendar-day key, stable within the same day', () => {
    expect(dateKey(day(2026, 7, 3, 0))).toBe(dateKey(day(2026, 7, 3, 23)));
    expect(dateKey(day(2026, 7, 3))).not.toBe(dateKey(day(2026, 7, 4)));
  });
});

describe('initialWeekBudget', () => {
  it('starts with a full, idle bank', () => {
    expect(initialWeekBudget(T0)).toEqual({ weeksRemaining: WEEKS_BANK_CAP, regenFrom: null });
  });

  it('clamps to the bank cap, and starts the clock when it starts below it', () => {
    expect(initialWeekBudget(T0, 50).weeksRemaining).toBe(WEEKS_BANK_CAP);
    expect(initialWeekBudget(T0, 4)).toEqual({ weeksRemaining: 4, regenFrom: T0.getTime() });
  });
});

describe('formatRefillCountdown', () => {
  it('shows hours and minutes, rounding minutes up', () => {
    expect(formatRefillCountdown((5 * 60 + 11) * 60_000 + 1)).toBe('5h 12m');
    expect(formatRefillCountdown(2 * 3_600_000)).toBe('2h 0m');
  });

  it('drops the hours under an hour', () => {
    expect(formatRefillCountdown(12 * 60_000)).toBe('12m');
  });

  it('never says 0m', () => {
    expect(formatRefillCountdown(59_000)).toBe('under a minute');
    expect(formatRefillCountdown(0)).toBe('under a minute');
  });
});

describe('formatClockCountdown', () => {
  it('ticks minutes and seconds, rounding seconds up', () => {
    expect(formatClockCountdown(22 * 60_000 + 49_001)).toBe('22m 50s');
    expect(formatClockCountdown(5 * 60_000)).toBe('5m 0s');
  });

  it('drops the minutes under a minute, and never goes negative', () => {
    expect(formatClockCountdown(45_000)).toBe('45s');
    expect(formatClockCountdown(1)).toBe('1s');
    expect(formatClockCountdown(-5)).toBe('0s');
  });

  it('adds hours past the hour', () => {
    expect(formatClockCountdown((62 * 60 + 3) * 1_000)).toBe('1h 2m 3s');
  });
});

describe('nextWeekRegenAt / weekBankFullAt', () => {
  it('names the next week and the full bank off the running clock', () => {
    expect(nextWeekRegenAt(regen(4))?.getTime()).toBe(T0.getTime() + WEEK_REGEN_MS);
    expect(weekBankFullAt(regen(4))?.getTime()).toBe(T0.getTime() + (WEEKS_BANK_CAP - 4) * WEEK_REGEN_MS);
  });

  it('is null for a full bank', () => {
    const full: WeekBudget = { weeksRemaining: WEEKS_BANK_CAP, regenFrom: null };
    expect(nextWeekRegenAt(full)).toBeNull();
    expect(weekBankFullAt(full)).toBeNull();
  });
});

describe('refreshWeekBudget', () => {
  it('returns the very same object until a week lands', () => {
    const budget = regen(2);
    expect(refreshWeekBudget(budget, at(WEEK_REGEN_MS - 1))).toBe(budget);
  });

  it('credits one week per interval and carries the partial progress', () => {
    const next = refreshWeekBudget(regen(2), at(2.5 * WEEK_REGEN_MS));
    expect(next.weeksRemaining).toBe(4);
    expect(next.regenFrom).toBe(T0.getTime() + 2 * WEEK_REGEN_MS);
    // The next week is half an interval out, not a full one.
    expect(nextWeekRegenAt(next)?.getTime()).toBe(T0.getTime() + 3 * WEEK_REGEN_MS);
  });

  it('stops at the cap and idles the clock, however long the player was away', () => {
    const next = refreshWeekBudget(regen(0), at(30 * 24 * 3_600_000));
    expect(next).toEqual({ weeksRemaining: WEEKS_BANK_CAP, regenFrom: null });
  });

  it('fills an empty bank in cap × interval', () => {
    expect(refreshWeekBudget(regen(0), at(WEEKS_BANK_CAP * WEEK_REGEN_MS - 1)).weeksRemaining).toBe(WEEKS_BANK_CAP - 1);
    expect(refreshWeekBudget(regen(0), at(WEEKS_BANK_CAP * WEEK_REGEN_MS)).weeksRemaining).toBe(WEEKS_BANK_CAP);
  });

  it('re-anchors instead of crediting when the clock has been set back', () => {
    const next = refreshWeekBudget(regen(3), at(-5 * WEEK_REGEN_MS));
    expect(next.weeksRemaining).toBe(3);
    expect(next.regenFrom).toBe(T0.getTime() - 5 * WEEK_REGEN_MS);
  });

  it('keeps wallHitAt through a credit', () => {
    const next = refreshWeekBudget({ ...regen(0), wallHitAt: 123 }, at(WEEK_REGEN_MS));
    expect(next.wallHitAt).toBe(123);
  });

  describe('converting a midnight-refill save', () => {
    it('honours the midnight refill it was promised when a new day has begun', () => {
      const legacy: WeekBudget = { lastSessionDate: dateKey(day(2026, 7, 2)), weeksRemaining: 0 };
      expect(refreshWeekBudget(legacy, T0)).toEqual({ weeksRemaining: WEEKS_BANK_CAP, regenFrom: null, wallHitAt: null });
    });

    it('keeps the balance on the same day and starts accruing from now', () => {
      const legacy: WeekBudget = { lastSessionDate: dateKey(T0), weeksRemaining: 3 };
      expect(refreshWeekBudget(legacy, T0)).toEqual({ weeksRemaining: 3, regenFrom: T0.getTime(), wallHitAt: null });
    });
  });
});

describe('canSpendWeek / spendWeek', () => {
  it('allows spending while weeks remain, and blocks at zero', () => {
    const budget = regen(1);
    expect(canSpendWeek(budget)).toBe(true);
    const spent = spendWeek(budget, T0);
    expect(spent.weeksRemaining).toBe(0);
    expect(canSpendWeek(spent)).toBe(false);
  });

  it('spendWeek never goes negative', () => {
    expect(spendWeek(regen(0), T0).weeksRemaining).toBe(0);
  });

  it('starts the clock when spending from a full bank', () => {
    const full: WeekBudget = { weeksRemaining: WEEKS_BANK_CAP, regenFrom: null };
    expect(spendWeek(full, at(1_000)).regenFrom).toBe(T0.getTime() + 1_000);
  });

  it('never resets a clock that is already running — playing must not delay the next week', () => {
    expect(spendWeek(regen(5), at(WEEK_REGEN_MS / 2)).regenFrom).toBe(T0.getTime());
  });
});

describe('purchased-weeks pool', () => {
  it('starts empty', () => {
    expect(initialPurchasedWeeksPool()).toEqual({ weeksRemaining: 0, grantedTransactionIds: [], weeksSpent: 0 });
  });

  it('grantPurchasedWeeks credits the pool additively', () => {
    const pool = grantPurchasedWeeks(initialPurchasedWeeksPool(), 20);
    expect(pool.weeksRemaining).toBe(20);
    expect(grantPurchasedWeeks(pool, 60).weeksRemaining).toBe(80);
  });

  it('canSpendAnyWeek is true if either pool has weeks', () => {
    const emptyBudget: WeekBudget = { regenFrom: 0, weeksRemaining: 0 };
    const fullBudget: WeekBudget = { regenFrom: 0, weeksRemaining: 3 };
    const emptyPool = initialPurchasedWeeksPool();
    const fullPool: PurchasedWeeksPool = { weeksRemaining: 5, grantedTransactionIds: [] };

    expect(canSpendAnyWeek(emptyBudget, emptyPool)).toBe(false);
    expect(canSpendAnyWeek(fullBudget, emptyPool)).toBe(true);
    expect(canSpendAnyWeek(emptyBudget, fullPool)).toBe(true);
    expect(canSpendAnyWeek(fullBudget, fullPool)).toBe(true);
  });

  it('spendWeekFromPools spends free weeks before touching the purchased pool', () => {
    const budget: WeekBudget = { regenFrom: 0, weeksRemaining: 1 };
    const purchased: PurchasedWeeksPool = { weeksRemaining: 5, grantedTransactionIds: ['tx1'] };

    const afterFirst = spendWeekFromPools(budget, purchased, T0);
    expect(afterFirst.budget.weeksRemaining).toBe(0);
    expect(afterFirst.purchased.weeksRemaining).toBe(5);
    // Spending from the free budget must never bump the purchased-pool spend counter.
    expect(afterFirst.purchased.weeksSpent ?? 0).toBe(0);

    const afterSecond = spendWeekFromPools(afterFirst.budget, afterFirst.purchased, T0);
    expect(afterSecond.budget.weeksRemaining).toBe(0);
    expect(afterSecond.purchased.weeksRemaining).toBe(4);
    expect(afterSecond.purchased.weeksSpent).toBe(1);
    // Spending never touches the transaction ledger.
    expect(afterSecond.purchased.grantedTransactionIds).toEqual(['tx1']);
  });

  it('spendWeekFromPools increments weeksSpent on the purchased pool, defaulting an unset counter to 0', () => {
    const budget: WeekBudget = { regenFrom: 0, weeksRemaining: 0 };
    // Simulates a pre-existing install's persisted pool, saved before this field existed.
    const legacyPurchased = { weeksRemaining: 3, grantedTransactionIds: ['tx1'] } as PurchasedWeeksPool;

    const once = spendWeekFromPools(budget, legacyPurchased, T0);
    expect(once.purchased.weeksSpent).toBe(1);

    const twice = spendWeekFromPools(once.budget, once.purchased, T0);
    expect(twice.purchased.weeksSpent).toBe(2);
    expect(twice.purchased.weeksRemaining).toBe(1);
  });

  it('spendWeekFromPools is a no-op once both pools are empty', () => {
    const budget: WeekBudget = { regenFrom: 0, weeksRemaining: 0 };
    const purchased = initialPurchasedWeeksPool();

    const result = spendWeekFromPools(budget, purchased, T0);
    expect(result.budget.weeksRemaining).toBe(0);
    expect(result.purchased.weeksRemaining).toBe(0);
  });

  it('regen refreshes the free budget without touching a non-zero purchased pool', () => {
    const purchased: PurchasedWeeksPool = { weeksRemaining: 12, grantedTransactionIds: [] };

    const refreshed = refreshWeekBudget(regen(0), at(WEEK_REGEN_MS));
    expect(refreshed.weeksRemaining).toBe(1);
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
    expect(pool).toEqual({ weeksRemaining: 20, grantedTransactionIds: ['tx1'], weeksSpent: 0 });
  });

  it('preserves weeksSpent across a credit — a purchase must never reset how much was already spent', () => {
    const spent = spendWeekFromPools(
      { regenFrom: 0, weeksRemaining: 0 },
      { weeksRemaining: 1, grantedTransactionIds: [], weeksSpent: 0 },
      T0,
    ).purchased;
    expect(spent.weeksSpent).toBe(1);

    const credited = creditTransaction(spent, 'tx1', 20);
    expect(credited.weeksSpent).toBe(1);
    expect(credited.weeksRemaining).toBe(20);
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

describe('isWeekBudgetExhausted', () => {
  const spent = regen(0);
  const empty: PurchasedWeeksPool = initialPurchasedWeeksPool();

  it('is true only once both pools are spent', () => {
    expect(isWeekBudgetExhausted(spent, empty, false)).toBe(true);
    expect(isWeekBudgetExhausted({ ...spent, weeksRemaining: 1 }, empty, false)).toBe(false);
    expect(isWeekBudgetExhausted(spent, grantPurchasedWeeks(empty, 1), false)).toBe(false);
  });

  it('is never exhausted while a pool is still loading from storage', () => {
    // Deliberate: a slow AsyncStorage read must not read as "out of weeks" and
    // block play on launch.
    expect(isWeekBudgetExhausted(null, empty, false)).toBe(false);
    expect(isWeekBudgetExhausted(spent, null, false)).toBe(false);
    expect(isWeekBudgetExhausted(null, null, false)).toBe(false);
  });

  it('is bypassed entirely by dev free play', () => {
    expect(isWeekBudgetExhausted(spent, empty, true)).toBe(false);
  });
});
