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

/**
 * Price band a perk tier sits in — the six rungs of the hire ladder, cheapest
 * first. `scrappy` / `mid` / `elite` are the original three; `desperate` and
 * `personal` sit below them and `legend` above. Within a role, the bands'
 * salary ranges never overlap, so "better costs more" is structural rather
 * than tuned. Lives here rather than in `clevels.ts` because the roll odds and
 * `CLevelCandidate.tier` both need it.
 */
export const PERK_BANDS = ['desperate', 'personal', 'scrappy', 'mid', 'elite', 'legend'] as const;
export type PerkBand = (typeof PERK_BANDS)[number];

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
  /**
   * Where they came from, e.g. 'ex-Foogle' or 'the intern who got good'.
   * Signals the candidate's price band. On company tiers this is an employer;
   * on the cluster tiers (`desperate` / `personal`) it is the candidate's
   * relation to you, which is why the field is rendered verbatim rather than
   * prefixed with "ex-" at the call site.
   */
  exEmployer: string;
  /** The band this candidate was drawn from — drives price and perk strength together. */
  tier: PerkBand;
  salary: number;
  perk: CLevelPerk;
  quirk: CLevelQuirk | null;
}

/**
 * What one spin of the hire roll landed on. `source` is the banner text and
 * `tier` says how to read it — a company name on the company tiers, a cluster
 * label on `desperate` / `personal`, and the legend banner on `legend`, where
 * each candidate brings their own company instead.
 */
export interface CLevelOffer {
  tier: PerkBand;
  source: string;
  candidates: CLevelCandidate[];
}

/**
 * One C-level seat: filled, holding the result of your last spin, or empty.
 *
 * `offer` is null until the seat is spun for. It then persists until the seat
 * is spun again — deliberately, so running out of rolls never leaves the
 * player empty-handed: the last result stays hireable at zero budget.
 */
export interface CLevelSlot {
  hired: CLevelCandidate | null;
  offer: CLevelOffer | null;
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
  /**
   * The company's emoji logo, shown in the HQ header tile. Optional on purpose:
   * saves written before the feature existed have no value at all, and clearing
   * the logo is a supported choice — either way `undefined` means "fall back to
   * the company's initials". Never bump the save key for it.
   */
  companyLogo?: string;
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
  /**
   * Monotone count of extra hire-rolls this run has *earned* from events (the
   * golden Morning Standup streak). The roll budget itself lives in the store,
   * because it is keyed to a real calendar day and `src/game/` never sees a
   * clock — so the engine cannot credit it directly. It records the grant here
   * instead and the store credits the difference, which makes the handoff
   * idempotent under re-render: a double commit lands the same rolls once.
   *
   * It is *not* crash-safe across a reload. The store's baseline is in-memory,
   * so the first observation after a reload credits nothing — a grant taken in
   * the same beat the app dies is lost. Deliberate: the alternative is
   * persisting a second counter to make the pair atomic, which is the machinery
   * `PurchasedWeeksPool.grantedTransactionIds` exists for, and a streak reward
   * is not a purchase.
   */
  rollGrantsEarned: number;

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
  /** `focus` is the founder type chosen during onboarding; omitted, the run starts on `core`. `logo` is the emoji picked alongside the name. */
  | { type: 'NEW_GAME'; seed?: number; companyName: string; focus?: FocusId; logo?: string }
  /** Cosmetic only. `null` clears the logo, putting the header tile back on initials. */
  | { type: 'SET_COMPANY_LOGO'; logo: string | null }
  | { type: 'SET_PENDING_HIRES'; role: Role; delta: number }
  | { type: 'SET_MORALE_LEVER'; active: boolean }
  | { type: 'ROLL_CANDIDATES'; role: CLevelRole }
  | { type: 'HIRE_CLEVEL'; role: CLevelRole; candidateId: string }
  | { type: 'FIRE_CLEVEL'; role: CLevelRole }
  | { type: 'RAISE_ROUND' }
  | { type: 'ANSWER_EVENT'; choiceIndex: number }
  | { type: 'GO_PUBLIC' }
  | { type: 'SET_FOCUS'; focus: FocusId }
  /**
   * Bailout IAP (bankruptcy revive): restores cash to a healthy fixed amount,
   * clears the red-week fuse, and un-ends the run. `reason` is the purely
   * cosmetic windfall flavor chosen in the UI (e.g. "your uncle died…"); it
   * only feeds the news log and never affects the cash granted.
   */
  | { type: 'REVIVE'; reason: string };
