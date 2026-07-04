import { describe, expect, it } from 'vitest';

import {
  BRIDGE_RUNWAY_THRESHOLD_WEEKS,
  ROUND_COOLDOWN_WEEKS,
  ROUND_MIN_AMOUNT,
  applyDilution,
  canRaiseRound,
  founderStakeFor,
  hasRoundsAvailable,
  roundTermsFor,
  weeklyStatsFor,
} from '../balance';
import { newGame, reduce, tick } from '../engine';
import { GameState } from '../types';

// A valuation comfortably above every round's floor, so amount-vs-floor
// interactions don't obscure the scaling assertions below.
const HIGH_VALUATION = 50_000_000;
const AMPLE_RUNWAY = BRIDGE_RUNWAY_THRESHOLD_WEEKS + 10;

describe('roundTermsFor', () => {
  it('amount scales up with valuation', () => {
    const low = roundTermsFor('seed', HIGH_VALUATION, 1, AMPLE_RUNWAY);
    const high = roundTermsFor('seed', HIGH_VALUATION * 2, 1, AMPLE_RUNWAY);
    expect(high.amount).toBeGreaterThan(low.amount);
  });

  it('amount scales up with hype', () => {
    const low = roundTermsFor('seed', HIGH_VALUATION, 1, AMPLE_RUNWAY);
    const high = roundTermsFor('seed', HIGH_VALUATION, 2, AMPLE_RUNWAY);
    expect(high.amount).toBeGreaterThan(low.amount);
  });

  it('never offers less than the per-round floor at low valuation', () => {
    const terms = roundTermsFor('seed', 100, 1, AMPLE_RUNWAY);
    expect(terms.isBridge).toBe(false);
    expect(terms.amount).toBeGreaterThanOrEqual(ROUND_MIN_AMOUNT.seed);
  });

  it('triggers bridge terms exactly under the runway threshold', () => {
    const justAbove = roundTermsFor('seed', HIGH_VALUATION, 1, BRIDGE_RUNWAY_THRESHOLD_WEEKS);
    const justBelow = roundTermsFor(
      'seed',
      HIGH_VALUATION,
      1,
      BRIDGE_RUNWAY_THRESHOLD_WEEKS - 0.01,
    );
    expect(justAbove.isBridge).toBe(false);
    expect(justBelow.isBridge).toBe(true);
  });

  it('bridge terms are worse: more dilution, less cash, for the same round', () => {
    const normal = roundTermsFor('seed', HIGH_VALUATION, 1, AMPLE_RUNWAY);
    const bridge = roundTermsFor('seed', HIGH_VALUATION, 1, 1);
    expect(bridge.dilution).toBeGreaterThan(normal.dilution);
    expect(bridge.amount).toBeLessThan(normal.amount);
  });
});

describe('founderStakeFor', () => {
  it('multiplies equity by valuation', () => {
    expect(founderStakeFor(0.38, 1_300_000)).toBeCloseTo(494_000);
  });

  it('drops after dilution at a fixed valuation', () => {
    const before = founderStakeFor(1, 1_000_000);
    const after = founderStakeFor(applyDilution(1, 0.2), 1_000_000);
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(800_000);
  });

  it('is zero at zero equity', () => {
    expect(founderStakeFor(0, 1_000_000)).toBe(0);
  });
});

describe('applyDilution', () => {
  it('multiplies equity down and never below 0', () => {
    expect(applyDilution(1, 0.2)).toBeCloseTo(0.8);
    expect(applyDilution(0.8, 0.2)).toBeCloseTo(0.64);
    expect(applyDilution(0.1, 0.99)).toBeGreaterThanOrEqual(0);
    expect(applyDilution(0, 0.5)).toBe(0);
  });
});

// Bumps state.week past the raise cooldown without running a real tick (which
// would touch cash/morale/events) — isolates the cooldown gate from the economy.
const skipCooldown = (s: GameState): GameState => ({ ...s, week: s.week + ROUND_COOLDOWN_WEEKS });

describe('RAISE_ROUND', () => {
  it('advances stage exactly once per round and stops after seriesB', () => {
    let s: GameState = { ...newGame('Acme', 1), cash: 1_000_000 };
    expect(s.stage).toBe('garage');

    s = reduce(s, { type: 'RAISE_ROUND' }); // seed
    expect(s.stage).toBe('seed');
    expect(s.roundsRaised).toBe(1);

    s = reduce(skipCooldown(s), { type: 'RAISE_ROUND' }); // series A
    expect(s.stage).toBe('seriesA');
    expect(s.roundsRaised).toBe(2);

    s = reduce(skipCooldown(s), { type: 'RAISE_ROUND' }); // series B -> growth
    expect(s.stage).toBe('growth');
    expect(s.roundsRaised).toBe(3);

    // Can't raise past series B.
    const stuck = reduce(skipCooldown(s), { type: 'RAISE_ROUND' });
    expect(stuck).toEqual(skipCooldown(s));
  });

  it('founder equity compounds correctly across seed + A + B', () => {
    let s: GameState = { ...newGame('Acme', 2), cash: 1_000_000, productQuality: 1_000_000 };
    let equity = 1;

    for (let i = 0; i < 3; i++) {
      const before = s;
      s = reduce(i === 0 ? s : skipCooldown(s), { type: 'RAISE_ROUND' });
      const dilution = 1 - s.founderEquity / before.founderEquity;
      equity = applyDilution(equity, dilution);
    }

    expect(s.founderEquity).toBeCloseTo(equity);
    expect(s.founderEquity).toBeLessThan(1);
    expect(s.founderEquity).toBeGreaterThanOrEqual(0);
  });

  it('adds the raised amount to cash', () => {
    const s0: GameState = { ...newGame('Acme', 5), cash: 10_000 };
    const s1 = reduce(s0, { type: 'RAISE_ROUND' });
    expect(s1.cash).toBeGreaterThan(s0.cash);
  });

  it('rejects a same-week back-to-back raise', () => {
    const s0: GameState = { ...newGame('Acme', 6), cash: 1_000_000 };
    const s1 = reduce(s0, { type: 'RAISE_ROUND' });
    expect(s1.roundsRaised).toBe(1);

    const s2 = reduce(s1, { type: 'RAISE_ROUND' }); // same week — still on cooldown
    expect(s2).toEqual(s1);
  });

  it('rejects a raise before the cooldown elapses, allows it once elapsed', () => {
    const s0: GameState = { ...newGame('Acme', 7), cash: 1_000_000 };
    const s1 = reduce(s0, { type: 'RAISE_ROUND' });

    const tooSoon = reduce({ ...s1, week: s1.week + ROUND_COOLDOWN_WEEKS - 1 }, { type: 'RAISE_ROUND' });
    expect(tooSoon.roundsRaised).toBe(1); // still just the one round

    const s2 = reduce(skipCooldown(s1), { type: 'RAISE_ROUND' });
    expect(s2.roundsRaised).toBe(2);
  });

  it('canRaiseRound matches the reducer gate exactly', () => {
    expect(canRaiseRound(10, null)).toBe(true);
    expect(canRaiseRound(10, 10)).toBe(false);
    expect(canRaiseRound(3 + ROUND_COOLDOWN_WEEKS - 1, 3)).toBe(false); // one week short
    expect(canRaiseRound(3 + ROUND_COOLDOWN_WEEKS, 3)).toBe(true); // exactly the cooldown, inclusive
  });
});

describe('sim evidence: raising early beats always bridging', () => {
  /**
   * Neither bot ever touches headcount, so productQuality/revenue/burn follow
   * an identical path for both — the only thing that can differ is the
   * dilution paid across all 3 rounds. `earlyRaiser` raises the moment a
   * round is eligible (cooldown cleared, runway still healthy); `alwaysBridge`
   * waits until runway is critically low every single time, paying the
   * bridge premium (Task 8's `BRIDGE_DILUTION_MULTIPLIER`) on every round.
   */
  function runFundingBot(seed: number, alwaysBridge: boolean): GameState {
    let s = newGame('Acme', seed);
    for (let i = 0; i < 300 && hasRoundsAvailable(s.roundsRaised) && !s.gameOver; i++) {
      const eligible = hasRoundsAvailable(s.roundsRaised) && canRaiseRound(s.week, s.lastRoundRaisedWeek);
      if (eligible) {
        const { runway } = weeklyStatsFor(s);
        const shouldRaiseNow = alwaysBridge ? runway < BRIDGE_RUNWAY_THRESHOLD_WEEKS : true;
        if (shouldRaiseNow) s = reduce(s, { type: 'RAISE_ROUND' });
      }
      s = tick(s);
      if (s.pendingEvent) s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    }
    return s;
  }

  it('an early-raising bot ends with meaningfully more founder equity than an always-bridging one', () => {
    const earlyRaiser = runFundingBot(1, false);
    const alwaysBridge = runFundingBot(1, true);

    // Both actually finished raising all 3 rounds — otherwise the comparison is moot.
    expect(earlyRaiser.roundsRaised).toBe(3);
    expect(alwaysBridge.roundsRaised).toBe(3);

    expect(earlyRaiser.founderEquity).toBeGreaterThan(alwaysBridge.founderEquity * 1.1);
  });
});
