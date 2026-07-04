/**
 * Every tunable constant and formula lives here. Balance is data + pure
 * functions so the whole economy can be reasoned about and retuned in one file.
 */

import { Era, EventStat, TimedEffect } from './events/types';
import {
  C_LEVEL_ROLES,
  CLevelPerkAxis,
  CLevelRole,
  CLevels,
  FocusId,
  Headcount,
  Rival,
  ROUND_ORDER,
  Role,
  RoundType,
  Stage,
  Trend,
} from './types';

/** The state slice `weeklyStatsFor` needs — matches a subset of `GameState`. */
export interface WeeklyStatsInput {
  headcount: Headcount;
  cLevels: CLevels;
  hype: number;
  customers: number;
  cash: number;
  era: Era;
  moraleLeverActive: boolean;
  focus: FocusId;
}

// ── Insolvency ───────────────────────────────────────────────────────────
/** Consecutive weeks with cash < 0 before the run ends in bankruptcy, regardless of rounds left. */
export const BANKRUPTCY_FUSE_WEEKS = 3;

// ── Starting conditions ────────────────────────────────────────────────
export const STARTING_CASH = 250_000;
export const STARTING_HEADCOUNT: Headcount = { devs: 3, sales: 1, support: 1 };
export const STARTING_MORALE = 70;
export const STARTING_PRODUCT_QUALITY = 0;
export const STARTING_HYPE = 1.0;
export const STARTING_CUSTOMERS = 0;
export const STARTING_MARKET_CUSTOMERS = 10_000;
/** Derived, not independently tuned: marketShare is `customers / marketCustomers` from Task 1 on. */
export const STARTING_MARKET_SHARE = STARTING_CUSTOMERS / STARTING_MARKET_CUSTOMERS;
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
 * by a CFO's perk, or inflated by the hardware focus) + any hired C-level
 * salaries + a per-customer variable cost (hardware's COGS).
 */
export function weeklyBurnFor(
  headcount: Headcount,
  options: {
    execPayroll?: number;
    fixedBurnMultiplier?: number;
    moraleLeverCost?: number;
    variableCost?: number;
  } = {},
): number {
  const { execPayroll = 0, fixedBurnMultiplier = 1, moraleLeverCost = 0, variableCost = 0 } = options;
  return (
    payrollFor(headcount) + FIXED_WEEKLY_BURN * fixedBurnMultiplier + execPayroll + moraleLeverCost + variableCost
  );
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
 * toward zero with no devs at all). `decayMultiplier` lets a CTO's
 * tech-debt-reduction perk (or a shortcut perk's tradeoff cost) move the drag
 * rate independently of the growth-side `devBoost`.
 */
export function qualityAfterTick(
  quality: number,
  devs: number,
  morale: number,
  devBoost: number = 1,
  decayMultiplier: number = 1,
): number {
  const growth = devEffort(devs) * QUALITY_GROWTH_RATE * moraleFactor(morale) * devBoost;
  const decay = quality * QUALITY_DECAY_RATE * decayMultiplier;
  return Math.max(0, quality + growth - decay);
}

// ── Customer pipeline ────────────────────────────────────────────────────
/** Dollars of weekly revenue per customer, before any focus ARPC multiplier (Task 2). */
export const ARPC = 25;
/** Raw leads a single sales head generates per week, before the headcount exponent and demand multipliers. */
export const LEADS_PER_SALES = 12;
/** Sublinear exponent on sales headcount: extra reps still help, but with diminishing returns. */
export const SALES_EXPONENT = 0.9;
/** Fraction of leads that convert to paying customers at quality parity with the rival average. */
export const BASE_CONVERSION = 0.5;
/** Ceiling on the computed conversion rate, independent of the quality curve below. */
export const MAX_CONVERSION_RATE = 0.95;
/** Weekly churn rate at quality parity with full support coverage. */
export const BASE_CHURN = 0.02;
/** How many customers one support head fully covers before the rest start churning harder. */
export const CUSTOMERS_PER_SUPPORT = 200;
/** Churn multiplier applied to the uncovered fraction of the customer base. */
export const UNCOVERED_CHURN_MULTIPLIER = 5.5;
/** Floor/ceiling the soft quality-ratio curve clamps the conversion multiplier to. */
export const QUALITY_CONVERSION_FLOOR = 0.4;
export const QUALITY_CONVERSION_CEILING = 1.9;
/** Floor/ceiling for the churn side of the same curve (mirrored: falling behind raises churn). */
export const QUALITY_CHURN_FLOOR = 0.6;
export const QUALITY_CHURN_CEILING = 2.5;
/** Fraction of churned customers who defect straight to a rival; the rest just return to the pool. */
export const CHURN_DEFECTION_RATE = 0.6;
/** Weekly growth rate of the total addressable customer pool, by era. */
export const MARKET_GROWTH_RATE: Record<Era, number> = {
  scrappy: 0.01,
  boom: 0.02,
  reckoning: 0,
};

/** Valuation multiple applied to revenue (industry comps, pre-tuning). */
export const INDUSTRY_MULTIPLE = 8;
/** How many weeks of valuation history the HQ sparkline keeps. */
export const VALUATION_HISTORY_CAP = 104;

/** One week of market-pool growth, era-scaled and compounding. */
export function marketCustomersAfterTick(marketCustomers: number, era: Era = 'scrappy'): number {
  return marketCustomers * (1 + MARKET_GROWTH_RATE[era]);
}

/**
 * Weekly leads generated by the sales team: lots of sales means lots of
 * leads, and a real revenue spike right now — the old flat `salesFactorFor`
 * revenue multiplier is gone; sales now drives demand, not a direct
 * multiplier on quality. Hype (and, later, trend/focus demand multipliers)
 * scales the same lead count.
 */
export function leadsFor(sales: number, demandMultiplier: number = 1): number {
  return LEADS_PER_SALES * Math.pow(sales, SALES_EXPONENT) * demandMultiplier;
}

/**
 * Soft, bounded multiplier from your quality relative to the rival average —
 * a sqrt curve so a big gap matters a lot without either side hitting zero
 * or running away unbounded. Feeds conversion; `qualityChurnFactor` is its
 * churn-side mirror image.
 */
export function qualityRatioFactor(yourQuality: number, rivalAvgQuality: number): number {
  const ratio = Math.max(yourQuality, 1) / Math.max(rivalAvgQuality, 1);
  return clamp(Math.sqrt(ratio), QUALITY_CONVERSION_FLOOR, QUALITY_CONVERSION_CEILING);
}

/** Mirror of `qualityRatioFactor` for churn: falling behind the rival average raises churn. */
export function qualityChurnFactor(yourQuality: number, rivalAvgQuality: number): number {
  const ratio = Math.max(rivalAvgQuality, 1) / Math.max(yourQuality, 1);
  return clamp(Math.sqrt(ratio), QUALITY_CHURN_FLOOR, QUALITY_CHURN_CEILING);
}

/**
 * Fraction of leads that convert to paying customers this week: quality
 * below the rival average tanks it, quality above lifts it (soft-capped),
 * with an optional focus multiplier (Task 2).
 */
export function conversionRateFor(
  yourQuality: number,
  rivalAvgQuality: number,
  focusMultiplier: number = 1,
): number {
  return clamp(
    BASE_CONVERSION * qualityRatioFactor(yourQuality, rivalAvgQuality) * focusMultiplier,
    0,
    MAX_CONVERSION_RATE,
  );
}

/** New customers this week: leads × conversion, capped by whatever's left in the addressable pool. */
export function customersGainedFor(leads: number, conversionRate: number, availableDemand: number): number {
  return clamp(leads * conversionRate, 0, Math.max(0, availableDemand));
}

/**
 * Each support head fully covers `CUSTOMERS_PER_SUPPORT` customers; the
 * uncovered fraction churns at `UNCOVERED_CHURN_MULTIPLIER` instead of the
 * baseline rate. Replaces the old flat `supportProtectionFactor`.
 */
export function supportCoverageFactor(support: number, customers: number): number {
  if (customers <= 0) return 1;
  const coveredFraction = clamp((support * CUSTOMERS_PER_SUPPORT) / customers, 0, 1);
  return coveredFraction + (1 - coveredFraction) * UNCOVERED_CHURN_MULTIPLIER;
}

/**
 * Weekly churn rate: baseline, worsened by a quality gap below the rival
 * average, worsened further by thin support coverage, with an optional
 * focus multiplier (Task 2).
 */
export function churnRateFor(
  yourQuality: number,
  rivalAvgQuality: number,
  support: number,
  customers: number,
  focusMultiplier: number = 1,
): number {
  return (
    BASE_CHURN *
    qualityChurnFactor(yourQuality, rivalAvgQuality) *
    supportCoverageFactor(support, customers) *
    focusMultiplier
  );
}

/** Customers lost to churn this week, before the defection split. */
export function customersChurnedFor(customers: number, churnRate: number): number {
  return customers * churnRate;
}

export interface ChurnSplit {
  /** Defect straight to a rival — their share rises. */
  toRivals: number;
  /** Just lapse back into the addressable pool, up for grabs again. */
  toPool: number;
}

/** A share-weighted majority of churned customers defect to rivals; the rest return to the pool. */
export function churnDefectionSplit(churned: number): ChurnSplit {
  const toRivals = churned * CHURN_DEFECTION_RATE;
  return { toRivals, toPool: churned - toRivals };
}

/** Weekly revenue: your installed customer base times what each pays, before any focus ARPC multiplier (Task 2). */
export function revenueFor(customers: number, focusArpcMultiplier: number = 1): number {
  return customers * ARPC * focusArpcMultiplier;
}

/** Company valuation: revenue capitalized at an industry multiple (compressed in Reckoning), boosted by hype. */
export function valuationFor(revenue: number, hype: number, era: Era = 'scrappy'): number {
  return revenue * INDUSTRY_MULTIPLE * ERA_VALUATION_MULTIPLE_MULTIPLIER[era] * hype;
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
    fixedBurnMultiplier:
      cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut') * focusFixedBurnMultiplier(state.focus),
    moraleLeverCost: state.moraleLeverActive ? MORALE_LEVER_WEEKLY_COST : 0,
    variableCost: focusCogsFor(state.focus, state.customers),
  });
  const effectiveHype = state.hype * cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain');
  const revenue = revenueFor(state.customers, FOCUS_PROFILES[state.focus].arpcMultiplier);
  const valuation = valuationFor(revenue, effectiveHype, state.era);
  const runway = runwayWeeks(state.cash, burn - revenue);
  return { burn, revenue, valuation, runway };
}

// ── Company Focus ────────────────────────────────────────────────────────
/** How many weeks the transition drag (`FOCUS_TRANSITION_MULTIPLIER`) applies after switching focus. */
export const FOCUS_TRANSITION_WEEKS = 4;
/** Multiplier on dev effort and conversion while a focus switch is still settling in. */
export const FOCUS_TRANSITION_MULTIPLIER = 0.7;
/** Flat weekly hype addition while running the hype focus (on top of its `hypeGainMultiplier`). */
export const HYPE_FOCUS_PUMP_PER_WEEK = 0.05;
/** Fixed-burn multiplier for the hardware focus (physical ops overhead). */
export const HARDWARE_FIXED_BURN_MULTIPLIER = 1.4;
/** Per-customer weekly cost of goods sold for the hardware focus, subtracted alongside burn. */
export const HARDWARE_COGS_PER_CUSTOMER = 8;
/** Extra churn multiplier the hype focus takes, but only while quality trails the rival average — riding hype while genuinely behind is a bigger risk than riding it while ahead. */
export const HYPE_FOCUS_BEHIND_CHURN_MULTIPLIER = 1.3;

export interface FocusProfile {
  /**
   * Which trend wave this focus aligns with (Task 3's `trendFactorsFor`);
   * `null` for `core`/`hype` — `hype` counts as half-aligned with whatever
   * trend is hot, `core` gets a flight-to-quality bonus on any crash.
   */
  trendTag: 'ai' | 'hardware' | null;
  qualityGrowthMultiplier: number;
  arpcMultiplier: number;
  /** Baseline churn multiplier; `hype`'s effective multiplier is conditionally worse — see `focusChurnMultiplierFor`. */
  churnMultiplier: number;
  hypeGainMultiplier: number;
}

/** One row per focus (§1.2) — the whole steady-state shape of each strategic bet. */
export const FOCUS_PROFILES: Record<FocusId, FocusProfile> = {
  core: { trendTag: null, qualityGrowthMultiplier: 1.25, arpcMultiplier: 1.0, churnMultiplier: 0.85, hypeGainMultiplier: 0.8 },
  ai: { trendTag: 'ai', qualityGrowthMultiplier: 0.9, arpcMultiplier: 1.1, churnMultiplier: 1.0, hypeGainMultiplier: 1.3 },
  hardware: {
    trendTag: 'hardware',
    qualityGrowthMultiplier: 0.85,
    arpcMultiplier: 1.6,
    churnMultiplier: 0.7,
    hypeGainMultiplier: 0.9,
  },
  hype: { trendTag: null, qualityGrowthMultiplier: 0.6, arpcMultiplier: 1.0, churnMultiplier: 1.0, hypeGainMultiplier: 1.0 },
};

/** Whether a focus switch's transition drag is still in effect this week. */
export function isInFocusTransition(week: number, focusChangedWeek: number): boolean {
  return week - focusChangedWeek < FOCUS_TRANSITION_WEEKS;
}

/** `FOCUS_TRANSITION_MULTIPLIER` while still transitioning, 1 (no-op) once settled. */
export function focusTransitionMultiplier(week: number, focusChangedWeek: number): number {
  return isInFocusTransition(week, focusChangedWeek) ? FOCUS_TRANSITION_MULTIPLIER : 1;
}

/**
 * Effective churn multiplier for `focus`: each profile's baseline, with the
 * hype focus taking its extra penalty only while quality trails the rival
 * average (chasing hype while genuinely behind the product bar is the
 * riskier position; chasing it while ahead isn't penalized further).
 */
export function focusChurnMultiplierFor(focus: FocusId, yourQuality: number, rivalAvgQuality: number): number {
  const base = FOCUS_PROFILES[focus].churnMultiplier;
  if (focus === 'hype' && yourQuality < rivalAvgQuality) return base * HYPE_FOCUS_BEHIND_CHURN_MULTIPLIER;
  return base;
}

/** Fixed-burn multiplier for the active focus (only hardware moves it). */
export function focusFixedBurnMultiplier(focus: FocusId): number {
  return focus === 'hardware' ? HARDWARE_FIXED_BURN_MULTIPLIER : 1;
}

/** Weekly variable cost (COGS) for the active focus — only hardware carries one. */
export function focusCogsFor(focus: FocusId, customers: number): number {
  return focus === 'hardware' ? customers * HARDWARE_COGS_PER_CUSTOMER : 0;
}

// ── Tech trend waves ─────────────────────────────────────────────────────
/** Demand/hype bonus (added to 1) for a focus fully aligned with a rising trend, before era amplitude scaling. */
export const TREND_RISING_DEMAND_BONUS = 0.3;
export const TREND_RISING_HYPE_BONUS = 0.25;
/** Bigger bonus once the trend peaks. */
export const TREND_PEAK_DEMAND_BONUS = 0.6;
export const TREND_PEAK_HYPE_BONUS = 0.5;
/** Crash-side penalties (subtracted from / added to 1) for a fully aligned focus, before era depth scaling. */
export const TREND_CRASH_DEMAND_DROP = 0.4;
export const TREND_CRASH_HYPE_DROP = 0.5;
export const TREND_CRASH_CHURN_SPIKE = 0.8;
/** Half-strength alignment the `hype` focus gets with whatever trend is currently live, at any phase. */
export const HYPE_FOCUS_TREND_ALIGNMENT_STRENGTH = 0.5;
/** Flight-to-quality demand bonus the `core` focus gets while any trend is crashing (it isn't aligned with any trend). */
export const CORE_FOCUS_CRASH_DEMAND_BONUS = 0.15;

export interface TrendFactors {
  demand: number;
  hype: number;
  churn: number;
}

const NEUTRAL_TREND_FACTORS: TrendFactors = { demand: 1, hype: 1, churn: 1 };

/**
 * Demand/hype/churn multipliers the live tech trend wave applies to a given
 * focus: full-strength alignment when the focus's `trendTag` matches the
 * live trend's id, half-strength alignment for `hype` against *any* live
 * trend (it counts as chasing whatever's hot), and a flight-to-quality
 * demand bonus for `core` specifically while a trend is crashing (core isn't
 * aligned with any trend, so it never takes a crash hit). Neutral (1/1/1)
 * for everyone else, and for everyone during `quiet` — no live wave to ride.
 */
export function trendFactorsFor(focus: FocusId, trend: Trend, era: Era): TrendFactors {
  const trendTag = FOCUS_PROFILES[focus].trendTag;
  const strength = trendTag === trend.id ? 1 : focus === 'hype' ? HYPE_FOCUS_TREND_ALIGNMENT_STRENGTH : 0;

  if (strength === 0) {
    if (focus === 'core' && trend.phase === 'crash') {
      return { demand: 1 + CORE_FOCUS_CRASH_DEMAND_BONUS, hype: 1, churn: 1 };
    }
    return NEUTRAL_TREND_FACTORS;
  }

  const amplitude = ERA_TREND_AMPLITUDE_MULTIPLIER[era];
  switch (trend.phase) {
    case 'rising':
      return {
        demand: 1 + TREND_RISING_DEMAND_BONUS * strength * amplitude,
        hype: 1 + TREND_RISING_HYPE_BONUS * strength * amplitude,
        churn: 1,
      };
    case 'peak':
      return {
        demand: 1 + TREND_PEAK_DEMAND_BONUS * strength * amplitude,
        hype: 1 + TREND_PEAK_HYPE_BONUS * strength * amplitude,
        churn: 1,
      };
    case 'crash': {
      const depth = ERA_TREND_CRASH_DEPTH_MULTIPLIER[era];
      return {
        demand: Math.max(0, 1 - TREND_CRASH_DEMAND_DROP * strength * depth),
        hype: Math.max(0, 1 - TREND_CRASH_HYPE_DROP * strength * depth),
        churn: 1 + TREND_CRASH_CHURN_SPIKE * strength * depth,
      };
    }
    case 'quiet':
    default:
      return NEUTRAL_TREND_FACTORS;
  }
}

// ── Team management: hiring & morale ────────────────────────────────────
/** Morale drifts toward this baseline every week absent other pressure. */
export const MORALE_BASELINE = 70;
/** Era-adjusted morale baseline: Reckoning's layoff fear and down-round dread drag the resting point down. */
export const ERA_MORALE_BASELINE: Record<Era, number> = {
  scrappy: MORALE_BASELINE,
  boom: MORALE_BASELINE,
  reckoning: MORALE_BASELINE - 15,
};
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

// ── Morale thresholds & levers ──────────────────────────────────────────
/** Below this morale, each week carries a seeded risk a random hire quits outright. */
export const MORALE_ATTRITION_THRESHOLD = 40;
/** Weekly probability of an attrition event once morale is under the threshold. */
export const MORALE_ATTRITION_CHANCE = 0.15;
/** Below this (lower) morale, dev effort and sales output both take a flat productivity penalty, on top of the continuous `moraleFactor` curve. */
export const MORALE_CRISIS_THRESHOLD = 25;
/** Multiplier applied to dev effort and sales factor while morale is in crisis. */
export const MORALE_CRISIS_PRODUCTIVITY_MULTIPLIER = 0.7;
/** Weekly cash cost of running the team-offsite/perks morale lever. */
export const MORALE_LEVER_WEEKLY_COST = 3_000;
/** Morale points the lever adds back on tick while active. */
export const MORALE_LEVER_BOOST = 8;

/** Flat penalty (1 = none) applied to dev effort and sales factor once morale drops into crisis. */
export function moraleCrisisMultiplier(morale: number): number {
  return morale < MORALE_CRISIS_THRESHOLD ? MORALE_CRISIS_PRODUCTIVITY_MULTIPLIER : 1;
}

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
 * One week of morale evolution: drifts toward an era-dependent baseline
 * (Reckoning's layoff-fear/down-round dread pulls the baseline down even
 * with no layoffs — see `ERA_MORALE_BASELINE`), then takes a hit scaled by
 * the fraction of total staff cut this week (hiring alone never hurts
 * morale; only net headcount reductions do), then a morale-lever boost if
 * the team offsite/perks budget is active.
 */
export function moraleAfterTick(
  morale: number,
  headcountBefore: Headcount,
  headcountAfter: Headcount,
  era: Era = 'scrappy',
  leverBoost: number = 0,
): number {
  const totalBefore = totalHeadcount(headcountBefore);
  const totalAfter = totalHeadcount(headcountAfter);
  const cutFraction = totalBefore > 0 ? Math.max(0, (totalBefore - totalAfter) / totalBefore) : 0;
  const layoffHit = cutFraction * MORALE_HIT_PER_LAYOFF_FRACTION;
  const drifted = morale + (ERA_MORALE_BASELINE[era] - morale) * MORALE_DRIFT_RATE;
  return clamp(drifted - layoffHit + leverBoost, 0, 100);
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

/** The hired seat's perk multiplier for one specific axis, or 1 (no-op) if empty or on a different axis. */
export function cLevelPerkMultiplierFor(cLevels: CLevels, role: CLevelRole, axis: CLevelPerkAxis): number {
  const hired = cLevels[role].hired;
  return hired && hired.perk.axis === axis ? hired.perk.multiplier : 1;
}

/** The hired seat's tradeoff-side multiplier for one specific axis (e.g. cto-shortcut's decay cost), or 1 if none. */
export function cLevelPerkTradeoffFor(cLevels: CLevels, role: CLevelRole, axis: CLevelPerkAxis): number {
  const hired = cLevels[role].hired;
  return hired && hired.perk.axis === axis ? (hired.perk.tradeoffMultiplier ?? 1) : 1;
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

/** A closed round locks out the next raise for this many weeks — no back-to-back rounds. */
export const ROUND_COOLDOWN_WEEKS = 7;

/** Extra dilution discount from the Morning Standup's rare "clean terms" reward (Task 15). One-time use. */
export const CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER = 0.7;

/** Whether a round can be raised this week, given when the last one closed. */
export function canRaiseRound(week: number, lastRoundRaisedWeek: number | null): boolean {
  return lastRoundRaisedWeek === null || week - lastRoundRaisedWeek >= ROUND_COOLDOWN_WEEKS;
}

export interface RoundTerms {
  round: RoundType;
  amount: number;
  dilution: number;
  isBridge: boolean;
}

/**
 * Computed (not negotiated) terms for the next round: size scales with
 * valuation and hype off a per-round floor; runway under the bridge
 * threshold triggers worse terms (more dilution, less cash); the era then
 * layers its own climate on top — Boom rounds are cheaper and larger,
 * Reckoning rounds are brutally dilutive and stingy with cash (see
 * `ERA_DILUTION_MULTIPLIER` / `ERA_ROUND_CASH_MULTIPLIER`). A CFO's
 * round-terms perk (`cfoDilutionMultiplier`) shaves further off the dilution.
 */
export function roundTermsFor(
  round: RoundType,
  valuation: number,
  hype: number,
  runwayLeftWeeks: number,
  era: Era = 'scrappy',
  cfoDilutionMultiplier: number = 1,
): RoundTerms {
  const isBridge = runwayLeftWeeks < BRIDGE_RUNWAY_THRESHOLD_WEEKS;
  const baseDilution = ROUND_BASE_DILUTION[round];
  const bridgedDilution = isBridge ? baseDilution * BRIDGE_DILUTION_MULTIPLIER : baseDilution;
  const dilution = Math.min(
    MAX_DILUTION_PER_ROUND,
    bridgedDilution * ERA_DILUTION_MULTIPLIER[era] * cfoDilutionMultiplier,
  );
  const scaledAmount = Math.max(valuation, 0) * hype * baseDilution;
  const baseAmount = Math.max(scaledAmount, ROUND_MIN_AMOUNT[round]);
  const bridgedAmount = isBridge ? baseAmount * BRIDGE_CASH_MULTIPLIER : baseAmount;
  const amount = bridgedAmount * ERA_ROUND_CASH_MULTIPLIER[era];
  return { round, amount, dilution, isBridge };
}

/** Founder equity after selling `dilution` of the company: multiplies down, never below 0. */
export function applyDilution(equity: number, dilution: number): number {
  return clamp(equity * (1 - dilution), 0, 1);
}

/**
 * Founder take-home at the given valuation: the run's score-in-progress
 * (and, at exit, the score itself — see `src/game/score.ts`).
 */
export function founderStakeFor(founderEquity: number, valuation: number): number {
  return founderEquity * valuation;
}

// ── Exits: acquisition ───────────────────────────────────────────────────
/** Offer price for an acquisition-offer card: a multiplier of valuation at the moment it's answered. */
export function acquisitionOfferValuationFor(currentValuation: number, valuationMultiplier: number): number {
  return currentValuation * valuationMultiplier;
}

// ── Exits: IPO ───────────────────────────────────────────────────────────
/** Weekly revenue that must be sustained (see below) before an IPO is offered. */
export const IPO_REVENUE_BAR = 150_000;
/** Consecutive weeks revenue must clear `IPO_REVENUE_BAR` before the IPO becomes available. */
export const IPO_SUSTAIN_WEEKS = 4;

/** The next raisable round, or null once seed/A/B are all done. */
export function nextRound(roundsRaised: number): RoundType | null {
  return ROUND_ORDER[roundsRaised] ?? null;
}

export function hasRoundsAvailable(roundsRaised: number): boolean {
  return roundsRaised < ROUND_ORDER.length;
}

// ── Eras ─────────────────────────────────────────────────────────────────
/** Week range (inclusive) the Boom era can start; the exact week is jittered per seed. */
export const BOOM_START_WEEK_MIN = 25;
export const BOOM_START_WEEK_MAX = 35;
/** Week range (inclusive) the Reckoning era can start; jittered per seed, independent of Boom's roll. */
export const RECKONING_START_WEEK_MIN = 55;
export const RECKONING_START_WEEK_MAX = 70;

/** Which era `week` falls in, given this run's (seeded, jittered) transition weeks. */
export function eraForWeek(week: number, boomStartWeek: number, reckoningStartWeek: number): Era {
  if (week >= reckoningStartWeek) return 'reckoning';
  if (week >= boomStartWeek) return 'boom';
  return 'scrappy';
}

// ── Era dials ────────────────────────────────────────────────────────────
/** The IPO window is only open during the Boom — shut before it and slammed shut again once Reckoning hits. */
export const ERA_IPO_WINDOW_OPEN: Record<Era, boolean> = {
  scrappy: false,
  boom: true,
  reckoning: false,
};

/** Hype decay-rate multiplier per era: Boom hype lingers (slower decay), Reckoning snaps back to neutral fastest. */
export const ERA_HYPE_DECAY_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 0.5,
  reckoning: 1.5,
};

/** Round dilution multiplier per era: Boom terms are cheaper, Reckoning terms are brutally dilutive. */
export const ERA_DILUTION_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 0.75,
  reckoning: 1.75,
};

/** Round cash-amount multiplier per era: Boom money is abundant, Reckoning money is stingy. */
export const ERA_ROUND_CASH_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 1.5,
  reckoning: 0.5,
};

/** Rival growth-rate multiplier per era: Boom capital sharpens every competitor further. */
export const ERA_RIVAL_GROWTH_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 1.4,
  reckoning: 1,
};

/** Valuation-multiple compression per era: Reckoning investors pay for far less revenue multiple. */
export const ERA_VALUATION_MULTIPLE_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 1,
  reckoning: 0.5,
};

/** Chance a peaking trend resolves to a crash rather than fading quietly, by era — Reckoning makes crashes the norm. */
export const ERA_TREND_CRASH_CHANCE: Record<Era, number> = {
  scrappy: 0.3,
  boom: 0.25,
  reckoning: 0.7,
};

/** Widens the rising/peak demand & hype bonus for an aligned focus — Boom makes waves bigger. */
export const ERA_TREND_AMPLITUDE_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 1.4,
  reckoning: 1,
};

/** Deepens the crash penalty (demand/hype collapse, churn spike) for an aligned focus — Reckoning crashes hurt worse. */
export const ERA_TREND_CRASH_DEPTH_MULTIPLIER: Record<Era, number> = {
  scrappy: 1,
  boom: 1,
  reckoning: 1.5,
};

// ── Timeline events ──────────────────────────────────────────────────────
/** Combined multiplier from every active timed effect targeting `stat` (1 if none). */
export function timedMultiplierFor(stat: EventStat, effects: TimedEffect[]): number {
  return effects.filter((e) => e.stat === stat).reduce((product, e) => product * e.multiplier, 1);
}

// ── Hype ─────────────────────────────────────────────────────────────────
/** Fraction of the gap to neutral (1.0) that hype closes each week, absent new events. */
export const HYPE_DECAY_RATE = 0.05;

/**
 * One week of hype decay: drifts back toward the neutral baseline of 1.0, at
 * an era-adjusted rate further slowed by a CMO's hype-decay perk, if any.
 */
export function hypeAfterTick(hype: number, era: Era = 'scrappy', cmoDecayMultiplier: number = 1): number {
  return hype + (1.0 - hype) * HYPE_DECAY_RATE * ERA_HYPE_DECAY_MULTIPLIER[era] * cmoDecayMultiplier;
}

// ── Market share ─────────────────────────────────────────────────────────
/** Divisor scaling the quality gap before the tanh soft cap. */
export const GAP_SCALE = 1_500;
/** Soft ceiling on how much share can move against one rival in a single week. */
export const MAX_SHARE_SHIFT = 0.015;

/**
 * Share that moves from the lower-quality side to the higher-quality side
 * against one rival this week — magnitude-scaled by the quality gap via
 * `tanh` rather than pegged at a flat cap, so a bigger gap moves share
 * meaningfully faster while staying bounded. Positive means you gain share
 * from them. Drives rivals' `marketShare` directly; the player's own share is
 * derived from `customers / marketCustomers` (see Task 1's customer
 * pipeline), so support no longer dampens this shift the way the old
 * `supportProtectionFactor` did — support instead retains customers via
 * `supportCoverageFactor`.
 */
export function shareShiftFor(yourQuality: number, rivalQuality: number): number {
  const gap = yourQuality - rivalQuality;
  return Math.tanh(gap / GAP_SCALE) * MAX_SHARE_SHIFT;
}

// ── Weekly report & attribution ─────────────────────────────────────────
export interface CustomerFlowCauses {
  gained: number;
  churnedQuality: number;
  churnedUncovered: number;
  churnedTrendCrash: number;
}

/**
 * Decomposes one week of customer flow into named causes: `gained` from
 * leads × conversion, and churn split into three buckets, attributed in a
 * fixed order so they sum to exactly the same total `churnRateFor` /
 * `customersChurnedFor` would blend into one rate:
 *
 * - `churnedQuality` — the baseline churn rate, the quality-gap multiplier,
 *   and the focus's own static churn profile, bundled together: all three
 *   describe "where your product and strategy stand" rather than a weekly
 *   surprise.
 * - `churnedUncovered` — support coverage's incremental effect on top of
 *   quality (thin coverage on an otherwise-healthy product).
 * - `churnedTrendCrash` — the live trend's own incremental effect on top of
 *   everything else; zero whenever no live trend is hurting (or helping)
 *   this focus (see `trendFactorsFor`), so it only ever shows up around an
 *   actual crash (or, in principle, a rising/peak wave — though those keep
 *   churn neutral by design).
 */
export function customerFlowCausesFor(
  customers: number,
  gained: number,
  quality: number,
  rivalAvgQuality: number,
  support: number,
  focus: FocusId,
  trend: Trend,
  era: Era,
): CustomerFlowCauses {
  const qualityChurn = qualityChurnFactor(quality, rivalAvgQuality);
  const focusChurn = focusChurnMultiplierFor(focus, quality, rivalAvgQuality);
  const coverage = supportCoverageFactor(support, customers);
  const trendChurn = trendFactorsFor(focus, trend, era).churn;

  const throughQuality = customers * BASE_CHURN * qualityChurn * focusChurn;
  const throughCoverage = throughQuality * coverage;
  const throughTrend = throughCoverage * trendChurn;

  return {
    gained,
    churnedQuality: throughQuality,
    churnedUncovered: throughCoverage - throughQuality,
    churnedTrendCrash: throughTrend - throughCoverage,
  };
}

export const BOTTLENECKS = ['quality', 'leads', 'support', 'demand'] as const;
/** The single factor most limiting growth this week — see `bottleneckFor`. */
export type Bottleneck = (typeof BOTTLENECKS)[number];

/** Below this quality-ratio-factor value, quality is judged the bottleneck (checked first — a losing product undermines everything else). */
export const QUALITY_BOTTLENECK_RATIO_THRESHOLD = 0.9;
/** Below this covered-customer fraction, support is judged the bottleneck. */
export const SUPPORT_BOTTLENECK_COVERAGE_THRESHOLD = 0.9;
/** Below this fraction of the addressable pool still unclaimed, demand is judged exhausted. */
export const DEMAND_EXHAUSTED_FRACTION_THRESHOLD = 0.05;

/**
 * The single factor most limiting growth this week, checked in a fixed
 * priority order: quality below the market first (nothing else matters if
 * the product is losing), then thin support coverage, then a saturated
 * addressable market — and if none of those are actually a problem, the
 * default verdict is `'leads'`: nothing is broken, so more sales headcount is
 * the lever left to pull.
 */
export function bottleneckFor(input: {
  quality: number;
  rivalAvgQuality: number;
  support: number;
  customers: number;
  marketCustomers: number;
}): Bottleneck {
  const qualityRatio = qualityRatioFactor(input.quality, input.rivalAvgQuality);
  if (qualityRatio < QUALITY_BOTTLENECK_RATIO_THRESHOLD) return 'quality';

  const coveredFraction =
    input.customers > 0 ? clamp((input.support * CUSTOMERS_PER_SUPPORT) / input.customers, 0, 1) : 1;
  if (coveredFraction < SUPPORT_BOTTLENECK_COVERAGE_THRESHOLD) return 'support';

  const availableDemandFraction =
    input.marketCustomers > 0 ? clamp((input.marketCustomers - input.customers) / input.marketCustomers, 0, 1) : 0;
  if (availableDemandFraction < DEMAND_EXHAUSTED_FRACTION_THRESHOLD) return 'demand';

  return 'leads';
}

/** The state slice `weeklyReportFor` needs — `WeeklyStatsInput` plus what the customer-flow preview and bottleneck verdict read. */
export interface WeeklyReportInput extends WeeklyStatsInput {
  productQuality: number;
  rivals: Rival[];
  marketCustomers: number;
  trend: Trend;
}

export interface WeeklyReport {
  stats: WeeklyStats;
  customerFlow: CustomerFlowCauses;
  bottleneck: Bottleneck;
  trendFactors: TrendFactors;
}

/**
 * The legibility layer: this week's headline stats (`weeklyStatsFor`), a
 * preview of the customer-pipeline flow decomposed into causes, the live
 * trend's effect on this focus, and the single bottleneck verdict — all
 * derived from the state's *current* stock values, the same way
 * `weeklyStatsFor` previews burn/revenue from current values rather than
 * projecting this week's dev effort or morale drift forward. (The real,
 * exact per-tick numbers used for the digest entry come from
 * `customerFlowCausesFor` inside `advanceMarket` in engine.ts, which feeds
 * this same function the actual post-effort quality and committed
 * headcount; this preview is what the UI shows *before* that tick runs.)
 */
export function weeklyReportFor(input: WeeklyReportInput): WeeklyReport {
  const stats = weeklyStatsFor(input);
  const rivalAvgQuality =
    input.rivals.length > 0 ? input.rivals.reduce((sum, r) => sum + r.productQuality, 0) / input.rivals.length : 0;
  const trendFactors = trendFactorsFor(input.focus, input.trend, input.era);

  const leads = leadsFor(input.headcount.sales, input.hype * trendFactors.demand);
  const conversion = conversionRateFor(input.productQuality, rivalAvgQuality);
  const availableDemand = Math.max(0, input.marketCustomers - input.customers);
  const gained = customersGainedFor(leads, conversion, availableDemand);

  const customerFlow = customerFlowCausesFor(
    input.customers,
    gained,
    input.productQuality,
    rivalAvgQuality,
    input.headcount.support,
    input.focus,
    input.trend,
    input.era,
  );

  const bottleneck = bottleneckFor({
    quality: input.productQuality,
    rivalAvgQuality,
    support: input.headcount.support,
    customers: input.customers,
    marketCustomers: input.marketCustomers,
  });

  return { stats, customerFlow, bottleneck, trendFactors };
}
