/**
 * Picks the single most relevant re-engagement message for a `GameState`
 * (Task 16). Pure and state-derived — no `expo-notifications`, no `Date` —
 * so it's testable the same way as the rest of `src/state/`'s non-React
 * logic, independent of whatever's actually wired up to send it.
 */

import { deriveWeeklyStats } from '@/lib/derived-stats';
import type { GameState } from '@/game/types';

export interface NotificationContent {
  title: string;
  body: string;
}

/** Runway at or below this many weeks is worth a standalone warning. */
export const LOW_RUNWAY_WARNING_WEEKS = 4;

/**
 * Priority order: a decision card waiting on the player beats a runway
 * scare, which beats a plain "come back and check in" nudge. Null when
 * there's no live run to point back at (no game, or it already ended).
 */
export function notificationContentFor(state: GameState | null): NotificationContent | null {
  if (!state || state.gameOver) return null;

  if (state.pendingEvent) {
    return {
      title: `Week ${state.week}: a decision is waiting`,
      body: `${state.pendingEvent.title} needs your call.`,
    };
  }

  const { runway } = deriveWeeklyStats(state);
  if (Number.isFinite(runway) && runway <= LOW_RUNWAY_WARNING_WEEKS) {
    return {
      title: 'Runway warning',
      body: `Runway is down to ${Math.max(0, Math.floor(runway))} weeks.`,
    };
  }

  return {
    title: 'Startup Tycoon',
    body: `Week ${state.week} — come back and check on the team.`,
  };
}
