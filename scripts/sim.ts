/**
 * Headless simulation harness. Runs the pure engine to bankruptcy (or a week
 * cap) under a chosen strategy bot and prints a state table plus a summary —
 * proof the game runs, and balances, with zero UI.
 *
 *   pnpm sim                    # passive bot, default seed
 *   pnpm sim balanced           # balanced bot, default seed
 *   pnpm sim aggressive 777     # aggressive bot, explicit seed
 *   pnpm sim grower 100         # IPO-rush bot: raises every round on cooldown, sales-heavy — Task 9 IPO-reachability bot
 *   pnpm sim complacent 100     # grows early, then coasts — dies in Reckoning (see Task 5)
 *   pnpm sim salesheavy 100     # 30 sales / 3 devs — boom-then-bleed acceptance bot (Task 1)
 *   pnpm sim devheavy 100       # 30 devs / 1 sales — quality with no lead-gen to sell it — Task 9 matrix bot
 *   pnpm sim coregrinder 100    # all-in on core focus + devs — Task 2 quality/churn acceptance bot
 *   pnpm sim hardware 100       # switches to hardware focus week 0 — Task 2 ARPC/burn acceptance bot
 *   pnpm sim hypechaser 100     # switches to hype focus week 0 — Task 3 trend-wave acceptance bot
 *   pnpm sim 12345               # passive bot, explicit seed (legacy form)
 *
 * Task 9 acceptance matrix: balanced / salesheavy / devheavy / coregrinder /
 * hypechaser / hardware, each run across several seeds. `balanced`,
 * `coregrinder`, `hardware`, and `hypechaser` all cap their ongoing sales
 * and/or dev hiring (see each bot's own comment) — uncapped versions of these
 * loops were the actual root cause of "every strategy eventually goes
 * bankrupt from pure payroll bloat once its market saturates," not an
 * underlying engine imbalance (see plan notes for the numbers).
 */

import { CUSTOMERS_PER_SUPPORT, hasRoundsAvailable, runwayWeeks, weeklyStatsFor } from '../src/game/balance';
import { newGame, reduce, tick } from '../src/game/engine';
import { formatMoney } from '../src/lib/format';
import { isIpoEligible } from '../src/game/score';
import type { GameState } from '../src/game/types';

const STRATEGIES = [
  'passive',
  'balanced',
  'aggressive',
  'grower',
  'complacent',
  'salesheavy',
  'devheavy',
  'coregrinder',
  'hardware',
  'hypechaser',
] as const;
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
  return weeklyStatsFor(state).burn;
}

function currentRevenue(state: GameState): number {
  return weeklyStatsFor(state).revenue;
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

  if (strategy === 'salesheavy') {
    // 30 sales / 3 devs (devs never touched — stays at the starting 3): a
    // huge lead-gen engine with no capacity to back it up on quality or
    // support. Should spike revenue fast off pure lead volume, then bleed
    // customers once churn (quality gap + thin support coverage) catches up
    // — the boom-then-bleed acceptance case for Task 1's customer pipeline.
    if (s.week === 0) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 29 });
    }
    return s;
  }

  if (strategy === 'devheavy') {
    // 15 devs / 1 sales (sales never touched — stays at the starting 1):
    // the exact same dev investment as `coregrinder`'s cap, minus
    // `coregrinder`'s sales investment — a deliberately sharp, controlled
    // contrast. `coregrinder` survives indefinitely on that quality; this
    // bot dies within ~10 weeks on every seed, because quality alone is not
    // a revenue strategy in the new economy — conversion is quality-gated,
    // but `gained = leads x conversion`, and leads come from sales, not
    // devs, so 1 lone sales rep can never generate enough leads to escape
    // the game's starting burn/revenue deficit, regardless of how much
    // quality backs it up.
    if (s.week === 0) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 12 });
    }
    return s;
  }

  if (strategy === 'coregrinder') {
    // All-in on product, default core focus never touched: heavy dev
    // investment and support kept topped up. Should end the run with the
    // highest quality and lowest churn rate of the matrix (Task 2's core
    // profile: quality growth x1.25, churn x0.85). Devs and sales are each
    // capped (15 / 25) — uncapped, this bot's own dev-hiring loop ran away
    // to 25+ devs within ~40 weeks (quality's diminishing-returns curve means
    // dev #20 costs exactly as much as dev #1 but does a fraction of the
    // work) and bankrupted the run on pure payroll by week ~35, regardless of
    // any trend or rival — a bot-tuning bug, not an engine one (see plan
    // notes).
    const COREGRINDER_MAX_DEVS = 15;
    const COREGRINDER_MAX_SALES = 25;
    const neededCoreSupport = Math.ceil(s.customers / CUSTOMERS_PER_SUPPORT);
    if (s.pendingHeadcount.support < neededCoreSupport && cashRunwayIfNoRevenue > 4) {
      s = reduce(s, {
        type: 'SET_PENDING_HIRES',
        role: 'support',
        delta: neededCoreSupport - s.pendingHeadcount.support,
      });
    }
    if (burnRatio < 1.5 && cashRunwayIfNoRevenue > 8) {
      if (s.pendingHeadcount.devs < COREGRINDER_MAX_DEVS) {
        s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 1 });
      }
      if (s.pendingHeadcount.sales < COREGRINDER_MAX_SALES) {
        s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 1 });
      }
    }
    return s;
  }

  if (strategy === 'hardware') {
    // Switches focus to hardware on week 0 and never looks back: higher ARPC
    // and lower churn (lock-in), paid for with a fixed-burn multiplier and
    // per-customer COGS (see FOCUS_PROFILES.hardware) — should show the
    // highest revenue per customer and highest burn of the matrix. Devs/sales
    // capped (8 / 30) for the same reason as coregrinder's caps above.
    const HARDWARE_MAX_DEVS = 8;
    const HARDWARE_MAX_SALES = 30;
    if (s.week === 0) {
      s = reduce(s, { type: 'SET_FOCUS', focus: 'hardware' });
    }
    const neededHardwareSupport = Math.ceil(s.customers / CUSTOMERS_PER_SUPPORT);
    if (s.pendingHeadcount.support < neededHardwareSupport && cashRunwayIfNoRevenue > 4) {
      s = reduce(s, {
        type: 'SET_PENDING_HIRES',
        role: 'support',
        delta: neededHardwareSupport - s.pendingHeadcount.support,
      });
    }
    if (burnRatio < 1.3 && cashRunwayIfNoRevenue > 8) {
      if (s.pendingHeadcount.devs < HARDWARE_MAX_DEVS) {
        s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 1 });
      }
      if (s.pendingHeadcount.sales < HARDWARE_MAX_SALES) {
        s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 1 });
      }
    }
    return s;
  }

  if (strategy === 'hypechaser') {
    // Switches to hype focus on week 0 and pours headcount into sales to
    // catch the demand/hype spike — hype rides whichever trend wave is
    // currently live at half strength (see `trendFactorsFor`), regardless of
    // which of AI/hardware/crypto it is. Devs stay untouched (hype's quality
    // growth multiplier is the matrix's worst, 0.6x), so quality trails the
    // rival average almost immediately, which also arms the focus's
    // behind-on-quality churn penalty. Support is kept just topped up. Sales
    // capped at 40 for the same reason as coregrinder/hardware's caps.
    // Should win big riding a wave through peak on a no-crash seed, and lose
    // badly when that wave crashes (demand/hype collapse + churn spike,
    // compounding with the behind-on-quality penalty) — Task 3's acceptance
    // case for the trend system.
    const HYPECHASER_MAX_SALES = 40;
    if (s.week === 0) {
      s = reduce(s, { type: 'SET_FOCUS', focus: 'hype' });
    }
    const neededHypeSupport = Math.ceil(s.customers / CUSTOMERS_PER_SUPPORT);
    if (s.pendingHeadcount.support < neededHypeSupport && cashRunwayIfNoRevenue > 4) {
      s = reduce(s, {
        type: 'SET_PENDING_HIRES',
        role: 'support',
        delta: neededHypeSupport - s.pendingHeadcount.support,
      });
    }
    if (burnRatio < 1.5 && cashRunwayIfNoRevenue > 6 && s.pendingHeadcount.sales < HYPECHASER_MAX_SALES) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 2 });
    }
    return s;
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
    // IPO-rush bot (Task 9's acceptance demo that "IPO remains reachable in
    // Boom for a well-played run"): attempts every round the moment its
    // cooldown clears (RAISE_ROUND self-gates on `canRaiseRound`, so this is
    // safe to call every week) rather than waiting for distress, reaching
    // Growth stage by ~week 20 instead of whenever runway happens to get
    // tight. IPO needs ~6,000 customers (the $150k/wk revenue bar at base
    // ARPC) reached *while Boom's IPO window is still open* (Boom starts
    // week 25-35, per `BOOM_START_WEEK_MIN/MAX`) — so sales gets almost all
    // of the hiring budget from week 0, with just enough devs to hold
    // quality near parity (avoiding the conversion/churn penalty) and support
    // kept topped up. Reaches IPO around week 35-45 across seeds.
    if (hasRoundsAvailable(s.roundsRaised)) {
      s = reduce(s, { type: 'RAISE_ROUND' });
    }
    const neededGrowerSupport = Math.ceil(s.customers / CUSTOMERS_PER_SUPPORT);
    if (s.pendingHeadcount.support < neededGrowerSupport) {
      s = reduce(s, {
        type: 'SET_PENDING_HIRES',
        role: 'support',
        delta: neededGrowerSupport - s.pendingHeadcount.support,
      });
    }
    const GROWER_TARGET_DEVS = 6;
    if (s.pendingHeadcount.devs < GROWER_TARGET_DEVS && cashRunwayIfNoRevenue > 6) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 1 });
    }
    const GROWER_SALES_HIRE_RATE = 3;
    const GROWER_CASH_SAFETY_WEEKS = 4;
    if (cashRunwayIfNoRevenue > GROWER_CASH_SAFETY_WEEKS) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: GROWER_SALES_HIRE_RATE });
    }
    return s;
  }

  const targetBurnRatio = 1.3;
  const cashBufferWeeks = 6;
  // Quality clears the conversion/churn ceiling within a handful of weeks at
  // any reasonable dev count (the quality-ratio curve is clamped — see
  // `qualityRatioFactor`/`qualityChurnFactor`), so piling on devs forever past
  // that point is pure burn with zero further payoff. Balanced caps devs low
  // and puts the rest of its budget toward sales (the actual growth lever)
  // and support (which keeps churn off the ceiling).
  const MAX_BALANCED_DEVS = 6;
  // Sales needs a ceiling too: once the addressable market is mostly
  // captured, `customersGainedFor` clamps to the shrinking `availableDemand`
  // regardless of headcount, so every sales hire past that point is pure
  // payroll waste. Uncapped, this was the actual cause of `balanced`
  // eventually going bankrupt (week ~300, seed 100) despite 70-85% market
  // share and $450-500K/wk revenue — 199 sales reps at $2,000/wk each is
  // ~$400K/wk of burn buying zero incremental customers. 50 comfortably
  // covers even a fully-grown, uncontested market at this game's scale.
  const MAX_BALANCED_SALES = 50;

  // Support is topped up unconditionally (whenever affordable) rather than
  // gated behind the growth checks below — thin coverage is the fastest way
  // to bleed customers regardless of quality, so protecting it comes first.
  const neededSupport = Math.ceil(s.customers / CUSTOMERS_PER_SUPPORT);
  if (s.pendingHeadcount.support < neededSupport && cashRunwayIfNoRevenue > 4) {
    s = reduce(s, {
      type: 'SET_PENDING_HIRES',
      role: 'support',
      delta: neededSupport - s.pendingHeadcount.support,
    });
  }

  // Balanced invests in growth (devs, capped once quality clears the rival
  // average, and sales — the actual lead-gen lever) only once the burn ratio
  // and cash buffer say it can afford to.
  if (burnRatio < targetBurnRatio && cashRunwayIfNoRevenue > cashBufferWeeks) {
    if (s.pendingHeadcount.devs < MAX_BALANCED_DEVS) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 1 });
    }
    if (s.pendingHeadcount.sales < MAX_BALANCED_SALES) {
      s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 1 });
    }
  }

  return s;
}

function row(state: GameState): string {
  const { burn, revenue, valuation } = weeklyStatsFor(state);
  return [
    String(state.week).padStart(4),
    formatMoney(state.cash).padStart(12),
    formatMoney(burn).padStart(9),
    formatMoney(revenue).padStart(9),
    formatMoney(valuation).padStart(10),
    Math.round(state.customers).toString().padStart(9),
    state.era.padStart(10),
  ].join(' | ');
}

let state = newGame(seed);
let peakRevenue = 0;

console.log(`Startup Tycoon — headless sim (strategy: ${strategy}, seed ${seed})`);
console.log('week |         cash |      burn |   revenue |  valuation | customers |       era');
console.log('-----+--------------+-----------+-----------+------------+-----------+-----------');

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
console.log('-----+--------------+-----------+-----------+------------+-----------+-----------');

const outcome = state.gameOver ?? 'timeout';
console.log(
  `Game over: ${outcome} at week ${state.week}, era ${state.era}. Score: ${formatMoney(state.finalScore ?? 0)}.`,
);
console.log(
  `Summary: strategy=${strategy} seed=${seed} outcome=${outcome} week=${state.week} era=${state.era} score=${formatMoney(state.finalScore ?? 0)} peakRevenue=${formatMoney(peakRevenue)}`,
);
