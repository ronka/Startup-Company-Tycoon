/**
 * Daily week-budget: a store-layer-only rate limit on `TICK` (PRD F12). Kept
 * entirely out of `src/game/` — the pure engine never sees a clock or a
 * `Date` — so this is plain, independently testable logic that `game-store.tsx`
 * wires up around `dispatch`/`fastForward`. Every function here takes `now`
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

/** Spend several weeks at once (one `fastForward` call). Never goes below 0. */
export function spendWeeks(budget: WeekBudget, weeks: number): WeekBudget {
  return { ...budget, weeksRemaining: Math.max(0, budget.weeksRemaining - weeks) };
}
