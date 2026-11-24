/**
 * The chapter templates: what each 10-week arc asks of the player and where
 * its capstone looks for a card. Goals scale from the arc's frozen baseline,
 * never from live numbers, so they never chase the player.
 *
 * Map (adapts to the run — Boom starts weeks 25–35, Reckoning 55–70):
 * - arc 0 (weeks 1–10): `seed`, the guided ladder in `unlocks.ts`.
 * - arc 1 (11–20): `pmf`, find product-market fit.
 * - arc 2 (21–30): `scale`, Series A territory.
 * - arc 3+: keyed off the era — `scale` while still Scrappy, `boom` in the Boom,
 *   and alternating `reckoning` / `crisis` in the Reckoning.
 */

import { BRIDGE_RUNWAY_THRESHOLD_WEEKS, canRaiseRound, hasRoundsAvailable, nextRound, weeklyStatsFor } from '../balance';
import { ROUND_LABEL } from '../investors';
import type { GameState } from '../types';
import { C_LEVEL_ROLES, ROLES } from '../types';
import { PMF_MIDPOINT, SCALE_MIDPOINT } from './cards';
import type { ArcIndex } from './schedule';
import type { ArcBaseline, ArcContext, ArcId, ArcTemplate, MissionTemplate } from './types';

// ── Readings ────────────────────────────────────────────────────────────────

export const customersOf = (state: GameState) => Math.floor(state.customers);
export const monthlyIncomeOf = (state: GameState) => weeklyStatsFor(state).revenue * 4;
export const headcountOf = (state: GameState) => ROLES.reduce((sum, role) => sum + state.headcount[role], 0);
export const cLevelsHiredOf = (state: GameState) => C_LEVEL_ROLES.filter((role) => state.cLevels[role].hired).length;

export function baselineFor(state: GameState): ArcBaseline {
  return {
    customers: customersOf(state),
    roundsRaised: state.roundsRaised,
    lastRoundRaisedWeek: state.lastRoundRaisedWeek,
    monthlyIncome: monthlyIncomeOf(state),
    headcount: headcountOf(state),
    cLevelsHired: cLevelsHiredOf(state),
  };
}

function compactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `$${Math.round(n)}`;
}

/** A week must have finished inside the arc before an "end a week with…" mission can count. */
const weekFinishedInArc = (ctx: ArcContext) => ctx.state.week > ctx.startedWeek;

// ── Mission factories (ids are prefixed per arc so analytics can tell them apart) ──

/**
 * Customers: `max(2 × baseline, baseline + 20)` in the PMF chapter — double
 * what you had, but never a trivial +2 off a tiny base. Later chapters use a
 * gentler multiplier and floor.
 */
export function customersGoal(baseline: number, multiplier: number, floor: number): number {
  return Math.max(Math.ceil(baseline * multiplier), baseline + floor);
}

function customersMission(prefix: string, multiplier: number, floor: number): MissionTemplate {
  return {
    id: `${prefix}-customers`,
    title: (ctx) => `Reach ${customersGoal(ctx.baseline.customers, multiplier, floor)} customers`,
    unit: 'count',
    goal: (ctx) => customersGoal(ctx.baseline.customers, multiplier, floor),
    progress: (ctx) => customersOf(ctx.state),
    reward: 'Proof the market wants what you built',
  };
}

/** Monthly income goal: double the baseline, at least +$3K, rounded to $500. */
export function incomeGoal(baseline: number): number {
  return Math.ceil(Math.max(baseline * 2, baseline + 3_000) / 500) * 500;
}

function incomeMission(prefix: string): MissionTemplate {
  return {
    id: `${prefix}-income`,
    title: (ctx) => `Reach ${compactMoney(incomeGoal(ctx.baseline.monthlyIncome))} monthly income`,
    unit: 'money',
    goal: (ctx) => incomeGoal(ctx.baseline.monthlyIncome),
    progress: (ctx) => monthlyIncomeOf(ctx.state),
    reward: 'Revenue that makes the next round easier',
  };
}

function teamMission(prefix: string, extra: number): MissionTemplate {
  return {
    id: `${prefix}-team`,
    title: (ctx) => `Grow the team to ${ctx.baseline.headcount + extra}`,
    unit: 'count',
    goal: (ctx) => ctx.baseline.headcount + extra,
    // Queued hires count, like the guided ladder: the mission answers the tap.
    progress: (ctx) => ROLES.reduce((sum, role) => sum + ctx.state.pendingHeadcount[role], 0),
    reward: 'More hands for the next push',
  };
}

function cLevelMission(prefix: string): MissionTemplate {
  return {
    id: `${prefix}-clevel`,
    title: (ctx) => (ctx.baseline.cLevelsHired === 0 ? 'Hire your first C-level' : 'Fill another C-level seat'),
    unit: 'count',
    goal: (ctx) => Math.min(C_LEVEL_ROLES.length, ctx.baseline.cLevelsHired + 1),
    progress: cLevelProgress,
    reward: 'Leadership perks kick in the week they start',
    available: (ctx) => ctx.baseline.cLevelsHired < C_LEVEL_ROLES.length,
    substitute: teamMission(prefix, 3),
  };
}

function cLevelProgress(ctx: ArcContext): number {
  return cLevelsHiredOf(ctx.state);
}

/**
 * Raise the next open round. Decided once at arc start: when no round is left,
 * or the raise cooldown runs past the week before the capstone, the slot goes
 * to an income goal instead, so the ladder can never soft-lock on a door that
 * cannot open this chapter.
 */
export function raiseReachable(baseline: ArcBaseline, capstoneWeek: number): boolean {
  return hasRoundsAvailable(baseline.roundsRaised) && canRaiseRound(capstoneWeek - 1, baseline.lastRoundRaisedWeek);
}

function raiseMission(prefix: string): MissionTemplate {
  return {
    id: `${prefix}-raise`,
    title: (ctx) => {
      const round = nextRound(ctx.baseline.roundsRaised);
      return round ? `Raise your ${ROUND_LABEL[round]}` : 'Raise your next round';
    },
    unit: 'count',
    goal: (ctx) => ctx.baseline.roundsRaised + 1,
    progress: (ctx) => ctx.state.roundsRaised,
    reward: 'Cash for the next chapter — check the Money tab for term sheets',
    available: (ctx) => raiseReachable(ctx.baseline, ctx.capstoneWeek),
    substitute: incomeMission(prefix),
  };
}

function runwayMission(prefix: string): MissionTemplate {
  return {
    id: `${prefix}-runway`,
    title: () => `End a week with ${BRIDGE_RUNWAY_THRESHOLD_WEEKS}+ weeks of runway`,
    unit: 'weeks',
    goal: () => BRIDGE_RUNWAY_THRESHOLD_WEEKS,
    progress: (ctx) => {
      const { runway } = weeklyStatsFor(ctx.state);
      return Number.isFinite(runway) ? Math.max(0, Math.floor(runway)) : BRIDGE_RUNWAY_THRESHOLD_WEEKS;
    },
    met: (ctx) => {
      if (!weekFinishedInArc(ctx)) return false;
      const { runway } = weeklyStatsFor(ctx.state);
      return !Number.isFinite(runway) || runway > BRIDGE_RUNWAY_THRESHOLD_WEEKS;
    },
    reward: 'Above the bridge line: term sheets stay on good terms',
  };
}

const MORALE_GOAL = 60;

function moraleMission(prefix: string): MissionTemplate {
  return {
    id: `${prefix}-morale`,
    title: () => `End a week with morale at ${MORALE_GOAL}+`,
    unit: 'count',
    goal: () => MORALE_GOAL,
    progress: (ctx) => Math.floor(ctx.state.morale),
    met: (ctx) => weekFinishedInArc(ctx) && ctx.state.morale >= MORALE_GOAL,
    reward: 'A team that sticks around for the hard part',
  };
}

/** The hook: done the moment this chapter's capstone cliffhanger is pinned (or has already landed). */
export function capstoneMission(prefix: string): MissionTemplate {
  return {
    id: `${prefix}-capstone`,
    title: (ctx) => `Face the week ${ctx.capstoneWeek} decision`,
    unit: 'count',
    goal: () => 1,
    progress: (ctx) => ((ctx.state.lastCapstoneArc ?? -1) >= ctx.arcIndex ? 1 : 0),
    reward: 'Something big lands on your desk to close the chapter',
  };
}

// ── Templates ───────────────────────────────────────────────────────────────

export const ARC_TEMPLATES: Record<ArcId, ArcTemplate> = {
  seed: {
    id: 'seed',
    title: () => 'Get off the ground',
    goalLine: () => 'Hire, sell, and earn your first unlocks.',
    midOffsetWeeks: 5,
    // Arc 0's missions are the guided ladder (`QUESTS` in unlocks.ts).
    missions: [],
  },
  pmf: {
    id: 'pmf',
    title: () => 'Find product-market fit',
    goalLine: (ctx) => `Prove people need this before the week ${ctx.capstoneWeek} decision.`,
    midOffsetWeeks: 5,
    missions: [
      cLevelMission('pmf'),
      raiseMission('pmf'),
      customersMission('pmf', 2, 20),
      runwayMission('pmf'),
      capstoneMission('pmf'),
    ],
    midpointCardId: PMF_MIDPOINT.id,
  },
  scale: {
    id: 'scale',
    title: () => 'Scale what works',
    goalLine: () => 'Grow into the company the next round is betting on.',
    midOffsetWeeks: 5,
    missions: [
      raiseMission('scale'),
      customersMission('scale', 1.5, 40),
      teamMission('scale', 5),
      capstoneMission('scale'),
    ],
    capstonePool: ['boom-board-seat-request', 'boom-conference-keynote', 'boom-talent-poaching-war', 'boom-chase-the-round'],
    midpointCardId: SCALE_MIDPOINT.id,
  },
  boom: {
    id: 'boom',
    title: () => 'Ride the boom',
    goalLine: () => "Money is cheap. Turn it into revenue before it isn't.",
    midOffsetWeeks: 5,
    missions: [incomeMission('boom'), cLevelMission('boom'), capstoneMission('boom')],
  },
  reckoning: {
    id: 'reckoning',
    title: () => 'Survive the reckoning',
    goalLine: () => 'The money dried up. Keep the lights on.',
    midOffsetWeeks: 5,
    missions: [runwayMission('reckoning'), moraleMission('reckoning'), capstoneMission('reckoning')],
  },
  crisis: {
    id: 'crisis',
    title: () => 'Weather the storm',
    goalLine: (ctx) => `One more test before the week ${ctx.capstoneWeek} call.`,
    midOffsetWeeks: 5,
    missions: [runwayMission('crisis'), customersMission('crisis', 1.1, 5), capstoneMission('crisis')],
  },
};

/** Which template a chapter uses. Frozen into the arc record at start, so an era turning mid-chapter doesn't swap the goals. */
export function templateIdFor(arcIndex: ArcIndex, state: Pick<GameState, 'era'>): ArcId {
  if (arcIndex <= 0) return 'seed';
  if (arcIndex === 1) return 'pmf';
  if (arcIndex === 2) return 'scale';
  if (state.era === 'boom') return 'boom';
  if (state.era === 'reckoning') return arcIndex % 2 === 0 ? 'reckoning' : 'crisis';
  return 'scale';
}
