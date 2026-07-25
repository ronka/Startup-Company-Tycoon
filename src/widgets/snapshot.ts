/**
 * Turns the app's state into the flat props the home screen widget renders
 * (plan: `plans/2026-07-21-ios-home-screen-widget.md`). Pure and
 * `Date`-argument-taking, in the same spirit as `src/state/notification-content.ts`
 * and `src/state/week-budget.ts` — no React, no React Native, no `expo-widgets`,
 * so it tests under vitest with nothing native to stub. The platform integration
 * lives entirely in `./sync`.
 *
 * ## Why the props are pre-formatted strings
 *
 * `babel-preset-expo`'s widgets plugin stringifies the `'widget'`-directive
 * function's **own source** and hands that string to the extension, where it is
 * evaluated against nothing but `expo-widgets`' own globals (the `@expo/ui`
 * components, the modifiers, a minimal React/JSX runtime). Nothing the widget
 * module imports or defines at module scope exists over there — including
 * `src/lib/format.ts`. So every string the tile shows is formatted **here**, in
 * the app process, and travels across as a prop. That keeps `format.ts` the one
 * source of truth for how `$4.2M` is written (the plan's actual requirement)
 * and puts the formatting under the tests below rather than in a layer that can
 * only be checked on a device.
 */

import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney, formatWeeks } from '@/lib/format';
import type { GameOverReason, GameState } from '@/game/types';
import { LOW_RUNWAY_WARNING_WEEKS } from '@/state/notification-content';
import { refreshWeekBudget, type PurchasedWeeksPool, type WeekBudget } from '@/state/week-budget';

export interface WidgetSnapshot {
  /** Which layout branch renders: no run at all, a live run, or a finished one. */
  status: 'none' | 'run' | 'over';
  companyName: string;
  week: number;
  /** Pre-formatted (see the module note); `'$4.2M'`. */
  cashLabel: string;
  /** Pre-formatted; `'12 wk'`, or `'∞'` when nothing is being burned. */
  runwayLabel: string;
  /** Pre-formatted; `'$4.2M'`. */
  valuationLabel: string;
  /** Free daily budget + purchased pool — "turns you can play right now". */
  weeksReady: number;
  /** Runway is at or below the warning line, or cash has already gone negative. */
  runwayCritical: boolean;
  /** Cash has gone negative — the number itself renders in `danger`. */
  cashNegative: boolean;
  /** Set when a decision card is blocking TICK. */
  decisionPending: boolean;
  /** How the run ended, ready to display (`'Acquired'`); empty while it's live. */
  outcomeLabel: string;
  /** The run ended on an exit rather than bankruptcy — drives the colour. */
  outcomeWon: boolean;
  /** Founder take-home at exit, pre-formatted; empty for bankruptcy and live runs. */
  scoreLabel: string;
}

/** A timeline entry: the props to show, and the moment they become true. */
export interface WidgetTimelineEntry {
  date: Date;
  props: WidgetSnapshot;
}

const OUTCOME_LABEL: Record<GameOverReason, string> = {
  acquired: 'Acquired',
  ipo: 'IPO',
  bankruptcy: 'Bankrupt',
};

/** The next local (not UTC) midnight — when `refreshWeekBudget` grants the new day's weeks. */
export function nextLocalMidnight(now: Date): Date {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight;
}

const EMPTY: WidgetSnapshot = {
  status: 'none',
  companyName: '',
  week: 0,
  cashLabel: '',
  runwayLabel: '',
  valuationLabel: '',
  weeksReady: 0,
  runwayCritical: false,
  cashNegative: false,
  decisionPending: false,
  outcomeLabel: '',
  outcomeWon: false,
  scoreLabel: '',
};

/**
 * `weekBudget` / `purchasedWeeks` are nullable because the store leaves them
 * null until the initial load resolves; a missing pool simply contributes 0.
 */
export function widgetSnapshot(
  state: GameState | null,
  weekBudget: WeekBudget | null,
  purchasedWeeks: PurchasedWeeksPool | null,
): WidgetSnapshot {
  const weeksReady = (weekBudget?.weeksRemaining ?? 0) + (purchasedWeeks?.weeksRemaining ?? 0);

  // No save — which is also "onboarding never finished", since a GameState only
  // exists once onboarding starts a run. Nothing to show but the invitation.
  if (!state) return { ...EMPTY, weeksReady };

  if (state.gameOver) {
    // A dead run's live cash and runway are meaningless — showing them reads as
    // a bug — so the terminal tile carries only the outcome and the score.
    const won = state.gameOver !== 'bankruptcy';
    return {
      ...EMPTY,
      status: 'over',
      companyName: state.companyName,
      week: state.week,
      weeksReady,
      outcomeLabel: OUTCOME_LABEL[state.gameOver],
      outcomeWon: won,
      scoreLabel: won ? formatMoney(state.finalScore ?? 0) : '',
    };
  }

  const { runway, valuation } = deriveWeeklyStats(state);
  const cashNegative = state.cash < 0;
  return {
    status: 'run',
    companyName: state.companyName,
    week: state.week,
    cashLabel: formatMoney(state.cash),
    // `formatWeeks` already renders a non-finite runway (a profitable run) as
    // '∞', which is also why no raw `Infinity` ever has to cross the bridge —
    // it would not survive the trip.
    runwayLabel: formatWeeks(runway),
    valuationLabel: formatMoney(valuation),
    weeksReady,
    runwayCritical: cashNegative || (Number.isFinite(runway) && runway <= LOW_RUNWAY_WARNING_WEEKS),
    cashNegative,
    decisionPending: state.pendingEvent != null,
    outcomeLabel: '',
    outcomeWon: false,
    scoreLabel: '',
  };
}

/**
 * Exactly two entries: now, and next local midnight.
 *
 * `refreshWeekBudget` grants a day's allotment **once** per new local calendar
 * day however many days were skipped, so the value a returning player receives
 * is the same tomorrow as next week — one forecast entry at midnight stays
 * truthful indefinitely, and any multi-day ramp toward the cap would
 * over-promise. The forecast runs the real `refreshWeekBudget` against midnight
 * rather than re-deriving `min(cap, free + perDay)` here, so the widget's
 * promise can never drift from what the app actually grants.
 */
export function widgetTimeline(
  state: GameState | null,
  weekBudget: WeekBudget | null,
  purchasedWeeks: PurchasedWeeksPool | null,
  now: Date,
): WidgetTimelineEntry[] {
  const midnight = nextLocalMidnight(now);
  const forecastBudget = weekBudget ? refreshWeekBudget(weekBudget, midnight) : null;
  return [
    { date: new Date(now), props: widgetSnapshot(state, weekBudget, purchasedWeeks) },
    { date: midnight, props: widgetSnapshot(state, forecastBudget, purchasedWeeks) },
  ];
}
