/**
 * The pure game engine: `(GameState, GameAction) → GameState`. The UI never
 * mutates state directly — it dispatches actions through the store, which
 * delegates here. Everything is deterministic given the seeded RNG in state.
 */

import { generateCandidates } from './clevels';
import { applyEventEffects } from './events/apply';
import { drawCadenceWeeks, drawCard } from './events/deck';
import { SCRAPPY_DECK } from './events/scrappy';
import {
  C_LEVEL_DEPARTURE_MORALE_HIT,
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
  applyDilution,
  cLevelPayroll,
  cLevelPerkMultiplier,
  clamp,
  hypeAfterTick,
  maxHireableHeadcount,
  moraleAfterTick,
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
import { buildDigestEntries } from './digest';
import { createRng } from './rng';
import { generateRivals, rivalGrowthMultiplier, rivalQualityAfterTick } from './rivals';
import { checkGameOver } from './score';
import { C_LEVEL_ROLES, CLevels, GameAction, GameState, Rival, RngState } from './types';

/** No more cards to draw from the current deck; stop retrying every tick. */
const NO_MORE_EVENTS = Number.MAX_SAFE_INTEGER;

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
    productQuality: STARTING_PRODUCT_QUALITY,
    hype: STARTING_HYPE,
    marketShare: STARTING_MARKET_SHARE,
    valuationHistory: [],
    rivals: rivalOffer.rivals,
    cLevels,
    founderEquity: STARTING_FOUNDER_EQUITY,
    stage: STARTING_STAGE,
    roundsRaised: 0,
    pendingEvent: null,
    activeTimedEffects: [],
    newsLog: [],
    drawnEventIds: [],
    weeksUntilNextEvent,
    gameOver: null,
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
  const headcount = state.pendingHeadcount;
  const morale = moraleAfterTick(state.morale, state.headcount, headcount);

  const devBoost =
    cLevelPerkMultiplier(state.cLevels, 'cto') *
    timedMultiplierFor('productQuality', state.activeTimedEffects);
  const hypeBoost =
    cLevelPerkMultiplier(state.cLevels, 'cmo') * timedMultiplierFor('hype', state.activeTimedEffects);
  const marketShareMultiplier = timedMultiplierFor('marketShare', state.activeTimedEffects);
  const fixedBurnMultiplier = cLevelPerkMultiplier(state.cLevels, 'cfo');
  const execPayroll = cLevelPayroll(state.cLevels);

  const burn = weeklyBurnFor(headcount, { execPayroll, fixedBurnMultiplier });
  const quality = qualityAfterTick(state.productQuality, headcount.devs, morale, devBoost);
  const market = advanceMarket(state, quality, headcount.support);
  const salesFactor = salesFactorFor(headcount.sales);
  const effectiveHype = state.hype * hypeBoost;
  const effectiveMarketShare = market.marketShare * marketShareMultiplier;
  const revenue = revenueFor(quality, effectiveMarketShare, effectiveHype, salesFactor);
  const valuation = valuationFor(revenue, effectiveHype);

  const activeTimedEffects = state.activeTimedEffects
    .map((effect) => ({ ...effect, weeksLeft: effect.weeksLeft - 1 }))
    .filter((effect) => effect.weeksLeft > 0);

  const cash = state.cash - burn + revenue;
  const weeksInTheRed = cash < 0 ? state.weeksInTheRed + 1 : 0;
  const week = state.week + 1;

  const digestEntries = buildDigestEntries(
    { revenue: before.revenue, burn: before.burn, runway: before.runway, morale: state.morale, rivals: state.rivals },
    { revenue, burn, runway: runwayWeeks(cash, burn - revenue), morale, rivals: market.rivals },
    week,
  );

  let advanced: GameState = {
    ...state,
    week,
    cash,
    weeksInTheRed,
    headcount,
    pendingHeadcount: headcount,
    morale,
    productQuality: quality,
    hype: hypeAfterTick(state.hype),
    marketShare: market.marketShare,
    rivals: market.rivals,
    rng: market.rng,
    valuationHistory: [...state.valuationHistory, valuation].slice(-VALUATION_HISTORY_CAP),
    activeTimedEffects,
    newsLog: [...digestEntries, ...state.newsLog],
  };

  advanced = drawEventIfDue(advanced);

  return { ...advanced, gameOver: checkGameOver(advanced) };
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
): { marketShare: number; rivals: Rival[]; rng: RngState } {
  const protection = supportProtectionFactor(support);
  const growthMultiplier = rivalGrowthMultiplier(state.roundsRaised);
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

  return { marketShare: clamp(state.marketShare + yourShareDelta, 0, 1), rivals, rng };
}

/** Ticks down the event countdown and draws/resolves a card once it hits 0. */
function drawEventIfDue(state: GameState): GameState {
  const weeksUntilNextEvent = state.weeksUntilNextEvent - 1;
  if (weeksUntilNextEvent > 0) {
    return { ...state, weeksUntilNextEvent };
  }

  const draw = drawCard(SCRAPPY_DECK, state.drawnEventIds, state.rng);
  if (!draw.card) {
    return { ...state, weeksUntilNextEvent: NO_MORE_EVENTS };
  }

  const [cadence, rng] = drawCadenceWeeks(draw.rng);
  const drawnEventIds = [...state.drawnEventIds, draw.card.id];

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

      const hypeBoost = cLevelPerkMultiplier(state.cLevels, 'cmo');
      const effectiveHype = state.hype * hypeBoost;
      const salesFactor = salesFactorFor(state.headcount.sales);
      const revenue = revenueFor(state.productQuality, state.marketShare, effectiveHype, salesFactor);
      const valuation = valuationFor(revenue, effectiveHype);
      const burn = weeklyBurnFor(state.headcount, {
        execPayroll: cLevelPayroll(state.cLevels),
        fixedBurnMultiplier: cLevelPerkMultiplier(state.cLevels, 'cfo'),
      });
      const runwayLeft = runwayWeeks(state.cash, burn - revenue);
      const terms = roundTermsFor(round, valuation, state.hype, runwayLeft);

      return {
        ...state,
        cash: state.cash + terms.amount,
        founderEquity: applyDilution(state.founderEquity, terms.dilution),
        roundsRaised: state.roundsRaised + 1,
        stage: STAGE_AFTER_ROUND[round],
      };
    }
    case 'ANSWER_EVENT': {
      const card = state.pendingEvent;
      if (!card || card.kind !== 'decision') return state;
      const choice = card.choices?.[action.choiceIndex];
      if (!choice) return state;

      const applied = applyEventEffects(state, choice.effects);
      return {
        ...applied,
        pendingEvent: null,
        newsLog: [
          { week: state.week, title: card.title, flavor: card.flavor, choiceLabel: choice.label },
          ...applied.newsLog,
        ],
      };
    }
    default:
      return state;
  }
}
