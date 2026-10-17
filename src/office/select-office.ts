/**
 * Which office a company works in, and how many people are drawn in it.
 * Pure: unit-tested under node.
 */

import type { OfficeTier } from './engine/types';

export const TIERS: readonly OfficeTier[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const TOP_TIER: OfficeTier = 8;

/** Most people ever drawn in a scene, whatever the office, to keep frame time flat. */
export const GLOBAL_MAX_PEOPLE = 40;

/**
 * Minimum valuation to afford each tier, index 0 = tier 1. Tuned to this
 * game's economy: the IPO bar is ~$150K weekly revenue, i.e. a valuation
 * around $1.2M+ — so the top offices are for companies at or past that.
 */
export const WEALTH_THRESHOLDS: readonly number[] = [0, 40_000, 120_000, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000];

/** Wealth must clear a threshold by this fraction before an upgrade is instant. */
export const HYSTERESIS_MARGIN = 0.05;
/** Otherwise a newly computed tier must hold for this many data refreshes (weeks). */
export const STABLE_REFRESHES = 2;

export interface CapacityInfo {
  tier: OfficeTier;
  capacity: { comfortable: number; max: number };
}

/** The best tier the company can afford. */
export function wealthTier(wealth: number): OfficeTier {
  let tier: OfficeTier = 1;
  for (let i = 0; i < WEALTH_THRESHOLDS.length; i++) if (wealth >= WEALTH_THRESHOLDS[i]) tier = TIERS[i];
  return tier;
}

/** The smallest tier whose office comfortably fits that many people. */
export function headcountTier(employees: number, maps: readonly CapacityInfo[]): OfficeTier {
  const sorted = [...maps].sort((a, b) => a.tier - b.tier);
  for (const m of sorted) if (m.capacity.comfortable >= employees) return m.tier;
  return sorted.length ? sorted[sorted.length - 1].tier : TOP_TIER;
}

/** You only move to a bigger office if you need it AND can afford it. */
export function pickOfficeTier(employees: number, wealth: number, maps: readonly CapacityInfo[]): OfficeTier {
  return Math.min(wealthTier(wealth), headcountTier(employees, maps)) as OfficeTier;
}

export interface PeopleShown {
  visible: number;
  /** People not drawn; > 0 shows a "+N" badge. */
  overflow: number;
  crowded: boolean;
}

export function peopleShown(employees: number, capacity: CapacityInfo['capacity']): PeopleShown {
  const n = Math.max(0, Math.floor(employees));
  const visible = Math.min(n, capacity.max, GLOBAL_MAX_PEOPLE);
  return { visible, overflow: n - visible, crowded: n > capacity.comfortable };
}

/** Hysteresis state for the shown tier; lives in component state, never in the save. */
export interface TierHold {
  shown: OfficeTier;
  /** A tier that differs from `shown`, and how many refreshes in a row it has been computed. */
  pending: OfficeTier | null;
  pendingCount: number;
}

export function initialTierHold(tier: OfficeTier): TierHold {
  return { shown: tier, pending: null, pendingCount: 0 };
}

/**
 * Feed one data refresh. The shown tier only changes once the computed tier
 * has been stable for `STABLE_REFRESHES` refreshes, or immediately when the
 * move is decisive: wealth more than 5% past the boundary that was crossed,
 * and headcount not what's holding the tier (the headcount term is an
 * integer, so it can't flicker the way wealth can).
 */
export function advanceTierHold(
  hold: TierHold,
  employees: number,
  wealth: number,
  maps: readonly CapacityInfo[],
): TierHold {
  const computed = pickOfficeTier(employees, wealth, maps);
  if (computed === hold.shown) return { shown: hold.shown, pending: null, pendingCount: 0 };

  if (isDecisive(hold.shown, computed, employees, wealth, maps)) return initialTierHold(computed);

  const pendingCount = hold.pending === computed ? hold.pendingCount + 1 : 1;
  if (pendingCount >= STABLE_REFRESHES) return initialTierHold(computed);
  return { shown: hold.shown, pending: computed, pendingCount };
}

function isDecisive(
  shown: OfficeTier,
  computed: OfficeTier,
  employees: number,
  wealth: number,
  maps: readonly CapacityInfo[],
): boolean {
  const byHeadcount = headcountTier(employees, maps);
  // Headcount-limited moves are driven by an integer the player set on purpose
  // — but only when wealth clears that tier with margin to spare, so wealth
  // wobbling at the same boundary doesn't sneak through this branch.
  if (computed === byHeadcount && wealthTier(wealth * (1 - HYSTERESIS_MARGIN)) >= byHeadcount) return true;
  if (computed > shown) {
    // Upgrade on wealth: past the boundary of the computed tier by a margin.
    return wealth >= WEALTH_THRESHOLDS[computed - 1] * (1 + HYSTERESIS_MARGIN);
  }
  // Downgrade on wealth: below the boundary of the tier we're leaving by a margin.
  return wealth < WEALTH_THRESHOLDS[shown - 1] * (1 - HYSTERESIS_MARGIN);
}
