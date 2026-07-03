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
  IPO_REVENUE_BAR,
  MORALE_ATTRITION_CHANCE,
  MORALE_ATTRITION_THRESHOLD,
  MORALE_LEVER_BOOST,
  MORALE_LEVER_WEEKLY_COST,
  RECKONING_START_WEEK_MAX,
  RECKONING_START_WEEK_MIN,
  SAVE_VERSION,
  STAGE_AFTER_ROUND,
  STARTING_CASH,
  STARTING_FOUNDER_EQUITY,
  STARTING_HEADCOUNT,
  STARTING_HYPE,
  STARTING_MARKET_SHARE,
  STARTING_MORALE,
  STARTING_PRODUCT_QUALITY,
  STARTING_STAGE,
  VALUATION_HISTORY_CAP,
  acquisitionOfferValuationFor,
  applyDilution,
  canRaiseRound,
  cLevelPayroll,
  cLevelPerkMultiplierFor,
  cLevelPerkTradeoffFor,
  clamp,
  eraForWeek,
  hypeAfterTick,
  maxHireableHeadcount,
  moraleAfterTick,
  moraleCrisisMultiplier,
  nextRound,
  qualityAfterTick,
  revenueFor,
  roundTermsFor,
  runwayWeeks,
  salesFactorFor,
  shareShiftFor,
  supportProtectionFactor,
  timedMultiplierFor,
  valuationFor,
  weeklyBurnFor,
  weeklyStatsFor,
} from './balance';
import { buildDigestEntries, eraTransitionEntry, isNotableWeek } from './digest';
import { CLEAN_RAISE_TERMS_FLAG } from './events/standup';
import { createRng, nextFloat, nextInt } from './rng';
import {
  applyRivalDynamics,
  generateRivals,
  rivalGrowthMultiplier,
  rivalQualityAfterTick,
} from './rivals';
import { checkGameOver, isIpoEligible, scoreFor } from './score';
import {
  C_LEVEL_ROLES,
  CLevels,
  GameAction,
  GameState,
  Headcount,
  Rival,
  RngState,
  ROLES,
  Role,
  RoundType,
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

/** Each era draws from its own unique-card deck (Task 6: era-gated draw). */
const ERA_DECKS: Record<Era, EventCard[]> = {
  scrappy: SCRAPPY_DECK,
  boom: BOOM_DECK,
  reckoning: RECKONING_DECK,
};

/** Create a fresh run. Defaults to a time-based seed for real play. */
export function newGame(seed: number = Date.now()): GameState {
  let rng = createRng(seed);
  const cLevels = {} as CLevels;
  for (const role of C_LEVEL_ROLES) {
    const offer = generateCandidates(role, rng);
    cLevels[role] = { hired: null, candidates: offer.candidates };
    rng = offer.rng;
  }
  const rivalOffer = generateRivals(rng);
  rng = rivalOffer.rng;
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
    version: SAVE_VERSION,
    createdWithSeed: seed,
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
    marketShare: STARTING_MARKET_SHARE,
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
 * decay, quality is monetized into revenue (boosted by any CMO perk and timed
 * effects), revenue rolls up into a valuation snapshot, and — on cadence — a
 * timeline card is drawn. A pending decision card freezes everything above
 * until it's answered.
 */
export function tick(state: GameState): GameState {
  if (state.gameOver) return state; // frozen once the run ends
  if (state.pendingEvent) return state; // frozen until the decision is answered

  const before = weeklyStatsFor(state);
  const week = state.week + 1;
  const era = eraForWeek(week, state.boomStartWeek, state.reckoningStartWeek);
  const headcount = state.pendingHeadcount;
  const leverBoost = state.moraleLeverActive ? MORALE_LEVER_BOOST : 0;
  const morale = moraleAfterTick(state.morale, state.headcount, headcount, era, leverBoost);
  const crisisMultiplier = moraleCrisisMultiplier(morale);

  const devBoost =
    cLevelPerkMultiplierFor(state.cLevels, 'cto', 'cto-productivity') *
    cLevelPerkMultiplierFor(state.cLevels, 'cto', 'cto-shortcut') *
    timedMultiplierFor('productQuality', state.activeTimedEffects) *
    crisisMultiplier;
  const decayMultiplier =
    cLevelPerkMultiplierFor(state.cLevels, 'cto', 'cto-techDebt') *
    cLevelPerkTradeoffFor(state.cLevels, 'cto', 'cto-shortcut');
  const hypeBoost =
    cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain') *
    timedMultiplierFor('hype', state.activeTimedEffects);
  const hypeDecayMultiplier = cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeDecay');
  const marketShareMultiplier = timedMultiplierFor('marketShare', state.activeTimedEffects);
  const fixedBurnMultiplier = cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut');
  const execPayroll = cLevelPayroll(state.cLevels);
  const moraleLeverCost = state.moraleLeverActive ? MORALE_LEVER_WEEKLY_COST : 0;

  const burn = weeklyBurnFor(headcount, { execPayroll, fixedBurnMultiplier, moraleLeverCost });
  const quality = qualityAfterTick(state.productQuality, headcount.devs, morale, devBoost, decayMultiplier);
  const market = advanceMarket(state, quality, headcount.support, era);
  const salesFactor = salesFactorFor(headcount.sales) * crisisMultiplier;
  const effectiveHype = state.hype * hypeBoost;
  const effectiveMarketShare = market.marketShare * marketShareMultiplier;
  const revenue = revenueFor(quality, effectiveMarketShare, effectiveHype, salesFactor);
  const valuation = valuationFor(revenue, effectiveHype, era);

  const activeTimedEffects = state.activeTimedEffects
    .map((effect) => ({ ...effect, weeksLeft: effect.weeksLeft - 1 }))
    .filter((effect) => effect.weeksLeft > 0);

  const cash = state.cash - burn + revenue;
  const weeksInTheRed = cash < 0 ? state.weeksInTheRed + 1 : 0;
  const weeksRevenueAboveIpoBar = revenue >= IPO_REVENUE_BAR ? state.weeksRevenueAboveIpoBar + 1 : 0;

  const attrition = attritionCheck(headcount, morale, week, market.rng);
  const nextHype = hypeAfterTick(state.hype, era, hypeDecayMultiplier);

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
    marketShare: market.marketShare,
    rivals: market.rivals,
    rng: attrition.rng,
    valuationHistory: [...state.valuationHistory, valuation].slice(-VALUATION_HISTORY_CAP),
    activeTimedEffects,
    newsLog: [
      ...(eraEntry ? [eraEntry] : []),
      ...(attrition.newsEntry ? [attrition.newsEntry] : []),
      ...market.newsEntries,
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

/**
 * Fast-forward: advance up to `maxWeeks` in one go, stopping the moment the
 * run ends, a decision card is drawn (nothing to auto-answer), or the week
 * that just landed produced any news at all (`isNotableWeek` — event-card
 * resolutions, era transitions, and digest threshold crossings all land in
 * `newsLog`, so this one check catches all of Task 12's stop conditions).
 * Always returns after at most `maxWeeks` ticks even if every week is quiet.
 */
export function tickMany(state: GameState, maxWeeks: number): GameState {
  let s = state;
  for (let i = 0; i < maxWeeks; i++) {
    if (s.gameOver || s.pendingEvent) return s;
    const next = tick(s);
    const weekEntries = next.newsLog.filter((entry) => entry.week === next.week);
    s = next;
    if (s.gameOver || s.pendingEvent || isNotableWeek(weekEntries)) return s;
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

/**
 * One week of competitive dynamics: each rival grows on its own script, and
 * your share shifts against each of them based on the quality gap (support
 * headcount dampens losses — see `supportProtectionFactor`). Conserves share
 * within each you-vs-rival pair, so the 3-way total never exceeds 100%.
 */
function advanceMarket(
  state: GameState,
  quality: number,
  support: number,
  era: Era,
): { marketShare: number; rivals: Rival[]; rng: RngState; newsEntries: NewsEntry[] } {
  const protection = supportProtectionFactor(support);
  const growthMultiplier = rivalGrowthMultiplier(state.roundsRaised, era);
  let rng = state.rng;
  let yourShareDelta = 0;

  const rivals = state.rivals.map((rival) => {
    const shift = shareShiftFor(quality, rival.productQuality);
    const dampenedShift = shift < 0 ? shift * protection : shift;
    yourShareDelta += dampenedShift;

    const [newQuality, nextRng] = rivalQualityAfterTick(rival.productQuality, rng, growthMultiplier);
    rng = nextRng;

    return {
      ...rival,
      productQuality: newQuality,
      marketShare: clamp(rival.marketShare - dampenedShift, 0, 1),
    };
  });

  const marketShare = clamp(state.marketShare + yourShareDelta, 0, 1);
  const dynamics = applyRivalDynamics(rivals, marketShare, quality, era, rng);
  const newsEntries = dynamics.beats.map((beat) => ({ week: state.week + 1, ...beat }));
  return { marketShare: dynamics.marketShare, rivals: dynamics.rivals, rng: dynamics.rng, newsEntries };
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
      return newGame(action.seed);
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

      const hypeBoost = cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain');
      const effectiveHype = state.hype * hypeBoost;
      const salesFactor = salesFactorFor(state.headcount.sales);
      const revenue = revenueFor(state.productQuality, state.marketShare, effectiveHype, salesFactor);
      const valuation = valuationFor(revenue, effectiveHype, state.era);
      const burn = weeklyBurnFor(state.headcount, {
        execPayroll: cLevelPayroll(state.cLevels),
        fixedBurnMultiplier: cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut'),
      });
      const runwayLeft = runwayWeeks(state.cash, burn - revenue);
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
    default:
      return state;
  }
}
