/**
 * Picks the single most relevant re-engagement message for a `GameState`
 * (Task 16). Pure and state-derived — no `expo-notifications`, no `Date` —
 * so it's testable the same way as the rest of `src/state/`'s non-React
 * logic, independent of whatever's actually wired up to send it.
 */

import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney } from '@/lib/format';
import { AGENDA_RUNWAY_WEEKS, tomorrowAgendaFor, type TomorrowAgenda } from '@/state/day-close';
import type { GameState } from '@/game/types';

export interface NotificationContent {
  title: string;
  body: string;
  /**
   * Which rung produced it — the same vocabulary as the end-of-day panel's
   * `agenda_kind`, plus `progress` for the later reminders. Analytics only.
   */
  kind: TomorrowAgenda['kind'] | 'progress';
}

/** Runway at or below this many weeks is worth a standalone warning — the panel's threshold, by construction. */
export const LOW_RUNWAY_WARNING_WEEKS = AGENDA_RUNWAY_WEEKS;

/**
 * The next-morning nudge. It climbs the *same* ladder as the end-of-day
 * panel's "Tomorrow" line (`tomorrowAgendaFor`) rather than keeping its own:
 * the panel names a thing, and the 09:00 notification has to name the same
 * thing or the pair reads as a bug. Until Sep 2026 this had no `raise` or
 * `event-soon` rung, so most players got the generic line.
 *
 * Null when there's no live run to point back at (no game, or it already ended).
 */
export function notificationContentFor(state: GameState | null): NotificationContent | null {
  const agenda = tomorrowAgendaFor(state);
  if (!state || !agenda) return null;

  switch (agenda.kind) {
    case 'decision':
      return {
        kind: agenda.kind,
        title: `Week ${state.week}: a decision is waiting`,
        body: `${state.pendingEvent?.title ?? 'A decision'} needs your call.`,
      };
    case 'runway': {
      const { runway } = deriveWeeklyStats(state);
      return {
        kind: agenda.kind,
        title: 'Runway warning',
        body: `Runway is down to ${Math.max(0, Math.floor(runway))} weeks.`,
      };
    }
    case 'raise':
      return {
        kind: agenda.kind,
        title: 'Investors are ready',
        body: `${state.companyName} is clear to raise — the terms are waiting on the Money tab.`,
      };
    case 'event-soon':
      return { kind: agenda.kind, title: state.companyName, body: agenda.line };
    case 'steady':
      return {
        kind: agenda.kind,
        title: 'Startup Empire Tycoon',
        body: `Week ${state.week} — come back and check on the team.`,
      };
  }
}

/**
 * Copy for the later reminders in the sequence (day 3 and day 7). By then
 * whatever was "waiting tomorrow" is stale, so these lean on what the player
 * stands to lose instead: their stake in the company so far.
 */
export function progressReminderContentFor(state: GameState | null): NotificationContent | null {
  if (!state || state.gameOver) return null;
  const { stake } = deriveWeeklyStats(state);
  return {
    kind: 'progress',
    title: `${state.companyName} is still waiting`,
    body: `Your stake is ${formatMoney(stake)} — your company's still waiting on you.`,
  };
}
