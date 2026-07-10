/**
 * Daily week-budget: a store-layer-only rate limit on `TICK` (PRD F12). Kept
 * entirely out of `src/game/` — the pure engine never sees a clock or a
 * `Date` — so this is plain, independently testable logic that `game-store.tsx`
 * wires up around `dispatch`. Every function here takes `now`
 * as an explicit argument rather than reading the clock itself, so tests can
 * drive it with a fixed `Date` instead of mocking global time.
 */

/** Game-weeks granted per new local day. */
export const WEEKS_PER_DAY = 5;
/** The budget never banks past this many weeks, no matter how many days are skipped. */
export const WEEKS_BANK_CAP = 10;

export interface WeekBudget {
  /** Local calendar date (YYYY-MM-DD) the budget was last refreshed for. */
  lastSessionDate: string;
  weeksRemaining: number;
}

/** Local (not UTC) calendar-day key — refresh timing follows the player's own clock. */
export function dateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A brand-new budget, as granted on first install. */
export function initialWeekBudget(now: Date): WeekBudget {
  return { lastSessionDate: dateKey(now), weeksRemaining: WEEKS_PER_DAY };
}

/**
 * Grants a new day's allotment exactly once per local calendar-day change,
 * banked to `WEEKS_BANK_CAP`. Skipping several days still only grants one
 * day's worth — the cap (not per-day accumulation across the gap) is what
 * keeps a week-long absence from handing back a huge lump sum.
 */
export function refreshWeekBudget(budget: WeekBudget, now: Date): WeekBudget {
  const today = dateKey(now);
  if (today === budget.lastSessionDate) return budget;
  return {
    lastSessionDate: today,
    weeksRemaining: Math.min(WEEKS_BANK_CAP, budget.weeksRemaining + WEEKS_PER_DAY),
  };
}

export function canSpendWeek(budget: WeekBudget): boolean {
  return budget.weeksRemaining > 0;
}

/** Spend one week (one TICK). Never goes below 0. */
export function spendWeek(budget: WeekBudget): WeekBudget {
  return { ...budget, weeksRemaining: Math.max(0, budget.weeksRemaining - 1) };
}

/**
 * Weeks bought via IAP (PRD week-packs). Kept as a pool entirely separate
 * from the free daily `WeekBudget`: unlike the free budget it is exempt from
 * `WEEKS_BANK_CAP`, never expires, and outlives `NEW_GAME` — a purchase is a
 * durable entitlement, not a daily allowance.
 *
 * `grantedTransactionIds` lives on the same object (not a separate store) so
 * it always persists in the same write as `weeksRemaining` (Task 5): a
 * RevenueCat transaction can only ever be marked granted in the same atomic
 * update that credits its weeks, so a crash between the two is impossible —
 * the transaction is either fully applied or, on the next reconciliation
 * pass, looks exactly like it was never applied at all.
 */
export interface PurchasedWeeksPool {
  weeksRemaining: number;
  grantedTransactionIds: string[];
}

/** The pool as it stands before any purchase has ever been made. */
export function initialPurchasedWeeksPool(): PurchasedWeeksPool {
  return { weeksRemaining: 0, grantedTransactionIds: [] };
}

/** Credit `amount` weeks with no transaction ledger involved (dev grant, stub purchases). */
export function grantPurchasedWeeks(pool: PurchasedWeeksPool, amount: number): PurchasedWeeksPool {
  return { ...pool, weeksRemaining: pool.weeksRemaining + amount };
}

/**
 * Credits `weeks` for a specific RevenueCat transaction and marks it granted,
 * in one update — the crash-safe primitive purchase completion and launch
 * reconciliation both funnel through (Task 5). Idempotent: a transaction
 * already in the ledger is a no-op, so calling this twice for the same
 * transaction (e.g. an overlapping purchase-completion and launch-reconcile
 * pass) never double-grants.
 */
export function creditTransaction(pool: PurchasedWeeksPool, transactionId: string, weeks: number): PurchasedWeeksPool {
  if (pool.grantedTransactionIds.includes(transactionId)) return pool;
  return {
    weeksRemaining: pool.weeksRemaining + weeks,
    grantedTransactionIds: [...pool.grantedTransactionIds, transactionId],
  };
}

/** Credits a batch of transactions in one pass (e.g. the result of launch reconciliation). */
export function creditTransactions(
  pool: PurchasedWeeksPool,
  transactions: readonly { transactionId: string; weeks: number }[],
): PurchasedWeeksPool {
  return transactions.reduce((acc, tx) => creditTransaction(acc, tx.transactionId, tx.weeks), pool);
}

/** True once either pool — free or purchased — has a week left to spend. */
export function canSpendAnyWeek(budget: WeekBudget, purchased: PurchasedWeeksPool): boolean {
  return canSpendWeek(budget) || purchased.weeksRemaining > 0;
}

/**
 * Spend one week, free budget first and the purchased pool only once the
 * free budget is exhausted — a purchase should never feel like it "ate" the
 * daily free allotment. No-op if both pools are already empty; callers
 * should gate on `canSpendAnyWeek` first.
 */
export function spendWeekFromPools(
  budget: WeekBudget,
  purchased: PurchasedWeeksPool,
): { budget: WeekBudget; purchased: PurchasedWeeksPool } {
  if (canSpendWeek(budget)) return { budget: spendWeek(budget), purchased };
  if (purchased.weeksRemaining > 0) {
    return { budget, purchased: { ...purchased, weeksRemaining: purchased.weeksRemaining - 1 } };
  }
  return { budget, purchased };
}
