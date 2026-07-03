/**
 * Core game types. This module is pure data — no React, React Native, or Expo
 * imports may ever appear anywhere under `src/game/`.
 */

import { EventCard, NewsEntry, TimedEffect } from './events/types';

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

/** A perk multiplier applied inside the relevant balance formula for its role. */
export interface CLevelPerk {
  id: string;
  label: string;
  multiplier: number;
}

export interface CLevelCandidate {
  id: string;
  name: string;
  personality: string;
  salary: number;
  perk: CLevelPerk;
}

/** One C-level seat: either filled, or open with a standing offer. */
export interface CLevelSlot {
  hired: CLevelCandidate | null;
  /** The current offer for this seat; persists until hired or the seat is refreshed by a firing. */
  candidates: CLevelCandidate[];
}

export type CLevels = Record<CLevelRole, CLevelSlot>;

/** A named competitor. Grows by script (Task 7), later era events (Task 8) may push it around. */
export interface Rival {
  name: string;
  productQuality: number;
  marketShare: number;
}

/** The three funding rounds a run can raise, in order. */
export const ROUND_ORDER = ['seed', 'seriesA', 'seriesB'] as const;
export type RoundType = (typeof ROUND_ORDER)[number];

/** Company stage; raising a round advances it (seriesB raises straight to growth). */
export const STAGE_ORDER = ['garage', 'seed', 'seriesA', 'growth'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

/** The entire serializable game model. */
export interface GameState {
  /** Save schema version, for future migrations. */
  version: number;
  /** The seed the run was created with (for display / reproduction). */
  createdWithSeed: number;
  rng: RngState;

  // Clock
  week: number;

  // Money
  cash: number;

  // Team
  headcount: Headcount;
  /** Queued headcount changes from the Team tab steppers; applied as a batch on tick. */
  pendingHeadcount: Headcount;
  morale: number; // 0–100

  // Product & market
  /** Accumulates from dev effort each tick, decays from tech-debt drag. */
  productQuality: number;
  /** Neutral 1.0 for now; timeline events (Task 6+) push this around. */
  hype: number;
  /** Your share of the market, 0–1. Shifts each tick based on the quality gap with each rival. */
  marketShare: number;
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

  // Timeline events
  /** Set when a decision card is drawn; TICK is a no-op until it's answered. */
  pendingEvent: EventCard | null;
  /** Timed effects currently counting down (from resolved cards). */
  activeTimedEffects: TimedEffect[];
  /** Resolved events, newest first. */
  newsLog: NewsEntry[];
  /** Ids already drawn this run, so a deck never repeats a card. */
  drawnEventIds: string[];
  /** Ticks remaining until the next card is drawn (2–4, reset on every draw). */
  weeksUntilNextEvent: number;

  /** null while the run is live; set once the game ends. */
  gameOver: GameOverReason | null;
}

export type GameAction =
  | { type: 'TICK' }
  | { type: 'NEW_GAME'; seed?: number }
  | { type: 'SET_PENDING_HIRES'; role: Role; delta: number }
  | { type: 'HIRE_CLEVEL'; role: CLevelRole; candidateId: string }
  | { type: 'FIRE_CLEVEL'; role: CLevelRole }
  | { type: 'RAISE_ROUND' }
  | { type: 'ANSWER_EVENT'; choiceIndex: number };
