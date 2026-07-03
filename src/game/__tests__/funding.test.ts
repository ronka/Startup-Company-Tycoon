import { describe, expect, it } from 'vitest';

import {
  BRIDGE_RUNWAY_THRESHOLD_WEEKS,
  ROUND_MIN_AMOUNT,
  applyDilution,
  roundTermsFor,
} from '../balance';
import { newGame, reduce } from '../engine';
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

describe('applyDilution', () => {
  it('multiplies equity down and never below 0', () => {
    expect(applyDilution(1, 0.2)).toBeCloseTo(0.8);
    expect(applyDilution(0.8, 0.2)).toBeCloseTo(0.64);
    expect(applyDilution(0.1, 0.99)).toBeGreaterThanOrEqual(0);
    expect(applyDilution(0, 0.5)).toBe(0);
  });
});

describe('RAISE_ROUND', () => {
  it('advances stage exactly once per round and stops after seriesB', () => {
    let s: GameState = { ...newGame(1), cash: 1_000_000 };
    expect(s.stage).toBe('garage');

    s = reduce(s, { type: 'RAISE_ROUND' }); // seed
    expect(s.stage).toBe('seed');
    expect(s.roundsRaised).toBe(1);

    s = reduce(s, { type: 'RAISE_ROUND' }); // series A
    expect(s.stage).toBe('seriesA');
    expect(s.roundsRaised).toBe(2);

    s = reduce(s, { type: 'RAISE_ROUND' }); // series B -> growth
    expect(s.stage).toBe('growth');
    expect(s.roundsRaised).toBe(3);

    // Can't raise past series B.
    const stuck = reduce(s, { type: 'RAISE_ROUND' });
    expect(stuck).toEqual(s);
  });

  it('founder equity compounds correctly across seed + A + B', () => {
    let s: GameState = { ...newGame(2), cash: 1_000_000, productQuality: 1_000_000 };
    let equity = 1;

    for (let i = 0; i < 3; i++) {
      const before = s;
      s = reduce(s, { type: 'RAISE_ROUND' });
      const dilution = 1 - s.founderEquity / before.founderEquity;
      equity = applyDilution(equity, dilution);
    }

    expect(s.founderEquity).toBeCloseTo(equity);
    expect(s.founderEquity).toBeLessThan(1);
    expect(s.founderEquity).toBeGreaterThanOrEqual(0);
  });

  it('adds the raised amount to cash', () => {
    const s0: GameState = { ...newGame(5), cash: 10_000 };
    const s1 = reduce(s0, { type: 'RAISE_ROUND' });
    expect(s1.cash).toBeGreaterThan(s0.cash);
  });
});
