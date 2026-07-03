/**
 * Every tunable constant and formula lives here. Balance is data + pure
 * functions so the whole economy can be reasoned about and retuned in one file.
 */

import { EventStat, TimedEffect } from './events/types';
import { C_LEVEL_ROLES, CLevelRole, CLevels, Headcount, ROUND_ORDER, Role, RoundType, Stage } from './types';

/** The state slice `weeklyStatsFor` needs — matches a subset of `GameState`. */
export interface WeeklyStatsInput {
  headcount: Headcount;
  cLevels: CLevels;
  hype: number;
  productQuality: number;
  marketShare: number;
  cash: number;
}

/** Bump when the shape of a saved GameState changes incompatibly. */
export const SAVE_VERSION = 2;

// ── Insolvency ───────────────────────────────────────────────────────────
/** Consecutive weeks with cash < 0 before the run ends in bankruptcy, regardless of rounds left. */
export const BANKRUPTCY_FUSE_WEEKS = 3;

// ── Starting conditions ────────────────────────────────────────────────
export const STARTING_CASH = 250_000;
export const STARTING_HEADCOUNT: Headcount = { devs: 3, sales: 1, support: 1 };
export const STARTING_MORALE = 70;
export const STARTING_PRODUCT_QUALITY = 0;
export const STARTING_HYPE = 1.0;
export const STARTING_MARKET_SHARE = 0.15;
export const STARTING_FOUNDER_EQUITY = 1.0;
export const STARTING_STAGE: Stage = 'garage';

// ── Payroll & burn ─────────────────────────────────────────────────────
/** Weekly salary per head, by role. */
export const WEEKLY_SALARY: Record<Role, number> = {
  devs: 2_500,
  sales: 2_000,
  support: 1_500,
};

/** Fixed weekly overhead (office, servers, tooling) independent of headcount. */
export const FIXED_WEEKLY_BURN = 5_000;

/** Total weekly salary cost for the given headcount. */
export function payrollFor(headcount: Headcount): number {
  return (Object.keys(WEEKLY_SALARY) as Role[]).reduce(
    (sum, role) => sum + headcount[role] * WEEKLY_SALARY[role],
    0,
  );
}

/**
 * Total weekly cash outflow: payroll + fixed overhead (optionally discounted
 * by a CFO's perk) + any hired C-level salaries.
 */
export function weeklyBurnFor(
  headcount: Headcount,
  options: { execPayroll?: number; fixedBurnMultiplier?: number } = {},
): number {
  const { execPayroll = 0, fixedBurnMultiplier = 1 } = options;
  return payrollFor(headcount) + FIXED_WEEKLY_BURN * fixedBurnMultiplier + execPayroll;
}

/**
 * Runway in weeks given cash and net weekly burn (burn minus any revenue).
 * Returns Infinity when nothing is being burned.
 */
export function runwayWeeks(cash: number, netWeeklyBurn: number): number {
  if (netWeeklyBurn <= 0) return Infinity;
  return cash / netWeeklyBurn;
}

// ── Product quality ─────────────────────────────────────────────────────
/** Raw weekly output per developer, before the growth/decay curve is applied. */
export const DEV_EFFORT_PER_DEV = 300;
/** Sublinear exponent on headcount: extra devs still help, but with diminishing returns. */
export const DEV_EFFORT_EXPONENT = 0.85;
/** Fraction of a week's dev effort that converts into quality growth. */
export const QUALITY_GROWTH_RATE = 0.4;
/** Fraction of current quality lost each week to tech-debt drag. */
export const QUALITY_DECAY_RATE = 0.08;

/** Raw weekly development output for a given number of devs (diminishing returns per extra hire). */
export function devEffort(devs: number): number {
  return Math.pow(devs, DEV_EFFORT_EXPONENT) * DEV_EFFORT_PER_DEV;
}

/**
 * One week of quality evolution: dev effort (scaled by morale and an optional
 * CTO perk) grows it, tech-debt drag decays it proportionally to its current
 * value (so quality asymptotes rather than growing unbounded, and bleeds
 * toward zero with no devs at all).
 */
export function qualityAfterTick(
  quality: number,
  devs: number,
  morale: number,
  devBoost: number = 1,
): number {
  const growth = devEffort(devs) * QUALITY_GROWTH_RATE * moraleFactor(morale) * devBoost;
  const decay = quality * QUALITY_DECAY_RATE;
  return Math.max(0, quality + growth - decay);
}

// ── Revenue & valuation ─────────────────────────────────────────────────
/** Revenue multiplier added per sales hire. */
export const SALES_FACTOR_PER_HEAD = 0.2;
/** Dollars of weekly revenue per point of quality×share, before hype/sales scaling. */
export const REVENUE_PER_QUALITY_SHARE = 3;
/** Valuation multiple applied to revenue (industry comps, pre-tuning). */
export const INDUSTRY_MULTIPLE = 8;
/** How many weeks of valuation history the HQ sparkline keeps. */
export const VALUATION_HISTORY_CAP = 104;

/** Revenue multiplier from the sales team (baseline 1.0 with zero sales). */
export function salesFactorFor(sales: number): number {
  return 1 + sales * SALES_FACTOR_PER_HEAD;
}

/** Weekly revenue: product quality monetized by market share, hype, and sales. */
export function revenueFor(
  quality: number,
  marketShare: number,
  hype: number,
  salesFactor: number,
): number {
  return quality * marketShare * hype * salesFactor * REVENUE_PER_QUALITY_SHARE;
}

/** Company valuation: revenue capitalized at an industry multiple, boosted by hype. */
export function valuationFor(revenue: number, hype: number): number {
  return revenue * INDUSTRY_MULTIPLE * hype;
}

export interface WeeklyStats {
  burn: number;
  revenue: number;
  valuation: number;
  runway: number;
}

/**
 * Rolls up the week's headline numbers (burn, revenue, valuation, runway)
 * from a state slice. Shared by the UI (current week) and the engine's
 * weekly-digest comparison (pre-tick "before" snapshot vs the just-computed
 * "after" one) so both read the same formula composition.
 */
export function weeklyStatsFor(state: WeeklyStatsInput): WeeklyStats {
  const burn = weeklyBurnFor(state.headcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplier(state.cLevels, 'cfo'),
  });
  const effectiveHype = state.hype * cLevelPerkMultiplier(state.cLevels, 'cmo');
  const revenue = revenueFor(
    state.productQuality,
    state.marketShare,
    effectiveHype,
    salesFactorFor(state.headcount.sales),
  );
  const valuation = valuationFor(revenue, effectiveHype);
  const runway = runwayWeeks(state.cash, burn - revenue);
  return { burn, revenue, valuation, runway };
}

// ── Team management: hiring & morale ────────────────────────────────────
/** Morale drifts toward this baseline every week absent other pressure. */
export const MORALE_BASELINE = 70;
/** Fraction of the gap to baseline closed each week. */
export const MORALE_DRIFT_RATE = 0.08;
/** Morale points lost per 100% of total staff cut in a single week's batch. */
export const MORALE_HIT_PER_LAYOFF_FRACTION = 120;
/** devEffort multiplier at 0 morale. */
export const MIN_MORALE_FACTOR = 0.5;
/** devEffort multiplier at 100 morale. */
export const MAX_MORALE_FACTOR = 1.5;
/** Firing this fraction or more of a role's current headcount in one batch warrants a confirm dialog. */
export const LAYOFF_CONFIRM_THRESHOLD = 0.2;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function totalHeadcount(headcount: Headcount): number {
  return headcount.devs + headcount.sales + headcount.support;
}

/** devEffort multiplier driven by morale: demoralized teams ship slower, thriving ones ship faster. */
export function moraleFactor(morale: number): number {
  return MIN_MORALE_FACTOR + (morale / 100) * (MAX_MORALE_FACTOR - MIN_MORALE_FACTOR);
}

/**
 * One week of morale evolution: drifts toward baseline, then takes a hit
 * scaled by the fraction of total staff cut this week (hiring alone never
 * hurts morale; only net headcount reductions do).
 */
export function moraleAfterTick(
  morale: number,
  headcountBefore: Headcount,
  headcountAfter: Headcount,
): number {
  const totalBefore = totalHeadcount(headcountBefore);
  const totalAfter = totalHeadcount(headcountAfter);
  const cutFraction = totalBefore > 0 ? Math.max(0, (totalBefore - totalAfter) / totalBefore) : 0;
  const layoffHit = cutFraction * MORALE_HIT_PER_LAYOFF_FRACTION;
  const drifted = morale + (MORALE_BASELINE - morale) * MORALE_DRIFT_RATE;
  return clamp(drifted - layoffHit, 0, 100);
}

/**
 * Sanity ceiling for a stepper: you can't queue more heads for a role than
 * your current cash could cover a single week of payroll for.
 */
export function maxHireableHeadcount(role: Role, cash: number): number {
  return Math.max(0, Math.floor(cash / WEEKLY_SALARY[role]));
}

// ── C-levels ─────────────────────────────────────────────────────────────
/** Morale points lost when a C-level seat is fired/replaced. */
export const C_LEVEL_DEPARTURE_MORALE_HIT = 10;

/** Sum of salaries for every currently hired C-level. */
export function cLevelPayroll(cLevels: CLevels): number {
  return C_LEVEL_ROLES.reduce((sum, role) => sum + (cLevels[role].hired?.salary ?? 0), 0);
}

/** The active perk multiplier for a seat, or 1 (no-op) if it's empty. */
export function cLevelPerkMultiplier(cLevels: CLevels, role: CLevelRole): number {
  return cLevels[role].hired?.perk.multiplier ?? 1;
}

// ── Funding ──────────────────────────────────────────────────────────────
/** Fraction of the company sold in each round, before any bridge penalty. */
export const ROUND_BASE_DILUTION: Record<RoundType, number> = {
  seed: 0.15,
  seriesA: 0.2,
  seriesB: 0.2,
};

/**
 * Floor on raise size, independent of valuation — even a near-zero-revenue
 * startup can typically raise a "normal" round on team/story alone. Terms
 * still scale up from here as valuation and hype grow.
 */
export const ROUND_MIN_AMOUNT: Record<RoundType, number> = {
  seed: 150_000,
  seriesA: 400_000,
  seriesB: 800_000,
};

/** Stage the company reaches after closing each round (seriesB jumps straight to growth). */
export const STAGE_AFTER_ROUND: Record<RoundType, Stage> = {
  seed: 'seed',
  seriesA: 'seriesA',
  seriesB: 'growth',
};

/** Runway below this many weeks forces bridge terms on the next round. */
export const BRIDGE_RUNWAY_THRESHOLD_WEEKS = 8;
/** Bridge rounds are more dilutive... */
export const BRIDGE_DILUTION_MULTIPLIER = 1.5;
/** ...and hand over less cash, since they're a rescue, not a vote of confidence. */
export const BRIDGE_CASH_MULTIPLIER = 0.6;
/** No single round can sell more than this much of the company. */
export const MAX_DILUTION_PER_ROUND = 0.9;

export interface RoundTerms {
  round: RoundType;
  amount: number;
  dilution: number;
  isBridge: boolean;
}

/**
 * Computed (not negotiated) terms for the next round: size scales with
 * valuation and hype off a per-round floor; runway under the bridge
 * threshold triggers worse terms (more dilution, less cash).
 */
export function roundTermsFor(
  round: RoundType,
  valuation: number,
  hype: number,
  runwayLeftWeeks: number,
): RoundTerms {
  const isBridge = runwayLeftWeeks < BRIDGE_RUNWAY_THRESHOLD_WEEKS;
  const baseDilution = ROUND_BASE_DILUTION[round];
  const dilution = Math.min(
    MAX_DILUTION_PER_ROUND,
    isBridge ? baseDilution * BRIDGE_DILUTION_MULTIPLIER : baseDilution,
  );
  const scaledAmount = Math.max(valuation, 0) * hype * baseDilution;
  const baseAmount = Math.max(scaledAmount, ROUND_MIN_AMOUNT[round]);
  const amount = isBridge ? baseAmount * BRIDGE_CASH_MULTIPLIER : baseAmount;
  return { round, amount, dilution, isBridge };
}

/** Founder equity after selling `dilution` of the company: multiplies down, never below 0. */
export function applyDilution(equity: number, dilution: number): number {
  return clamp(equity * (1 - dilution), 0, 1);
}

/** The next raisable round, or null once seed/A/B are all done. */
export function nextRound(roundsRaised: number): RoundType | null {
  return ROUND_ORDER[roundsRaised] ?? null;
}

export function hasRoundsAvailable(roundsRaised: number): boolean {
  return roundsRaised < ROUND_ORDER.length;
}

// ── Timeline events ──────────────────────────────────────────────────────
/** Combined multiplier from every active timed effect targeting `stat` (1 if none). */
export function timedMultiplierFor(stat: EventStat, effects: TimedEffect[]): number {
  return effects.filter((e) => e.stat === stat).reduce((product, e) => product * e.multiplier, 1);
}

// ── Hype ─────────────────────────────────────────────────────────────────
/** Fraction of the gap to neutral (1.0) that hype closes each week, absent new events. */
export const HYPE_DECAY_RATE = 0.05;

/** One week of hype decay: drifts back toward the neutral baseline of 1.0. */
export function hypeAfterTick(hype: number): number {
  return hype + (1.0 - hype) * HYPE_DECAY_RATE;
}

// ── Market share ─────────────────────────────────────────────────────────
/** Share moved per point of quality gap, per week. */
export const SHARE_SHIFT_RATE = 0.0001;
/** No single rival can shift more than this much share in one week. */
export const MAX_SHARE_SHIFT_PER_TICK = 0.01;
/** Fraction of a share *loss* to a rival negated per support hire. */
export const SUPPORT_SHARE_PROTECTION_PER_HEAD = 0.15;

/**
 * Share that moves from the lower-quality side to the higher-quality side
 * against one rival this week. Positive means you gain share from them.
 */
export function shareShiftFor(yourQuality: number, rivalQuality: number): number {
  const gap = yourQuality - rivalQuality;
  return clamp(gap * SHARE_SHIFT_RATE, -MAX_SHARE_SHIFT_PER_TICK, MAX_SHARE_SHIFT_PER_TICK);
}

/** How much of a share loss support staff negate (1 = none negated, 0 = fully negated). */
export function supportProtectionFactor(support: number): number {
  return clamp(1 - support * SUPPORT_SHARE_PROTECTION_PER_HEAD, 0, 1);
}
