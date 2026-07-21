/**
 * The pure game engine: `(GameState, GameAction) → GameState`. The UI never
 * mutates state directly — it dispatches actions through the store, which
 * delegates here. Everything is deterministic given the seeded RNG in state.
 */

import { generateCandidates } from './clevels';
import { applyEventEffects } from './events/apply';
import { BOOM_DECK } from './events/boom';
import { drawCadenceWeeks, drawCard, drawFillerCard } from './events/deck';
import { FILLER_DECK } from './events/fillers';
import { RECKONING_DECK } from './events/reckoning';
import { SCRAPPY_DECK } from './events/scrappy';
import { Era, EventCard } from './events/types';
import {
  BOOM_START_WEEK_MAX,
  BOOM_START_WEEK_MIN,
  C_LEVEL_DEPARTURE_MORALE_HIT,
  CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER,
  ERA_IPO_WINDOW_OPEN,
  FOCUS_PROFILES,
  IPO_REVENUE_BAR,
  MORALE_ATTRITION_CHANCE,
  MORALE_ATTRITION_THRESHOLD,
  MORALE_LEVER_BOOST,
  MORALE_LEVER_WEEKLY_COST,
  RECKONING_START_WEEK_MAX,
  RECKONING_START_WEEK_MIN,
  REVIVE_CASH,
  STAGE_AFTER_ROUND,
  STARTING_CASH,
  STARTING_CUSTOMERS,
  STARTING_FOUNDER_EQUITY,
  STARTING_HEADCOUNT,
  STARTING_HYPE,
  STARTING_MARKET_CUSTOMERS,
  STARTING_MARKET_SHARE,
  STARTING_MORALE,
  STARTING_PRODUCT_QUALITY,
  STARTING_STAGE,
  VALUATION_HISTORY_CAP,
  acquisitionOfferValuationFor,
  applyDilution,
  Bottleneck,
  bottleneckFor,
  canRaiseRound,
  churnDefectionSplit,
  cLevelPayroll,
  cLevelPerkMultiplierFor,
  cLevelPerkTradeoffFor,
  clamp,
  conversionRateFor,
  customerFlowCausesFor,
  CustomerFlowCauses,
  customersGainedFor,
  eraForWeek,
  focusCogsFor,
  focusFixedBurnMultiplier,
  focusTransitionMultiplier,
  hypeAfterTick,
  leadsFor,
  marketCustomersAfterTick,
  maxHireableHeadcount,
  moraleAfterTick,
  moraleCrisisMultiplier,
  nextRound,
  qualityAfterTick,
  revenueFor,
  roundTermsFor,
  runwayWeeks,
  shareShiftFor,
  timedMultiplierFor,
  TrendFactors,
  trendFactorsFor,
  valuationFor,
  weeklyBurnFor,
  weeklyStatsFor,
  HYPE_FOCUS_PUMP_PER_WEEK,
} from './balance';
import { buildDigestEntries, customerFlowDigestEntry, eraTransitionEntry, isNotableWeek } from './digest';
import { CLEAN_RAISE_TERMS_FLAG } from './events/standup';
import { createRng, nextFloat, nextInt } from './rng';
import {
  applyChurnDefectionToRivals,
  applyRivalDynamics,
  generateRivals,
  rivalGrowthMultiplier,
  rivalQualityAfterTick,
  rivalTrendShareDelta,
} from './rivals';
import { checkGameOver, isIpoEligible, scoreFor } from './score';
import { advanceTrend, initialTrend, trendPhaseChangeNewsEntry } from './trends';
import {
  C_LEVEL_ROLES,
  CLevels,
  FocusId,
  GameAction,
  GameState,
  Headcount,
  Rival,
  RngState,
  ROLES,
  Role,
  RoundType,
  Trend,
} from './types';
import { NewsEntry } from './events/types';

/** No more cards to draw from the current deck; stop retrying every tick. */
const NO_MORE_EVENTS = Number.MAX_SAFE_INTEGER;

/** Flavor label for the raise news entry. */
const ROUND_LABEL: Record<RoundType, string> = {
  seed: 'Seed',
  seriesA: 'Series A',
  seriesB: 'Series B',
};

/** News copy for a `SET_FOCUS` switch. */
const FOCUS_SWITCH_NEWS: Record<FocusId, { title: string; flavor: string }> = {
  core: { title: 'Focus: back to core product', flavor: 'Heads down on the product itself — quality first.' },
  ai: { title: 'Focus: betting on AI', flavor: 'The roadmap bends toward AI, for better or worse.' },
  hardware: {
    title: 'Focus: going hardware',
    flavor: 'Physical product, physical costs — higher revenue per customer, higher burn.',
  },
  hype: { title: 'Focus: chasing the hype', flavor: 'Marketing over substance — for now.' },
};

/** Each era draws from its own unique-card deck (Task 6: era-gated draw). */
const ERA_DECKS: Record<Era, EventCard[]> = {
  scrappy: SCRAPPY_DECK,
  boom: BOOM_DECK,
  reckoning: RECKONING_DECK,
};

/** Fallback company name for callers that don't collect one (sim script, tests). */
export const DEFAULT_COMPANY_NAME = 'Newco';

/**
 * Create a fresh run. Defaults to a time-based seed for real play.
 * `focus` is the founder type picked during onboarding — set at creation, so
 * it carries no switching penalty (`focusChangedWeek` stays at week 0).
 */
export function newGame(companyName: string, seed: number = Date.now(), focus: FocusId = 'core'): GameState {
  let rng = createRng(seed);
  const cLevels = {} as CLevels;
  for (const role of C_LEVEL_ROLES) {
    const offer = generateCandidates(role, rng);
    cLevels[role] = { hired: null, candidates: offer.candidates };
    rng = offer.rng;
  }
  const rivalOffer = generateRivals(rng);
  rng = rivalOffer.rng;
  const trendOffer = initialTrend(rng);
  rng = trendOffer.rng;
  const [weeksUntilNextEvent, rngAfterCadence] = drawCadenceWeeks(rng);
  rng = rngAfterCadence;
  const [boomStartWeek, rngAfterBoom] = nextInt(rng, BOOM_START_WEEK_MIN, BOOM_START_WEEK_MAX);
  rng = rngAfterBoom;
  const [reckoningStartWeek, rngAfterReckoning] = nextInt(
    rng,
    RECKONING_START_WEEK_MIN,
    RECKONING_START_WEEK_MAX,
  );
  rng = rngAfterReckoning;

  return {
    createdWithSeed: seed,
    companyName,
    rng,
    week: 0,
    cash: STARTING_CASH,
    weeksInTheRed: 0,
    headcount: { ...STARTING_HEADCOUNT },
    pendingHeadcount: { ...STARTING_HEADCOUNT },
    morale: STARTING_MORALE,
    moraleLeverActive: false,
    productQuality: STARTING_PRODUCT_QUALITY,
    hype: STARTING_HYPE,
    customers: STARTING_CUSTOMERS,
    marketCustomers: STARTING_MARKET_CUSTOMERS,
    marketShare: STARTING_MARKET_SHARE,
    focus,
    focusChangedWeek: 0,
    trend: trendOffer.trend,
    valuationHistory: [],
    rivals: rivalOffer.rivals,
    cLevels,
    founderEquity: STARTING_FOUNDER_EQUITY,
    stage: STARTING_STAGE,
    roundsRaised: 0,
    lastRoundRaisedWeek: null,
    pendingEvent: null,
    activeTimedEffects: [],
    newsLog: [],
    drawnEventIds: [],
    storyFlags: [],
    weeksUntilNextEvent,
    era: 'scrappy',
    boomStartWeek,
    reckoningStartWeek,
    ipoWindowOpen: ERA_IPO_WINDOW_OPEN.scrappy,
    weeksRevenueAboveIpoBar: 0,
    gameOver: null,
    finalScore: null,
  };
}

/**
 * Advance the simulation one week: queued hires/fires land as a single batch,
 * morale drifts and takes any layoff hit, dev effort (scaled by morale, any
 * CTO perk, and active timed effects) grows product quality net of tech-debt
 * decay, the customer pipeline runs (leads → conversion → churn, quality- and
 * support-gated — see `advanceMarket`), revenue is billed against the
 * customer base held at the start of the week, revenue rolls up into a
 * valuation snapshot, and — on cadence — a timeline card is drawn. A pending
 * decision card freezes everything above until it's answered.
 */
export function tick(state: GameState): GameState {
  if (state.gameOver) return state; // frozen once the run ends
  if (state.pendingEvent) return state; // frozen until the decision is answered

  const before = weeklyStatsFor(state);
  const week = state.week + 1;
  const era = eraForWeek(week, state.boomStartWeek, state.reckoningStartWeek);
  const trendAdvance = advanceTrend(state.trend, era, state.rng);
  const trend = trendAdvance.trend;
  const trendFactors = trendFactorsFor(state.focus, trend, era);
  const trendNewsEntry = trendPhaseChangeNewsEntry(state.trend, trend, week);
  const headcount = state.pendingHeadcount;
  const leverBoost = state.moraleLeverActive ? MORALE_LEVER_BOOST : 0;
  const morale = moraleAfterTick(state.morale, state.headcount, headcount, era, leverBoost);
  const crisisMultiplier = moraleCrisisMultiplier(morale);
  const focusProfile = FOCUS_PROFILES[state.focus];
  const focusTransition = focusTransitionMultiplier(week, state.focusChangedWeek);

  const devBoost =
    cLevelPerkMultiplierFor(state.cLevels, 'cto', 'cto-productivity') *
    cLevelPerkMultiplierFor(state.cLevels, 'cto', 'cto-shortcut') *
    timedMultiplierFor('productQuality', state.activeTimedEffects) *
    crisisMultiplier *
    focusProfile.qualityGrowthMultiplier *
    focusTransition;
  const decayMultiplier =
    cLevelPerkMultiplierFor(state.cLevels, 'cto', 'cto-techDebt') *
    cLevelPerkTradeoffFor(state.cLevels, 'cto', 'cto-shortcut');
  const hypeBoost =
    cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain') *
    timedMultiplierFor('hype', state.activeTimedEffects) *
    focusProfile.hypeGainMultiplier *
    trendFactors.hype;
  const hypeDecayMultiplier = cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeDecay');
  // The transition drag also dents conversion while a focus switch settles in;
  // any timed-effect boost to demand stacks on top of it.
  const conversionMultiplier = timedMultiplierFor('marketShare', state.activeTimedEffects) * focusTransition;
  const fixedBurnMultiplier =
    cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut') * focusFixedBurnMultiplier(state.focus);
  const execPayroll = cLevelPayroll(state.cLevels);
  const moraleLeverCost = state.moraleLeverActive ? MORALE_LEVER_WEEKLY_COST : 0;
  const variableCost = focusCogsFor(state.focus, state.customers);

  const burn = weeklyBurnFor(headcount, { execPayroll, fixedBurnMultiplier, moraleLeverCost, variableCost });
  const quality = qualityAfterTick(state.productQuality, headcount.devs, morale, devBoost, decayMultiplier);
  const effectiveHype = state.hype * hypeBoost;
  const revenue = revenueFor(state.customers, focusProfile.arpcMultiplier);
  const market = advanceMarket(
    state,
    quality,
    headcount,
    era,
    effectiveHype,
    crisisMultiplier,
    conversionMultiplier,
    trendFactors,
    trend,
    trendAdvance.rng,
  );
  const valuation = valuationFor(revenue, effectiveHype, era);

  const activeTimedEffects = state.activeTimedEffects
    .map((effect) => ({ ...effect, weeksLeft: effect.weeksLeft - 1 }))
    .filter((effect) => effect.weeksLeft > 0);

  const cash = state.cash - burn + revenue;
  const weeksInTheRed = cash < 0 ? state.weeksInTheRed + 1 : 0;
  const weeksRevenueAboveIpoBar = revenue >= IPO_REVENUE_BAR ? state.weeksRevenueAboveIpoBar + 1 : 0;

  const attrition = attritionCheck(headcount, morale, week, market.rng);
  const hypeFocusPump = state.focus === 'hype' ? HYPE_FOCUS_PUMP_PER_WEEK : 0;
  const nextHype = hypeAfterTick(state.hype, era, hypeDecayMultiplier) + hypeFocusPump;

  const digestEntries = buildDigestEntries(
    {
      revenue: before.revenue,
      burn: before.burn,
      runway: before.runway,
      morale: state.morale,
      marketShare: state.marketShare,
      rivals: state.rivals,
      productQuality: state.productQuality,
      hype: state.hype,
    },
    {
      revenue,
      burn,
      runway: runwayWeeks(cash, burn - revenue),
      morale,
      marketShare: market.marketShare,
      rivals: market.rivals,
      productQuality: quality,
      hype: nextHype,
    },
    week,
  );
  const eraEntry = era !== state.era ? eraTransitionEntry(era, week) : null;
  const customerFlowEntry = customerFlowDigestEntry(market.customerFlow, week);

  let advanced: GameState = {
    ...state,
    week,
    cash,
    weeksInTheRed,
    weeksRevenueAboveIpoBar,
    era,
    ipoWindowOpen: ERA_IPO_WINDOW_OPEN[era],
    headcount: attrition.headcount,
    pendingHeadcount: attrition.headcount,
    morale,
    productQuality: quality,
    hype: nextHype,
    customers: market.customers,
    marketCustomers: market.marketCustomers,
    marketShare: market.marketShare,
    rivals: market.rivals,
    trend,
    rng: attrition.rng,
    valuationHistory: [...state.valuationHistory, valuation].slice(-VALUATION_HISTORY_CAP),
    activeTimedEffects,
    newsLog: [
      ...(eraEntry ? [eraEntry] : []),
      ...(trendNewsEntry ? [trendNewsEntry] : []),
      ...(attrition.newsEntry ? [attrition.newsEntry] : []),
      ...market.newsEntries,
      ...(customerFlowEntry ? [customerFlowEntry] : []),
      ...digestEntries,
      ...state.newsLog,
    ],
  };

  advanced = drawEventIfDue(advanced);

  const gameOver = checkGameOver(advanced);
  return {
    ...advanced,
    gameOver,
    finalScore: gameOver ? scoreFor(gameOver, advanced.founderEquity, valuation) : null,
  };
}

/** The current bottleneck verdict (§1.5) for a live `GameState`, from its current stock values. */
function currentBottleneckFor(state: GameState): Bottleneck {
  return bottleneckFor({
    quality: state.productQuality,
    rivalAvgQuality: averageRivalQuality(state.rivals),
    support: state.headcount.support,
    customers: state.customers,
    marketCustomers: state.marketCustomers,
  });
}

/**
 * Fast-forward: advance up to `maxWeeks` in one go, stopping the moment the
 * run ends, a decision card is drawn (nothing to auto-answer), the week that
 * just landed produced any news at all (`isNotableWeek` — event-card
 * resolutions, era transitions, and digest threshold crossings all land in
 * `newsLog`, so this one check catches all of Task 12's stop conditions), or
 * the bottleneck verdict (§1.5) changed — a silent shift in what's limiting
 * growth is itself worth surfacing, even on a week with no news entry.
 * Always returns after at most `maxWeeks` ticks even if every week is quiet.
 */
export function tickMany(state: GameState, maxWeeks: number): GameState {
  let s = state;
  for (let i = 0; i < maxWeeks; i++) {
    if (s.gameOver || s.pendingEvent) return s;
    const bottleneckBefore = currentBottleneckFor(s);
    const next = tick(s);
    const weekEntries = next.newsLog.filter((entry) => entry.week === next.week);
    s = next;
    if (s.gameOver || s.pendingEvent || isNotableWeek(weekEntries)) return s;
    if (currentBottleneckFor(s) !== bottleneckBefore) return s;
  }
  return s;
}

/** Flavor label for the attrition news entry — lowercase, reads naturally mid-sentence. */
const ROLE_TEAM_LABEL: Record<Role, string> = {
  devs: 'engineering',
  sales: 'sales',
  support: 'support',
};

/**
 * Below `MORALE_ATTRITION_THRESHOLD`, each week carries a seeded chance a
 * random staffed role loses one head outright — on top of (not instead of)
 * the continuous morale-driven productivity curve. A no-op above the
 * threshold, or if nobody's left to quit.
 */
function attritionCheck(
  headcount: Headcount,
  morale: number,
  week: number,
  rng: RngState,
): { headcount: Headcount; rng: RngState; newsEntry: NewsEntry | null } {
  if (morale >= MORALE_ATTRITION_THRESHOLD) return { headcount, rng, newsEntry: null };

  const [roll, afterRoll] = nextFloat(rng);
  if (roll >= MORALE_ATTRITION_CHANCE) return { headcount, rng: afterRoll, newsEntry: null };

  const staffed = ROLES.filter((role) => headcount[role] > 0);
  if (staffed.length === 0) return { headcount, rng: afterRoll, newsEntry: null };

  const [idx, afterIdx] = nextInt(afterRoll, 0, staffed.length - 1);
  const role = staffed[idx];
  return {
    headcount: { ...headcount, [role]: headcount[role] - 1 },
    rng: afterIdx,
    newsEntry: {
      week,
      title: 'A burned-out hire quit',
      flavor: `Morale bottomed out and someone on the ${ROLE_TEAM_LABEL[role]} team walked.`,
      kind: 'digest',
    },
  };
}

/** Average product quality across both rivals — the "rival average" the customer pipeline measures your quality against. */
function averageRivalQuality(rivals: Rival[]): number {
  return rivals.reduce((sum, rival) => sum + rival.productQuality, 0) / rivals.length;
}

interface MarketTickResult {
  customers: number;
  marketCustomers: number;
  marketShare: number;
  rivals: Rival[];
  rng: RngState;
  newsEntries: NewsEntry[];
  /** This tick's real, exact customer-flow decomposition — see `customerFlowCausesFor`. */
  customerFlow: CustomerFlowCauses;
}

/**
 * One week of the customer pipeline (§1.1): the addressable pool grows
 * era-scaled, sales generate leads (demand-boosted by hype and the live tech
 * trend wave's `trendFactors.demand` — see `trendFactorsFor` in balance.ts),
 * quality vs. the rival average sets conversion and churn (churn additionally
 * scaled by `trendFactors.churn`), support coverage dampens churn further
 * (replacing the old flat `supportProtectionFactor`), and a share-weighted
 * majority of churned customers defect straight to rivals. Each rival's own
 * `trendFactorsFor(rival.focus, trend, era)` scales its quality growth and
 * nudges its share directly (`rivalTrendShareDelta`) — an aligned rival
 * surges through rising/peak and takes a churn-like share hit on crash — on
 * top of the quality-gap-driven `shareShiftFor`; then the existing
 * pivot/collapse/monopoly dynamics (`applyRivalDynamics`) layer on top.
 * `marketShare` is derived from `customers / marketCustomers`, never shifted
 * directly.
 */
function advanceMarket(
  state: GameState,
  quality: number,
  headcount: Headcount,
  era: Era,
  effectiveHype: number,
  crisisMultiplier: number,
  conversionMultiplier: number,
  trendFactors: TrendFactors,
  trend: Trend,
  rngIn: RngState,
): MarketTickResult {
  const marketCustomers = marketCustomersAfterTick(state.marketCustomers, era);
  const rivalAvgQuality = averageRivalQuality(state.rivals);

  const leads = leadsFor(headcount.sales, effectiveHype * trendFactors.demand) * crisisMultiplier;
  const conversion = conversionRateFor(quality, rivalAvgQuality) * conversionMultiplier;
  const availableDemand = marketCustomers - state.customers;
  const gained = customersGainedFor(leads, conversion, availableDemand);

  const customerFlow = customerFlowCausesFor(
    state.customers,
    gained,
    quality,
    rivalAvgQuality,
    headcount.support,
    state.focus,
    trend,
    era,
  );
  const churned = customerFlow.churnedQuality + customerFlow.churnedUncovered + customerFlow.churnedTrendCrash;
  const defection = churnDefectionSplit(churned);
  const customersAfterFlow = clamp(state.customers + gained - churned, 0, marketCustomers);

  const growthMultiplier = rivalGrowthMultiplier(state.roundsRaised, era);
  let rng = rngIn;
  const shiftedRivals = state.rivals.map((rival) => {
    const shift = shareShiftFor(quality, rival.productQuality);
    const rivalTrend = trendFactorsFor(rival.focus, trend, era);
    const [newQuality, nextRng] = rivalQualityAfterTick(rival.productQuality, rng, growthMultiplier * rivalTrend.demand);
    rng = nextRng;
    const trendShareDelta = rivalTrendShareDelta(rivalTrend);
    return {
      ...rival,
      productQuality: newQuality,
      marketShare: clamp(rival.marketShare - shift + trendShareDelta, 0, 1),
    };
  });
  const rivalsWithDefectors = applyChurnDefectionToRivals(shiftedRivals, defection.toRivals, marketCustomers);

  const dynamics = applyRivalDynamics(rivalsWithDefectors, customersAfterFlow, marketCustomers, quality, era, trend, rng);
  const newsEntries = dynamics.beats.map((beat) => ({ week: state.week + 1, ...beat }));
  const marketShare = marketCustomers > 0 ? clamp(dynamics.customers / marketCustomers, 0, 1) : 0;

  // Your share is derived straight from customers; rivals' share is tracked
  // independently (tanh shift + defection gains + their own script). Rescale
  // rivals proportionally if their combined share would otherwise overrun the
  // pool you don't hold — keeps the 3-way total a legible ≤100% for the UI.
  const remainingPool = clamp(1 - marketShare, 0, 1);
  const rivalShareTotal = dynamics.rivals.reduce((sum, rival) => sum + rival.marketShare, 0);
  const rescale = rivalShareTotal > remainingPool && rivalShareTotal > 0 ? remainingPool / rivalShareTotal : 1;
  const rivals = dynamics.rivals.map((rival) => ({ ...rival, marketShare: rival.marketShare * rescale }));

  return {
    customers: dynamics.customers,
    marketCustomers,
    marketShare,
    rivals,
    rng: dynamics.rng,
    newsEntries,
    customerFlow,
  };
}

/** Ticks down the event countdown and draws/resolves a card once it hits 0. */
function drawEventIfDue(state: GameState): GameState {
  const weeksUntilNextEvent = state.weeksUntilNextEvent - 1;
  if (weeksUntilNextEvent > 0) {
    return { ...state, weeksUntilNextEvent };
  }

  const uniqueDraw = drawCard(ERA_DECKS[state.era], state.drawnEventIds, state.storyFlags, state.rng);
  const draw = uniqueDraw.card ? uniqueDraw : drawFillerCard(FILLER_DECK, state.storyFlags, uniqueDraw.rng);
  if (!draw.card) {
    return { ...state, weeksUntilNextEvent: NO_MORE_EVENTS };
  }

  const [cadence, rng] = drawCadenceWeeks(draw.rng);
  // Repeatable fillers are never added to drawnEventIds, so the same one can be drawn again later.
  const drawnEventIds = draw.card.repeatable
    ? state.drawnEventIds
    : [...state.drawnEventIds, draw.card.id];

  if (draw.card.kind === 'news') {
    const applied = applyEventEffects(state, draw.card.effects ?? {});
    return {
      ...applied,
      rng,
      drawnEventIds,
      weeksUntilNextEvent: cadence,
      newsLog: [
        { week: state.week, title: draw.card.title, flavor: draw.card.flavor },
        ...applied.newsLog,
      ],
    };
  }

  return {
    ...state,
    rng,
    drawnEventIds,
    weeksUntilNextEvent: cadence,
    pendingEvent: draw.card,
  };
}

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NEW_GAME':
      return newGame(action.companyName, action.seed, action.focus);
    case 'TICK':
      return tick(state);
    case 'SET_PENDING_HIRES': {
      const cap = maxHireableHeadcount(action.role, state.cash);
      const next = clamp(state.pendingHeadcount[action.role] + action.delta, 0, cap);
      return {
        ...state,
        pendingHeadcount: { ...state.pendingHeadcount, [action.role]: next },
      };
    }
    case 'SET_MORALE_LEVER':
      return { ...state, moraleLeverActive: action.active };
    case 'HIRE_CLEVEL': {
      const slot = state.cLevels[action.role];
      const candidate = slot.candidates.find((c) => c.id === action.candidateId);
      if (!candidate) return state;
      return {
        ...state,
        cLevels: { ...state.cLevels, [action.role]: { hired: candidate, candidates: slot.candidates } },
      };
    }
    case 'FIRE_CLEVEL': {
      const slot = state.cLevels[action.role];
      if (!slot.hired) return state;
      const offer = generateCandidates(action.role, state.rng);
      return {
        ...state,
        rng: offer.rng,
        morale: clamp(state.morale - C_LEVEL_DEPARTURE_MORALE_HIT, 0, 100),
        cLevels: { ...state.cLevels, [action.role]: { hired: null, candidates: offer.candidates } },
      };
    }
    case 'RAISE_ROUND': {
      const round = nextRound(state.roundsRaised);
      if (!round) return state; // seed/A/B already raised
      if (!canRaiseRound(state.week, state.lastRoundRaisedWeek)) return state; // still on cooldown

      const { valuation, runway: runwayLeft } = weeklyStatsFor(state);
      const hasCleanTerms = state.storyFlags.includes(CLEAN_RAISE_TERMS_FLAG);
      const cfoDilutionMultiplier =
        cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-roundTerms') *
        (hasCleanTerms ? CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER : 1);
      const terms = roundTermsFor(round, valuation, state.hype, runwayLeft, state.era, cfoDilutionMultiplier);

      return {
        ...state,
        cash: state.cash + terms.amount,
        founderEquity: applyDilution(state.founderEquity, terms.dilution),
        roundsRaised: state.roundsRaised + 1,
        stage: STAGE_AFTER_ROUND[round],
        lastRoundRaisedWeek: state.week,
        storyFlags: hasCleanTerms
          ? state.storyFlags.filter((flag) => flag !== CLEAN_RAISE_TERMS_FLAG)
          : state.storyFlags,
        newsLog: [
          {
            week: state.week,
            title: `Raised ${ROUND_LABEL[round]}${terms.isBridge ? ' (bridge)' : ''}`,
            flavor: `$${Math.round(terms.amount).toLocaleString()} for ${Math.round(terms.dilution * 100)}% of the company.`,
          },
          ...state.newsLog,
        ],
      };
    }
    case 'GO_PUBLIC': {
      if (state.gameOver || state.pendingEvent) return state;
      if (!isIpoEligible(state.stage, state.ipoWindowOpen, state.weeksRevenueAboveIpoBar)) return state;

      const { valuation } = weeklyStatsFor(state);
      return {
        ...state,
        gameOver: 'ipo',
        finalScore: scoreFor('ipo', state.founderEquity, valuation),
      };
    }
    case 'ANSWER_EVENT': {
      const card = state.pendingEvent;
      if (!card || card.kind !== 'decision') return state;
      const choice = card.choices?.[action.choiceIndex];
      if (!choice) return state;

      const newsEntry = { week: state.week, title: card.title, flavor: card.flavor, choiceLabel: choice.label };

      if (choice.effects.acquisitionOffer) {
        const { valuation } = weeklyStatsFor(state);
        const offerValuation = acquisitionOfferValuationFor(
          valuation,
          choice.effects.acquisitionOffer.valuationMultiplier,
        );
        return {
          ...state,
          pendingEvent: null,
          gameOver: 'acquired',
          finalScore: scoreFor('acquired', state.founderEquity, offerValuation),
          newsLog: [newsEntry, ...state.newsLog],
        };
      }

      const applied = applyEventEffects(state, choice.effects);
      return {
        ...applied,
        pendingEvent: null,
        newsLog: [newsEntry, ...applied.newsLog],
      };
    }
    case 'REVIVE': {
      // Bailout IAP: a bankrupt run is frozen (`tick` no-ops once `gameOver`
      // is set), so reviving must both refill cash and fully un-end the run in
      // one update — restore cash to a healthy amount, reset the red-week fuse
      // (otherwise the next tick immediately re-triggers `checkGameOver`), and
      // clear `gameOver`/`finalScore`. Cash is a fixed grant (`REVIVE_CASH`),
      // never the random `reason` flavor, which only annotates the news log.
      return {
        ...state,
        cash: Math.max(state.cash, REVIVE_CASH),
        weeksInTheRed: 0,
        gameOver: null,
        finalScore: null,
        newsLog: [
          { week: state.week, title: 'Bailed out', flavor: action.reason },
          ...state.newsLog,
        ],
      };
    }
    case 'SET_FOCUS': {
      if (action.focus === state.focus) return state; // no-op: don't reset the transition drag on a repeat set
      const copy = FOCUS_SWITCH_NEWS[action.focus];
      return {
        ...state,
        focus: action.focus,
        focusChangedWeek: state.week,
        newsLog: [{ week: state.week, title: copy.title, flavor: copy.flavor }, ...state.newsLog],
      };
    }
    default:
      return state;
  }
}
