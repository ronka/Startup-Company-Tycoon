/**
 * The event catalog + capture helpers. `EVENTS` is the single source of truth
 * for every event name (snake_case), so dashboards and code never drift. Use
 * `track(EVENTS.x, props)` everywhere rather than string literals.
 */

import { deriveWeeklyStats } from '@/lib/derived-stats';
import type { GameState } from '@/game/types';

import { posthog } from './posthog';

export const EVENTS = {
  // Start menu / navigation
  NEW_GAME_TAPPED: 'new_game_tapped',
  CONTINUE_RUN_TAPPED: 'continue_run_tapped',
  TAB_VIEWED: 'tab_viewed',
  MENU_OPENED: 'menu_opened',
  HELP_VIEWED: 'help_viewed',
  HISTORY_VIEWED: 'history_viewed',
  SETTINGS_VIEWED: 'settings_viewed',

  // Onboarding / identity
  ONBOARDING_VIEWED: 'onboarding_viewed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  CEO_NAME_SET: 'ceo_name_set',
  /** The intro story sequence was shown (first-ever run only). */
  ONBOARDING_INTRO_STARTED: 'onboarding_intro_started',
  /** One intro step came into view — `{ step }` is the step id (hook/name/founder/reflect). */
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  /** The founder-type answer, which also sets the run's starting `focus`. */
  ONBOARDING_FOUNDER_TYPE: 'onboarding_founder_type',
  /** "Skip intro" tapped — `{ at_step }` records where. */
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  /** The intro was replayed from Settings. */
  ONBOARDING_REPLAY_REQUESTED: 'onboarding_replay_requested',

  // Game lifecycle
  GAME_STARTED: 'game_started',
  WEEK_ADVANCED: 'week_advanced',
  WEEK_ADVANCE_BLOCKED: 'week_advance_blocked',
  STAGE_ADVANCED: 'stage_advanced',
  ERA_CHANGED: 'era_changed',
  TREND_PHASE_CHANGED: 'trend_phase_changed',
  GAME_OVER: 'game_over',
  GAME_OVER_VIEWED: 'game_over_viewed',
  /** The run that just ended set a new personal-best score (score > 0, strictly greater than the prior best). */
  NEW_BEST_SCORE: 'new_best_score',
  /**
   * The share sheet was opened from the game-over screen. `outcome` is how it
   * closed (`shared` / `dismissed` / `failed`), so the dismissal rate is
   * visible rather than every tap counting as a share.
   */
  RUN_SHARED: 'run_shared',
  SAVE_CLEARED: 'save_cleared',
  APP_RESET: 'app_reset',

  // Core decisions
  HIRES_CHANGED: 'hires_changed',
  LAYOFF_CONFIRMED: 'layoff_confirmed',
  MORALE_LEVER_TOGGLED: 'morale_lever_toggled',
  CLEVEL_HIRED: 'clevel_hired',
  CLEVEL_FIRED: 'clevel_fired',
  CANDIDATES_VIEWED: 'candidates_viewed',
  FUNDING_ROUND_RAISED: 'funding_round_raised',
  RUN_ENDED_IPO: 'run_ended_ipo',
  FOCUS_CHANGED: 'focus_changed',
  FOCUS_PICKER_OPENED: 'focus_picker_opened',
  BURN_BREAKDOWN_OPENED: 'burn_breakdown_opened',
  EVENT_DECISION_MADE: 'event_decision_made',

  // Retention / streak / notifications
  DAILY_STREAK_CREDITED: 'daily_streak_credited',
  DAILY_STANDUP_SHOWN: 'daily_standup_shown',
  /**
   * The OS permission dialog was spent — once per install, so `trigger`
   * (`daily_wall` | `second_launch`) records which moment spent it. Break the
   * `granted` rate down by `trigger` to judge whether asking at the wall beats
   * the second-launch fallback.
   */
  NOTIFICATION_PERMISSION_REQUESTED: 'notification_permission_requested',
  REENGAGEMENT_NOTIFICATION_SCHEDULED: 'reengagement_notification_scheduled',
  NOTIFICATION_OPENED: 'notification_opened',
  /** The end-of-day panel was shown — `{ agenda_kind }` is the hook it offered. */
  DAY_COMPLETE_SHOWN: 'day_complete_shown',
  /** How the end-of-day panel was closed — `{ action }` is 'dismiss' | 'buy_weeks'. */
  DAY_COMPLETE_DISMISSED: 'day_complete_dismissed',

  // First-run hints / debug
  /** A contextual hint became visible (won its screen's single hint slot). */
  HINT_SHOWN: 'hint_shown',
  HINT_DISMISSED: 'hint_dismissed',
  DEBUG_MENU_OPENED: 'debug_menu_opened',
  HINTS_RESET: 'hints_reset',
  DEV_FREE_PLAY_TOGGLED: 'dev_free_play_toggled',

  // IAP week packs + revive
  PAYWALL_SHOWN: 'paywall_shown',
  PURCHASE_STARTED: 'purchase_started',
  PURCHASE_COMPLETED: 'purchase_completed',
  PURCHASE_FAILED: 'purchase_failed',
  /** A revive token was consumed to un-end a bankrupt run (bought or dev-granted). */
  REVIVE_REDEEMED: 'revive_redeemed',

  // App Store review
  /**
   * The native review sheet was requested — `{ trigger, ask_number }`. Whether it
   * actually *appeared* is unknowable: iOS returns no callback and throttles
   * silently, so this counts intent, not impressions. The only outcome signal is
   * the ratings count in App Store Connect; compare it against this event's volume
   * broken down by `trigger`.
   */
  REVIEW_PROMPT_REQUESTED: 'review_prompt_requested',
  /**
   * A trigger fired but the gate declined — `{ trigger, reason }`. Emitted at most
   * once per reason per launch (see `store-review.ts`), because with no OS callback
   * a silent gate is indistinguishable from a broken one, and `cap_reached` would
   * otherwise fire on every funding round for the rest of an install's life.
   */
  REVIEW_PROMPT_SUPPRESSED: 'review_prompt_suppressed',
  /** The Settings "Rate this game" row was tapped — opens the store listing, not the native sheet. */
  REVIEW_LINK_OPENED: 'review_link_opened',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

type Props = Record<string, unknown>;

/**
 * Thin, always-safe wrapper over `posthog.capture`. Never throws — analytics
 * must not be able to crash the game — so any capture error is swallowed.
 */
export function track(event: EventName, props?: Props): void {
  try {
    // Cast to capture()'s own JSON-property type: our bags may carry `undefined`
    // values (dropped at ingest), which the stricter JsonType disallows.
    posthog.capture(event, props as Parameters<typeof posthog.capture>[1]);
  } catch {
    // Analytics is best-effort; never let it break gameplay.
  }
}

/**
 * The standard run-context property bag attached to every game event, so any
 * event can be broken down by week / stage / era / cash without bespoke props
 * at each call site. Money figures are rounded to keep the property values tidy.
 */
export function gameProps(state: GameState): Props {
  const { burn, revenue, valuation, runway } = deriveWeeklyStats(state);
  return {
    week: state.week,
    cash: Math.round(state.cash),
    revenue: Math.round(revenue),
    burn: Math.round(burn),
    valuation: Math.round(valuation),
    runway: Number.isFinite(runway) ? Math.round(runway) : null,
    morale: Math.round(state.morale),
    market_share: Number((state.marketShare * 100).toFixed(2)),
    stage: state.stage,
    era: state.era,
    focus: state.focus,
    trend_id: state.trend.id,
    trend_phase: state.trend.phase,
    founder_equity: Number((state.founderEquity * 100).toFixed(1)),
    rounds_raised: state.roundsRaised,
    customers: Math.round(state.customers),
  };
}
