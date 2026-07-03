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
  Headcount,
  ROUND_ORDER,
  Role,
  RoundType,
  Stage,
} from './types';

/** The state slice `weeklyStatsFor` needs — matches a subset of `GameState`. */
export interface WeeklyStatsInput {
  headcount: Headcount;
  cLevels: CLevels;
  hype: number;
  productQuality: number;
  marketShare: number;
  cash: number;
  era: Era;
  moraleLeverActive: boolean;
}

/** Bump when the shape of a saved GameState changes incompatibly. */
export const SAVE_VERSION = 5;

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
  options: { execPayroll?: number; fixedBurnMultiplier?: number; moraleLeverCost?: number } = {},
): number {
  const { execPayroll = 0, fixedBurnMultiplier = 1, moraleLeverCost = 0 } = options;
  return payrollFor(headcount) + FIXED_WEEKLY_BURN * fixedBurnMultiplier + execPayroll + moraleLeverCost;
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
    fixedBurnMultiplier: cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut'),
    moraleLeverCost: state.moraleLeverActive ? MORALE_LEVER_WEEKLY_COST : 0,
  });
  const effectiveHype = state.hype * cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain');
  const revenue = revenueFor(
    state.productQuality,
    state.marketShare,
    effectiveHype,
    salesFactorFor(state.headcount.sales),
  );
  const valuation = valuationFor(revenue, effectiveHype, state.era);
  const runway = runwayWeeks(state.cash, burn - revenue);
  return { burn, revenue, valuation, runway };
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
