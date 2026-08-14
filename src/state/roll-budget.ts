/**
 * Daily hire-roll budget: a store-layer-only rate limit on `ROLL_CANDIDATES`,
 * built to the same rules as `week-budget.ts`. Kept entirely out of
 * `src/game/` — the pure engine never sees a clock or a `Date` — so this is
 * plain, independently testable logic that `game-store.tsx` wires up around
 * `dispatch`. Every function takes `now` as an explicit argument rather than
 * reading the clock itself, so tests drive it with a fixed `Date`.
 *
 * `dateKey` is imported rather than redefined: the two budgets refresh on the
 * same day boundary, and a second definition is a second thing to get wrong.
 */

import { dateKey } from './week-budget';

/**
 * Rolls granted per new local day. Deliberately small: simulation of a
 * realistic ~16-day run puts 2/day at four runs in five seeing a legend, which
 * is what keeps a legend a moment rather than an expectation.
 */
export const ROLLS_PER_DAY = 2;
/** The budget never banks past this, no matter how many days are skipped. */
export const ROLLS_BANK_CAP = 6;

export interface RollBudget {
  /** Local calendar date (YYYY-MM-DD) the budget was last refreshed for. */
  lastSessionDate: string;
  rollsRemaining: number;
}

/** A brand-new budget, as granted on first install. */
export function initialRollBudget(now: Date): RollBudget {
  return { lastSessionDate: dateKey(now), rollsRemaining: ROLLS_PER_DAY };
}

/**
 * Grants a new day's allotment exactly once per local calendar-day change,
 * banked to `ROLLS_BANK_CAP`. Skipping several days still only grants one
 * day's worth — the cap, not per-day accumulation across the gap, is what
 * turns a two-day absence into three spins in one sitting rather than a pile.
 */
export function refreshRollBudget(budget: RollBudget, now: Date): RollBudget {
  const today = dateKey(now);
  if (today === budget.lastSessionDate) return budget;
  return {
    lastSessionDate: today,
    rollsRemaining: Math.min(ROLLS_BANK_CAP, budget.rollsRemaining + ROLLS_PER_DAY),
  };
}

export function canRoll(budget: RollBudget): boolean {
  return budget.rollsRemaining > 0;
}

/** Spend one roll. Never goes below 0. */
export function spendRoll(budget: RollBudget): RollBudget {
  return { ...budget, rollsRemaining: Math.max(0, budget.rollsRemaining - 1) };
}

/**
 * The roll wall: no spins left, and not bypassed by dev free play. Shared by
 * the store's `ROLL_CANDIDATES` gate and the picker chrome that renders the
 * wall, for the same reason `isWeekBudgetExhausted` is shared — if the two
 * predicates drifted you would get a wall with a working button behind it.
 *
 * A `null` budget means AsyncStorage has not resolved yet and is deliberately
 * *not* exhausted, so a slow read never blocks a spin.
 */
export function isRollBudgetExhausted(budget: RollBudget | null, devFreePlay: boolean): boolean {
  if (devFreePlay) return false;
  if (budget === null) return false;
  return !canRoll(budget);
}
