/**
 * Picks the single most relevant thing waiting for the player *tomorrow* —
 * the in-app twin of `notification-content.ts`'s chooser, shown by the
 * end-of-day panel when the daily week budget runs out. Pure and
 * state-derived, and deliberately never reads a clock: "tomorrow" is the
 * caller's framing, not a date this module computes, which keeps it testable
 * the same way as the rest of `src/state/`'s non-React logic.
 */

import { canRaiseRound } from '@/game/balance';
import { ROUND_ORDER, type GameState } from '@/game/types';
import { deriveWeeklyStats } from '@/lib/derived-stats';

/** Runway at or below this many weeks is the thing worth naming for tomorrow. */
export const AGENDA_RUNWAY_WEEKS = 4;
/** An event landing this soon is worth teasing; further out is noise. */
export const AGENDA_EVENT_HORIZON_WEEKS = 3;

export interface TomorrowAgenda {
  /** Stable id for analytics — never rendered. */
  kind: 'decision' | 'runway' | 'raise' | 'event-soon' | 'steady';
  /** One short sentence naming what is waiting. Rendered verbatim. */
  line: string;
}

/**
 * The single most relevant thing waiting for the player tomorrow. Priority
 * order mirrors `notificationContentFor`: a decision already on the table beats
 * a runway scare, which beats an available raise, which beats a card landing
 * soon. Null when there is no live run to come back to.
 *
 * The two ladders are coupled by intent, not by code — the panel and the push
 * notification disagreeing about the same state would read as a bug — so a new
 * tier here is a prompt to consider one there.
 */
export function tomorrowAgendaFor(state: GameState | null): TomorrowAgenda | null {
  if (!state || state.gameOver) return null;

  if (state.pendingEvent) {
    return { kind: 'decision', line: `${state.pendingEvent.title} is waiting on your call.` };
  }

  const { runway } = deriveWeeklyStats(state);
  if (Number.isFinite(runway) && runway <= AGENDA_RUNWAY_WEEKS) {
    return {
      kind: 'runway',
      line: `Runway is down to ${Math.max(0, Math.floor(runway))} weeks — you'll need a plan.`,
    };
  }

  if (state.roundsRaised < ROUND_ORDER.length && canRaiseRound(state.week, state.lastRoundRaisedWeek)) {
    return { kind: 'raise', line: "You're clear to raise — the terms are waiting on the Money tab." };
  }

  // An exhausted deck parks `weeksUntilNextEvent` at the engine's
  // `NO_MORE_EVENTS` sentinel (`Number.MAX_SAFE_INTEGER`), which is itself a
  // safe integer — hence the literal upper bound as well, so a run that has
  // seen every card falls through to the steady line instead of promising an
  // event that will never come.
  const weeks = state.weeksUntilNextEvent;
  if (Number.isSafeInteger(weeks) && weeks > 0 && weeks < 1000 && weeks <= AGENDA_EVENT_HORIZON_WEEKS) {
    return {
      kind: 'event-soon',
      line: `Something lands on the calendar within ${weeks} ${weeks === 1 ? 'week' : 'weeks'}.`,
    };
  }

  return { kind: 'steady', line: `${state.companyName} keeps building overnight — check in tomorrow.` };
}
