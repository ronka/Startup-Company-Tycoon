/**
 * Daily-play streak (PRD F12) — store-layer only, same spirit as
 * `week-budget.ts`: pure, `Date`-driven, and testable with a fixed instant
 * rather than mocked global time. Drives which Morning Standup pool
 * `standupCardForStreak` (in `src/game/events/standup.ts`) hands back.
 */

import { dateKey } from './week-budget';

export interface StreakState {
  /** Local calendar date (YYYY-MM-DD) the streak was last credited for. */
  lastPlayedDate: string;
  streakDays: number;
}

export function initialStreak(now: Date): StreakState {
  return { lastPlayedDate: dateKey(now), streakDays: 1 };
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Credits today's session against the streak, once per local day. One
 * missed day is forgiven (a single grace day: the gap is 2 calendar days
 * apart, and the streak still extends by 1 as if uninterrupted); two or
 * more consecutive misses (a gap of 3+ days) resets the streak to day 1.
 */
export function updateStreak(streak: StreakState, now: Date): StreakState {
  const today = dateKey(now);
  if (today === streak.lastPlayedDate) return streak; // already credited today

  const gapDays = daysBetween(streak.lastPlayedDate, today);
  if (gapDays <= 2) {
    return { lastPlayedDate: today, streakDays: streak.streakDays + 1 };
  }
  return { lastPlayedDate: today, streakDays: 1 };
}
