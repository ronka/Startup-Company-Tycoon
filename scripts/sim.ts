/**
 * Headless simulation harness. Runs the pure engine to bankruptcy (or a week
 * cap) under a chosen strategy bot and prints a state table plus a summary —
 * proof the game runs, and balances, with zero UI.
 *
 *   pnpm sim                    # passive bot, default seed
 *   pnpm sim balanced           # balanced bot, default seed
 *   pnpm sim aggressive 777     # aggressive bot, explicit seed
 *   pnpm sim grower 100         # grower bot, chases an IPO exit
 *   pnpm sim complacent 100     # grows early, then coasts — dies in Reckoning (see Task 5)
 *   pnpm sim 12345               # passive bot, explicit seed (legacy form)
 */

import {
  cLevelPayroll,
  cLevelPerkMultiplierFor,
  hasRoundsAvailable,
  revenueFor,
  runwayWeeks,
  salesFactorFor,
  valuationFor,
  weeklyBurnFor,
} from '../src/game/balance';
import { newGame, reduce, tick } from '../src/game/engine';
import { formatMoney } from '../src/lib/format';
import { isIpoEligible } from '../src/game/score';
import type { GameState } from '../src/game/types';

const STRATEGIES = ['passive', 'balanced', 'aggressive', 'grower', 'complacent'] as const;
type Strategy = (typeof STRATEGIES)[number];

function isStrategy(s: string): s is Strategy {
  return (STRATEGIES as readonly string[]).includes(s);
}

const arg2 = process.argv[2];
const arg3 = process.argv[3];
const strategy: Strategy = arg2 && isStrategy(arg2) ? arg2 : 'passive';
const seed = Number(arg2 && isStrategy(arg2) ? (arg3 ?? 12345) : (arg2 ?? 12345));
const MAX_WEEKS = 1000;

function currentBurn(state: GameState): number {
  return weeklyBurnFor(state.headcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut'),
  });
}

function currentRevenue(state: GameState): number {
  const effectiveHype = state.hype * cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain');
  return revenueFor(
    state.productQuality,
    state.marketShare,
    effectiveHype,
    salesFactorFor(state.headcount.sales),
  );
}

/**
 * One week of bot decision-making, applied to `pendingHeadcount`/funding
 * before the tick commits it. `passive` never touches either lever —
 * it's the baseline "do nothing" run the fail-state fuse (Task 1) has to
 * catch. `balanced` hires toward a healthy revenue/burn ratio and raises
 * once runway gets tight. `aggressive` hires and raises much more eagerly,
 * trading safety margin for a shot at a bigger, faster outcome.
 */
function applyStrategy(strategy: Strategy, state: GameState): GameState {
  if (strategy === 'passive') return state;

  const burn = currentBurn(state);
  const revenue = currentRevenue(state);
  const runway = runwayWeeks(state.cash, burn - revenue);
  const cashRunwayIfNoRevenue = runwayWeeks(state.cash, burn);
  const burnRatio = burn > 0 ? revenue / burn : 1;

  // Plays exactly like `balanced` (below) through its first 50 weeks — hires
  // toward a healthy margin, raises when runway gets tight — then goes
  // completely hands-off forever: no more hires, no more raises, no
  // reaction to runway at all. This is the demo bot for Task 5's era
  // dials: comfortably profitable through Scrappy and into Boom, but a
  // stagnant product (rivals keep sharpening every week regardless of era)
  // combined with Reckoning's lower morale baseline can still sink a
  // company that stopped paying attention.
  const COMPLACENT_FREEZE_WEEK = 50;
  if (strategy === 'complacent' && state.week >= COMPLACENT_FREEZE_WEEK) return state;

  let s = state;

  // Aggressive plays chicken with runway — it only raises once nearly out of
  // road, rather than topping up early like `balanced` — so a bad RNG
  // stretch (slow rival jitter luck, a costly event) can outrun the raise.
  const raiseRunwayThreshold = strategy === 'aggressive' ? 3 : 10;
  if (runway < raiseRunwayThreshold && hasRoundsAvailable(s.roundsRaised)) {
    s = reduce(s, { type: 'RAISE_ROUND' });
  }

  if (strategy === 'aggressive') {
    // Blow most of the seed cash on one all-in founding-team burst instead
    // of hiring incrementally — burn jumps immediately, well ahead of
    // revenue, betting the ramp-up (which is sensitive to seeded rival
    // jitter and event draws) outruns the clock. That timing race is what
    // gives this bot real seed-to-seed variance instead of always winning.
    if (s.week === 0) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 12 });
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 6 });
    }
    return s;
  }

  if (strategy === 'grower') {
    // Raises every round as soon as runway allows it (rather than waiting
    // for distress) so the run reaches Growth stage early, then keeps
    // reinvesting in both devs (product quality) and sales (revenue
    // multiplier) — the combination the IPO revenue bar actually needs.
    if (runway < 20 && hasRoundsAvailable(s.roundsRaised)) {
      s = reduce(s, { type: 'RAISE_ROUND' });
    }
    const growerBurnRatio = 2.5;
    const growerCashBufferWeeks = 8;
    if (burnRatio < growerBurnRatio && cashRunwayIfNoRevenue > growerCashBufferWeeks) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 2 });
      if (s.week % 4 === 0) {
        s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 1 });
      }
    }
    return s;
  }

  const targetBurnRatio = 1.3;
  const cashBufferWeeks = 10;

  if (burnRatio < targetBurnRatio && cashRunwayIfNoRevenue > cashBufferWeeks) {
    s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 1 });
  }

  return s;
}

function row(state: GameState): string {
  const burn = currentBurn(state);
  const revenue = currentRevenue(state);
  const effectiveHype = state.hype * cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain');
  const valuation = valuationFor(revenue, effectiveHype, state.era);
  return [
    String(state.week).padStart(4),
    formatMoney(state.cash).padStart(12),
    formatMoney(burn).padStart(9),
    formatMoney(revenue).padStart(9),
    formatMoney(valuation).padStart(10),
    state.era.padStart(10),
  ].join(' | ');
}

let state = newGame(seed);
let peakRevenue = 0;

console.log(`Startup Tycoon — headless sim (strategy: ${strategy}, seed ${seed})`);
console.log('week |         cash |      burn |   revenue |  valuation |       era');
console.log('-----+--------------+-----------+-----------+------------+-----------');

while (!state.gameOver && state.week < MAX_WEEKS) {
  console.log(row(state));
  peakRevenue = Math.max(peakRevenue, currentRevenue(state));
  state = applyStrategy(strategy, state);
  state = tick(state);
  // A decision card blocks TICK until answered — a bare sim always takes the first choice.
  if (state.pendingEvent) {
    const card = state.pendingEvent;
    console.log(`      -- event: ${card.title} -> "${card.choices?.[0]?.label}"`);
    state = reduce(state, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    state = tick(state);
  }
  // Every bot takes the exit the moment it's on offer — score only grows if you keep playing,
  // but so does the risk of a Reckoning death (Task 5), so this is the "cash out" baseline.
  if (!state.gameOver && isIpoEligible(state.stage, state.ipoWindowOpen, state.weeksRevenueAboveIpoBar)) {
    state = reduce(state, { type: 'GO_PUBLIC' });
  }
}
console.log(row(state));
peakRevenue = Math.max(peakRevenue, currentRevenue(state));
console.log('-----+--------------+-----------+-----------+------------+-----------');

const outcome = state.gameOver ?? 'timeout';
console.log(
  `Game over: ${outcome} at week ${state.week}, era ${state.era}. Score: ${formatMoney(state.finalScore ?? 0)}.`,
);
console.log(
  `Summary: strategy=${strategy} seed=${seed} outcome=${outcome} week=${state.week} era=${state.era} score=${formatMoney(state.finalScore ?? 0)} peakRevenue=${formatMoney(peakRevenue)}`,
);
