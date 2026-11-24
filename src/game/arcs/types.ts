/** Shapes for the repeating 10-week chapter system. Pure types only. */

import type { EventCard } from '../events/types';
import type { GameState } from '../types';
import type { ArcIndex } from './schedule';

export type ArcId = 'seed' | 'pmf' | 'scale' | 'boom' | 'reckoning' | 'crisis';

/**
 * The numbers an arc's goals are scaled from, frozen the moment the arc
 * starts — so "double your customers" means double what you had *then*, and
 * the goal never chases the player.
 */
export interface ArcBaseline {
  customers: number;
  roundsRaised: number;
  lastRoundRaisedWeek: number | null;
  /** Monthly income (weekly revenue × 4) at arc start. */
  monthlyIncome: number;
  /** Rank-and-file headcount at arc start. */
  headcount: number;
  /** Filled C-level seats at arc start. */
  cLevelsHired: number;
}

/**
 * The run's current chapter, as recorded by the store (`SYNC_ARC`). Unset on
 * every save from before chapters and on every run until its first chapter
 * after the guided ladder starts.
 */
export interface ArcRecord {
  index: ArcIndex;
  id: ArcId;
  /** The week the store started the arc — not always the nominal first week (a guided run can finish its ladder early, an old save loads mid-arc). */
  startedWeek: number;
  baseline: ArcBaseline;
  /** Mission ids met so far, in completion order. Sticky, like `questsDone`. */
  missionsDone: string[];
  /** Missions swapped for their substitute at arc start (e.g. no round reachable before the capstone). */
  substituted: string[];
}

export interface ArcContext {
  arcIndex: ArcIndex;
  /** Nominal first week of the arc: 1, 11, 21, … */
  startWeek: number;
  /** The week the capstone cliffhanger is pinned: 10, 20, 30, … */
  capstoneWeek: number;
  state: GameState;
  /** Frozen at arc start. Absent only for the capstone picker, which never needs it. */
  baseline: ArcBaseline;
  /** The week the store actually started the arc. */
  startedWeek: number;
}

export interface MissionTemplate {
  id: string;
  title: (ctx: ArcContext) => string;
  unit: 'count' | 'money' | 'weeks';
  goal: (ctx: ArcContext) => number;
  progress: (ctx: ArcContext) => number;
  /** Override for when progress ≥ goal is not the whole story (runway must be *above* 8, and only after the arc began). */
  met?: (ctx: ArcContext) => boolean;
  reward: string;
  /**
   * Decided once, from the frozen baseline: can this mission be done at all
   * this chapter? When it can't (no round left, raise cooldown runs past the
   * capstone), `substitute` takes its slot rather than soft-locking the ladder.
   */
  available?: (ctx: ArcContext) => boolean;
  substitute?: MissionTemplate;
}

export interface ArcTemplate {
  id: ArcId;
  title: (ctx: ArcContext) => string;
  goalLine: (ctx: ArcContext) => string;
  midOffsetWeeks: 5;
  missions: MissionTemplate[];
  /**
   * Existing deck cards this chapter's capstone would most like to land on —
   * considered alongside the era's pinnable deck under the "highest stake"
   * rule, so a Series A chapter can end on the board-seat fight even while
   * the run is still in the Scrappy era.
   */
  capstonePool?: readonly string[];
  /** A small mid-chapter decision that sets a flag the capstone can key off. */
  midpointCardId?: string;
}

export type { EventCard };
