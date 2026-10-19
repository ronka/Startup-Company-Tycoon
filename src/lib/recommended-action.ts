/**
 * The one best move right now, for the guided first weeks' recommended action
 * (plans/2026-10-18-first-weeks-journey-plan.md, A4). Grew out of
 * `actionNowFor` in `src/state/day-close.ts`, which only knows "raise".
 *
 * Pure rule table, first match wins. The guide (`src/lib/guide.ts`) turns it
 * into the tab and control to point at.
 */

import { CUSTOMERS_PER_SUPPORT } from '@/game/balance';
import { type GameState } from '@/game/types';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { raiseAvailable } from '@/state/day-close';

export type RecommendedActionId = 'answer-card' | 'hire-dev' | 'hire-sales' | 'hire-support' | 'raise' | 'next-week';

/** Uncovered customers worth a support hire. Coverage is short from the very first customer, but one support salary for a handful of them is a bad trade. */
export const SUPPORT_RECOMMEND_UNCOVERED = 25;
/** Runway below which raising becomes the recommended move. */
export const RAISE_RECOMMEND_RUNWAY_WEEKS = 10;

export interface RecommendedAction {
  id: RecommendedActionId;
  /** Button text, plain language. */
  label: string;
  /** Fits the HUD's narrow Next Week slot. */
  shortLabel: string;
}

const LABELS: Record<RecommendedActionId, string> = {
  'answer-card': 'Answer the card',
  'hire-dev': 'Hire a developer',
  'hire-sales': 'Hire a salesperson',
  'hire-support': 'Hire support',
  raise: 'Review a term sheet',
  'next-week': 'Next week',
};

function pick(state: GameState): RecommendedActionId {
  if (state.pendingEvent) return 'answer-card';
  const team = state.pendingHeadcount;
  if (team.devs === 0) return 'hire-dev';
  if (team.sales === 0) return 'hire-sales';
  if (Math.floor(state.customers) - team.support * CUSTOMERS_PER_SUPPORT >= SUPPORT_RECOMMEND_UNCOVERED) {
    return 'hire-support';
  }
  const { runway } = deriveWeeklyStats(state);
  if (
    raiseAvailable(state) &&
    runway < RAISE_RECOMMEND_RUNWAY_WEEKS
  ) {
    return 'raise';
  }
  return 'next-week';
}

const SHORT_LABELS: Partial<Record<RecommendedActionId, string>> = {
  'hire-dev': 'Hire a dev',
  'hire-sales': 'Hire sales',
};

export function recommendedAction(state: GameState): RecommendedAction {
  const id = pick(state);
  return { id, label: LABELS[id], shortLabel: SHORT_LABELS[id] ?? LABELS[id] };
}
