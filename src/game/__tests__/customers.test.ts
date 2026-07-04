import { describe, expect, it } from 'vitest';

import {
  ARPC,
  BASE_CHURN,
  BASE_CONVERSION,
  CHURN_DEFECTION_RATE,
  CUSTOMERS_PER_SUPPORT,
  MARKET_GROWTH_RATE,
  MAX_CONVERSION_RATE,
  MAX_SHARE_SHIFT,
  QUALITY_CHURN_CEILING,
  QUALITY_CHURN_FLOOR,
  QUALITY_CONVERSION_CEILING,
  QUALITY_CONVERSION_FLOOR,
  UNCOVERED_CHURN_MULTIPLIER,
  churnDefectionSplit,
  churnRateFor,
  conversionRateFor,
  customersChurnedFor,
  customersGainedFor,
  leadsFor,
  marketCustomersAfterTick,
  qualityChurnFactor,
  qualityRatioFactor,
  revenueFor,
  shareShiftFor,
  supportCoverageFactor,
} from '../balance';
import { newGame, tick } from '../engine';
import { GameState } from '../types';

describe('leadsFor', () => {
  it('matches LEADS_PER_SALES × sales^SALES_EXPONENT × demand multiplier exactly', () => {
    expect(leadsFor(10, 1.5)).toBeCloseTo(12 * Math.pow(10, 0.9) * 1.5);
  });

  it('zero sales means zero leads, regardless of demand multiplier', () => {
    expect(leadsFor(0, 5)).toBe(0);
  });

  it('is sublinear: doubling sales less than doubles leads', () => {
    const ten = leadsFor(10);
    const twenty = leadsFor(20);
    expect(twenty).toBeGreaterThan(ten);
    expect(twenty).toBeLessThan(ten * 2);
  });
});

describe('qualityRatioFactor / qualityChurnFactor (soft, bounded quality-gap curve)', () => {
  it('at quality parity, both sit above their floor and below their ceiling', () => {
    const conv = qualityRatioFactor(100, 100);
    const churn = qualityChurnFactor(100, 100);
    expect(conv).toBe(1);
    expect(churn).toBe(1);
  });

  it('clamps to the documented floor/ceiling instead of running away unbounded', () => {
    expect(qualityRatioFactor(1_000_000, 1)).toBe(QUALITY_CONVERSION_CEILING);
    expect(qualityRatioFactor(1, 1_000_000)).toBe(QUALITY_CONVERSION_FLOOR);
    expect(qualityChurnFactor(1, 1_000_000)).toBe(QUALITY_CHURN_CEILING);
    expect(qualityChurnFactor(1_000_000, 1)).toBe(QUALITY_CHURN_FLOOR);
  });

  it('is monotonic: higher relative quality always raises the conversion factor and lowers the churn factor', () => {
    expect(qualityRatioFactor(200, 100)).toBeGreaterThan(qualityRatioFactor(100, 100));
    expect(qualityChurnFactor(200, 100)).toBeLessThan(qualityChurnFactor(100, 100));
  });
});

describe('conversionRateFor', () => {
  it('quality below the rival average measurably cuts conversion', () => {
    const behind = conversionRateFor(10, 100);
    const parity = conversionRateFor(100, 100);
    expect(behind).toBeLessThan(parity);
  });

  it('never exceeds MAX_CONVERSION_RATE even with a huge quality lead', () => {
    expect(conversionRateFor(1_000_000, 1)).toBeLessThanOrEqual(MAX_CONVERSION_RATE);
  });

  it('applies an optional focus multiplier (Task 2 hook)', () => {
    expect(conversionRateFor(100, 100, 1.5)).toBeCloseTo(BASE_CONVERSION * 1.5);
  });
});

describe('customersGainedFor', () => {
  it('is leads × conversion, capped by available demand', () => {
    expect(customersGainedFor(100, 0.5, 1000)).toBe(50);
    expect(customersGainedFor(100, 0.5, 20)).toBe(20); // capped
  });

  it('never goes negative even with exhausted or negative demand', () => {
    expect(customersGainedFor(100, 0.5, -50)).toBe(0);
  });
});

describe('supportCoverageFactor', () => {
  it('is 1 (no penalty) at full coverage', () => {
    expect(supportCoverageFactor(1, CUSTOMERS_PER_SUPPORT)).toBe(1);
  });

  it('is the full uncovered multiplier with zero support', () => {
    expect(supportCoverageFactor(0, 1000)).toBe(UNCOVERED_CHURN_MULTIPLIER);
  });

  it('is 1 with zero customers (nothing to cover)', () => {
    expect(supportCoverageFactor(0, 0)).toBe(1);
  });

  it('worsens smoothly as coverage thins between full and zero', () => {
    const halfCovered = supportCoverageFactor(1, CUSTOMERS_PER_SUPPORT * 2);
    expect(halfCovered).toBeGreaterThan(1);
    expect(halfCovered).toBeLessThan(UNCOVERED_CHURN_MULTIPLIER);
  });
});

describe('churnRateFor', () => {
  it('quality below the rival average measurably raises churn', () => {
    const behind = churnRateFor(10, 100, 100, 100);
    const parity = churnRateFor(100, 100, 100, 100);
    expect(behind).toBeGreaterThan(parity);
  });

  it('thin support coverage measurably raises churn independent of quality', () => {
    const wellCovered = churnRateFor(100, 100, 1000, 100);
    const uncovered = churnRateFor(100, 100, 0, 100);
    expect(uncovered).toBeGreaterThan(wellCovered);
  });

  it('matches BASE_CHURN × qualityChurnFactor × supportCoverageFactor × focus multiplier exactly', () => {
    expect(churnRateFor(50, 100, 2, 100, 1.2)).toBeCloseTo(
      BASE_CHURN * qualityChurnFactor(50, 100) * supportCoverageFactor(2, 100) * 1.2,
    );
  });
});

describe('customersChurnedFor', () => {
  it('is customers × churnRate', () => {
    expect(customersChurnedFor(1000, 0.05)).toBe(50);
  });
});

describe('churnDefectionSplit', () => {
  it('splits churned customers by CHURN_DEFECTION_RATE between rivals and the pool', () => {
    const split = churnDefectionSplit(100);
    expect(split.toRivals).toBeCloseTo(100 * CHURN_DEFECTION_RATE);
    expect(split.toPool).toBeCloseTo(100 * (1 - CHURN_DEFECTION_RATE));
    expect(split.toRivals + split.toPool).toBeCloseTo(100);
  });

  it('a majority defects to rivals, not the pool', () => {
    expect(CHURN_DEFECTION_RATE).toBeGreaterThan(0.5);
  });
});

describe('revenueFor', () => {
  it('is customers × ARPC, with an optional focus ARPC multiplier', () => {
    expect(revenueFor(1000)).toBe(1000 * ARPC);
    expect(revenueFor(1000, 1.25)).toBe(1000 * ARPC * 1.25);
  });
});

describe('marketCustomersAfterTick', () => {
  it('grows the pool at the era-scaled weekly rate', () => {
    expect(marketCustomersAfterTick(10_000, 'scrappy')).toBeCloseTo(10_000 * (1 + MARKET_GROWTH_RATE.scrappy));
    expect(marketCustomersAfterTick(10_000, 'boom')).toBeCloseTo(10_000 * (1 + MARKET_GROWTH_RATE.boom));
  });

  it('does not grow at all in Reckoning', () => {
    expect(marketCustomersAfterTick(10_000, 'reckoning')).toBe(10_000);
  });

  it('Boom grows the pool faster than Scrappy', () => {
    expect(marketCustomersAfterTick(10_000, 'boom')).toBeGreaterThan(marketCustomersAfterTick(10_000, 'scrappy'));
  });
});

describe('shareShiftFor (tanh soft cap, replacing the old flat ±1% clamp)', () => {
  it('is zero at quality parity', () => {
    expect(shareShiftFor(100, 100)).toBe(0);
  });

  it('is soft-capped by MAX_SHARE_SHIFT, never a hard flat clamp', () => {
    const big = shareShiftFor(3_000, 0);
    const bigger = shareShiftFor(15_000, 0);
    expect(big).toBeLessThan(MAX_SHARE_SHIFT);
    expect(bigger).toBeLessThan(MAX_SHARE_SHIFT);
    // tanh asymptotes toward, but never reaches, the cap.
    expect(bigger).toBeGreaterThan(big);
  });

  it('scales with the magnitude of the quality gap, not just its sign', () => {
    const smallGap = shareShiftFor(110, 100);
    const bigGap = shareShiftFor(500, 100);
    expect(bigGap).toBeGreaterThan(smallGap);
    expect(smallGap).toBeGreaterThan(0);
  });

  it('is antisymmetric: swapping sides flips the sign', () => {
    expect(shareShiftFor(200, 100)).toBeCloseTo(-shareShiftFor(100, 200));
  });
});

describe('derived market share (wired into tick)', () => {
  it('marketShare always equals customers / marketCustomers after a tick', () => {
    let s: GameState = { ...newGame(1), cash: 50_000_000 };
    for (let i = 0; i < 10; i++) {
      s = tick(s);
      expect(s.marketShare).toBeCloseTo(s.customers / s.marketCustomers);
    }
  });
});
