/**
 * Core game types. This module is pure data — no React, React Native, or Expo
 * imports may ever appear anywhere under `src/game/`.
 */

import { Era, EventCard, NewsEntry, TimedEffect } from './events/types';

export const ROLES = ['devs', 'sales', 'support'] as const;
export type Role = (typeof ROLES)[number];

/** Headcount of rank-and-file employees per role. */
export type Headcount = Record<Role, number>;

/**
 * Seeded RNG state, serialized inside GameState so a save replays identically.
 * `seed` is the evolving 32-bit accumulator; `counter` tracks how many draws
 * have happened (useful for debugging / determinism assertions).
 */
export interface RngState {
  seed: number;
  counter: number;
}

export type GameOverReason = 'bankruptcy' | 'acquired' | 'ipo';

export const C_LEVEL_ROLES = ['cto', 'cmo', 'cfo'] as const;
export type CLevelRole = (typeof C_LEVEL_ROLES)[number];

/**
 * Which mechanical hook a perk plugs into. Each role has multiple axes so
 * pools offer genuine tradeoffs rather than one "bigger number" stat:
 * - cto-productivity: dev-effort multiplier (pure upside)
 * - cto-techDebt: quality-decay multiplier, <1 (pure upside, different axis)
 * - cto-shortcut: dev-effort multiplier *and* a worse quality-decay
 *   multiplier — same tier moves both together, a real bargain
 * - cmo-hypeGain: hype-impact multiplier (pure upside)
 * - cmo-hypeDecay: hype-decay-rate multiplier, <1 slows decay (pure upside)
 * - cfo-burnCut: fixed-burn multiplier, <1 (pure upside)
 * - cfo-roundTerms: next round's dilution multiplier, <1 (pure upside)
 */
export type CLevelPerkAxis =
  | 'cto-productivity'
  | 'cto-techDebt'
  | 'cto-shortcut'
  | 'cmo-hypeGain'
  | 'cmo-hypeDecay'
  | 'cfo-burnCut'
  | 'cfo-roundTerms';

/** A perk multiplier applied inside the relevant balance formula for its axis. */
export interface CLevelPerk {
  id: string;
  label: string;
  axis: CLevelPerkAxis;
  multiplier: number;
  /** Only set on tradeoff axes (e.g. cto-shortcut): the cost side of the bargain. */
  tradeoffMultiplier?: number;
}

/** A small, purely-cosmetic-mechanically-tiny trait: nudges salary, never perk power. */
export interface CLevelQuirk {
  label: string;
  /** e.g. -0.05 = asks 5% less; +0.05 = asks 5% more. Applied to salary only. */
  salaryDeltaFraction: number;
}

export interface CLevelCandidate {
  id: string;
  name: string;
  personality: string;
  salary: number;
  perk: CLevelPerk;
  quirk: CLevelQuirk | null;
}

/** One C-level seat: either filled, or open with a standing offer. */
export interface CLevelSlot {
  hired: CLevelCandidate | null;
  /** The current offer for this seat; persists until hired or the seat is refreshed by a firing. */
  candidates: CLevelCandidate[];
}

export type CLevels = Record<CLevelRole, CLevelSlot>;

/**
 * A named competitor. Grows by script (Task 7), later era events (Task 8) may
 * push it around. `focus` is its own strategic bet — distinct from the other
 * rival's at generation — that couples its weekly growth and share to the
 * live tech trend wave the same way the player's does (see `trendFactorsFor`
 * in balance.ts); a desperation pivot can switch it later (see
 * `applyDesperationPivots` in rivals.ts).
 */
export interface Rival {
  name: string;
  productQuality: number;
  marketShare: number;
  focus: FocusId;
}

/**
 * The company's strategic bet: reshapes quality growth, ARPC, churn, and
 * hype gain (see `FOCUS_PROFILES` in balance.ts), with a costly transition
 * drag when switching. `ai` and `hardware` align with the matching tech
 * trend wave (Task 3); `hype` counts as half-aligned with whatever trend is
 * hot; `core` gets a flight-to-quality bonus when a trend crashes.
 */
export const FOCUS_IDS = ['core', 'ai', 'hardware', 'hype'] as const;
export type FocusId = (typeof FOCUS_IDS)[number];

/**
 * The market's rotating hot trend. `'crypto'` matches no focus's `trendTag`
 * — a pure-noise wave only the `hype` focus can ride (at half strength; see
 * `trendFactorsFor` in balance.ts).
 */
export const TREND_IDS = ['ai', 'hardware', 'crypto'] as const;
export type TrendId = (typeof TREND_IDS)[number];

/** Phase machine driving a trend's rise and fall — see `advanceTrend` in trends.ts. */
export const TREND_PHASES = ['quiet', 'rising', 'peak', 'crash'] as const;
export type TrendPhase = (typeof TREND_PHASES)[number];

/** The market's current tech wave: which one, what stage it's at, and how long it's been there. */
export interface Trend {
  id: TrendId;
  phase: TrendPhase;
  /** Weeks spent in the current phase so far. */
  weeksInPhase: number;
  /** Weeks this phase lasts before transitioning — reseeded on every phase change. */
  phaseDuration: number;
}

/** The three funding rounds a run can raise, in order. */
export const ROUND_ORDER = ['seed', 'seriesA', 'seriesB'] as const;
export type RoundType = (typeof ROUND_ORDER)[number];

/** Company stage; raising a round advances it (seriesB raises straight to growth). */
export const STAGE_ORDER = ['garage', 'seed', 'seriesA', 'growth'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

/** The entire serializable game model. */
export interface GameState {
  /** The seed the run was created with (for display / reproduction). */
  createdWithSeed: number;
  /** The company name chosen at onboarding; drives the HQ header. */
  companyName: string;
  rng: RngState;

  // Clock
  week: number;

  // Money
  cash: number;
  /** Consecutive weeks ending with cash < 0; resets to 0 the moment cash recovers. */
  weeksInTheRed: number;

  // Team
  headcount: Headcount;
  /** Queued headcount changes from the Team tab steppers; applied as a batch on tick. */
  pendingHeadcount: Headcount;
  morale: number; // 0–100
  /** Team offsite/perks budget: costs cash and boosts morale every tick while on. */
  moraleLeverActive: boolean;

  // Product & market
  /** Accumulates from dev effort each tick, decays from tech-debt drag. */
  productQuality: number;
  /** Neutral 1.0 for now; timeline events (Task 6+) push this around. */
  hype: number;
  /** Your installed customer base. Grows from leads × conversion, shrinks from churn. Revenue = customers × ARPC. */
  customers: number;
  /** Total addressable customer pool. Grows weekly (era-scaled); rivals' implied customer counts are share × this, UI-only. */
  marketCustomers: number;
  /** Your share of the market, 0–1. Derived each tick as `customers / marketCustomers`, not shifted directly. */
  marketShare: number;
  /** The active strategic bet; starts `'core'`. */
  focus: FocusId;
  /** Week `focus` was last switched — gates the `FOCUS_TRANSITION_WEEKS` drag. 0 at game start (no drag on the initial 'core' focus). */
  focusChangedWeek: number;
  /** The market's current tech wave — rotates id and cycles phases each tick (see `advanceTrend` in trends.ts). */
  trend: Trend;
  /** Rolling valuation-per-week series, capped for the HQ sparkline. */
  valuationHistory: number[];
  /** Exactly 2 named competitors, each with their own quality and market share. */
  rivals: Rival[];

  /** CTO / CMO / CFO seats: each either filled or carrying a standing offer. */
  cLevels: CLevels;

  // Funding
  /** Founder's remaining ownership, 0–1. Diluted by each round raised. */
  founderEquity: number;
  stage: Stage;
  /** How many of the 3 rounds (seed/A/B) have been raised so far. */
  roundsRaised: number;
  /** Week the last round closed; null before any round is raised. Gates the raise cooldown. */
  lastRoundRaisedWeek: number | null;

  // Timeline events
  /** Set when a decision card is drawn; TICK is a no-op until it's answered. */
  pendingEvent: EventCard | null;
  /** Timed effects currently counting down (from resolved cards). */
  activeTimedEffects: TimedEffect[];
  /** Resolved events, newest first. */
  newsLog: NewsEntry[];
  /** Ids already drawn this run, so a deck never repeats a card. */
  drawnEventIds: string[];
  /** Simple string flags set by resolved cards; gate flag-chained follow-up cards. */
  storyFlags: string[];
  /** Ticks remaining until the next card is drawn (2–4, reset on every draw). */
  weeksUntilNextEvent: number;

  // Eras
  era: Era;
  /** This run's seeded, jittered week the Boom era starts — rolled once in `newGame`. */
  boomStartWeek: number;
  /** This run's seeded, jittered week the Reckoning era starts — rolled once in `newGame`. */
  reckoningStartWeek: number;

  // Exits
  /** Whether an IPO can be initiated right now, independent of revenue/stage. Hardcoded true until Task 5 wires it to eras. */
  ipoWindowOpen: boolean;
  /** Consecutive weeks revenue has cleared `IPO_REVENUE_BAR`; resets to 0 the moment it dips below. */
  weeksRevenueAboveIpoBar: number;

  /** null while the run is live; set once the game ends. */
  gameOver: GameOverReason | null;
  /** Founder take-home at exit — founderEquity × exit valuation; 0 for bankruptcy. Null while the run is live. */
  finalScore: number | null;
}

export type GameAction =
  | { type: 'TICK' }
  | { type: 'NEW_GAME'; seed?: number; companyName: string }
  | { type: 'SET_PENDING_HIRES'; role: Role; delta: number }
  | { type: 'SET_MORALE_LEVER'; active: boolean }
  | { type: 'HIRE_CLEVEL'; role: CLevelRole; candidateId: string }
  | { type: 'FIRE_CLEVEL'; role: CLevelRole }
  | { type: 'RAISE_ROUND' }
  | { type: 'ANSWER_EVENT'; choiceIndex: number }
  | { type: 'GO_PUBLIC' }
  | { type: 'SET_FOCUS'; focus: FocusId };
