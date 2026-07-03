/**
 * Headless simulation harness. Runs the pure engine to bankruptcy and prints a
 * state table — proof the game runs with zero UI.
 *
 *   pnpm sim            # default seed
 *   pnpm sim 12345      # explicit seed
 */

import {
  cLevelPayroll,
  cLevelPerkMultiplier,
  revenueFor,
  salesFactorFor,
  valuationFor,
  weeklyBurnFor,
} from '../src/game/balance';
import { newGame, reduce, tick } from '../src/game/engine';
import { formatMoney } from '../src/lib/format';
import type { GameState } from '../src/game/types';

const seed = Number(process.argv[2] ?? 12345);
const MAX_WEEKS = 1000;

function row(state: GameState): string {
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
  return [
    String(state.week).padStart(4),
    formatMoney(state.cash).padStart(12),
    formatMoney(burn).padStart(9),
    formatMoney(revenue).padStart(9),
    formatMoney(valuation).padStart(10),
  ].join(' | ');
}

let state = newGame(seed);
console.log(`Startup Tycoon — headless sim (seed ${seed})`);
console.log('week |         cash |      burn |   revenue |  valuation');
console.log('-----+--------------+-----------+-----------+-----------');

while (!state.gameOver && state.week < MAX_WEEKS) {
  console.log(row(state));
  state = tick(state);
  // A decision card blocks TICK until answered — a bare sim always takes the first choice.
  if (state.pendingEvent) {
    const card = state.pendingEvent;
    console.log(`      -- event: ${card.title} -> "${card.choices?.[0]?.label}"`);
    state = reduce(state, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    state = tick(state);
  }
}
console.log(row(state));
console.log('-----+--------------+-----------+-----------+-----------');
console.log(`Game over: ${state.gameOver ?? 'timeout'} at week ${state.week}.`);
