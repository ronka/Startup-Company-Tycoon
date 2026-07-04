import { describe, expect, it } from 'vitest';

import {
  ERA_TREND_AMPLITUDE_MULTIPLIER,
  ERA_TREND_CRASH_DEPTH_MULTIPLIER,
  trendFactorsFor,
} from '../balance';
import { createRng } from '../rng';
import { advanceTrend, initialTrend, trendPhaseChangeNewsEntry } from '../trends';
import { RngState, Trend } from '../types';

/** Repeatedly calls `advanceTrend` until the phase (or id) changes, returning the transition. */
function advanceUntilPhaseChange(
  trend: Trend,
  era: 'scrappy' | 'boom' | 'reckoning',
  rng: RngState,
): { previous: Trend; trend: Trend; rng: RngState } {
  let current = trend;
  let r = rng;
  for (let i = 0; i < 100; i++) {
    const result = advanceTrend(current, era, r);
    r = result.rng;
    if (result.trend.phase !== current.phase || result.trend.id !== current.id) {
      return { previous: current, trend: result.trend, rng: r };
    }
    current = result.trend;
  }
  throw new Error('phase never changed within 100 ticks');
}

describe('initialTrend', () => {
  it('starts quiet with a duration in [4, 8]', () => {
    const { trend } = initialTrend(createRng(1));
    expect(trend.phase).toBe('quiet');
    expect(trend.weeksInPhase).toBe(0);
    expect(trend.phaseDuration).toBeGreaterThanOrEqual(4);
    expect(trend.phaseDuration).toBeLessThanOrEqual(8);
  });
});

describe('advanceTrend phase machine', () => {
  it('advances quiet -> rising -> peak deterministically per seed', () => {
    let { trend, rng } = initialTrend(createRng(42));
    ({ trend, rng } = advanceUntilPhaseChange(trend, 'scrappy', rng));
    expect(trend.phase).toBe('rising');
    expect(trend.weeksInPhase).toBe(0);

    ({ trend, rng } = advanceUntilPhaseChange(trend, 'scrappy', rng));
    expect(trend.phase).toBe('peak');
  });

  it('is a pure function of trend state, era, and rng — same inputs, same outputs', () => {
    const trend: Trend = { id: 'ai', phase: 'rising', weeksInPhase: 2, phaseDuration: 8 };
    const rng = createRng(99);
    expect(advanceTrend(trend, 'scrappy', rng)).toEqual(advanceTrend(trend, 'scrappy', rng));
  });

  it('never repeats the same trend id back-to-back across a quiet transition', () => {
    let { trend, rng } = initialTrend(createRng(7));
    let previousWaveId = trend.id;
    for (let i = 0; i < 500; i++) {
      const before = trend;
      const advance = advanceTrend(trend, 'reckoning', rng); // high crash chance exercises both crash->quiet and peak->quiet(fade)
      rng = advance.rng;
      trend = advance.trend;
      if (before.phase !== 'quiet' && trend.phase === 'quiet') {
        expect(trend.id).not.toBe(previousWaveId);
        previousWaveId = trend.id;
      }
    }
  });

  it('resolves peak to crash or a direct fade back to quiet, never anything else', () => {
    let { trend, rng } = initialTrend(createRng(3));
    ({ trend, rng } = advanceUntilPhaseChange(trend, 'scrappy', rng)); // -> rising
    ({ trend, rng } = advanceUntilPhaseChange(trend, 'scrappy', rng)); // -> peak
    const resolved = advanceUntilPhaseChange(trend, 'scrappy', rng);
    expect(['crash', 'quiet']).toContain(resolved.trend.phase);
  });

  it("Reckoning's crash chance (~0.7) is far higher than Scrappy's (~0.3) across many seeds", () => {
    const crashRateFor = (era: 'scrappy' | 'reckoning'): number => {
      let crashes = 0;
      const trials = 150;
      for (let seed = 0; seed < trials; seed++) {
        let { trend, rng } = initialTrend(createRng(seed));
        ({ trend, rng } = advanceUntilPhaseChange(trend, era, rng)); // -> rising
        ({ trend, rng } = advanceUntilPhaseChange(trend, era, rng)); // -> peak
        const resolved = advanceUntilPhaseChange(trend, era, rng); // -> crash or quiet
        if (resolved.trend.phase === 'crash') crashes++;
      }
      return crashes / trials;
    };

    expect(crashRateFor('reckoning')).toBeGreaterThan(0.55);
    expect(crashRateFor('scrappy')).toBeLessThan(0.45);
  });
});

describe('trendPhaseChangeNewsEntry', () => {
  it('is null when neither phase nor id changed', () => {
    const trend: Trend = { id: 'ai', phase: 'rising', weeksInPhase: 3, phaseDuration: 8 };
    expect(trendPhaseChangeNewsEntry(trend, { ...trend, weeksInPhase: 4 }, 5)).toBeNull();
  });

  it('names the crashing trend on entering crash, and the id fires with kind "trend"', () => {
    const previous: Trend = { id: 'hardware', phase: 'peak', weeksInPhase: 6, phaseDuration: 6 };
    const next: Trend = { id: 'hardware', phase: 'crash', weeksInPhase: 0, phaseDuration: 3 };
    const entry = trendPhaseChangeNewsEntry(previous, next, 10);
    expect(entry?.kind).toBe('trend');
    expect(entry?.title.toLowerCase()).toContain('hardware');
  });

  it('fires a distinct entry for a fade (peak -> quiet, no crash) vs. a crash resolving (crash -> quiet)', () => {
    const faded = trendPhaseChangeNewsEntry(
      { id: 'crypto', phase: 'peak', weeksInPhase: 5, phaseDuration: 5 },
      { id: 'ai', phase: 'quiet', weeksInPhase: 0, phaseDuration: 6 },
      12,
    );
    const crashResolved = trendPhaseChangeNewsEntry(
      { id: 'crypto', phase: 'crash', weeksInPhase: 3, phaseDuration: 3 },
      { id: 'ai', phase: 'quiet', weeksInPhase: 0, phaseDuration: 6 },
      12,
    );
    expect(faded?.title).not.toBe(crashResolved?.title);
  });
});

describe('trendFactorsFor', () => {
  const AI_RISING: Trend = { id: 'ai', phase: 'rising', weeksInPhase: 1, phaseDuration: 8 };
  const AI_PEAK: Trend = { id: 'ai', phase: 'peak', weeksInPhase: 1, phaseDuration: 6 };
  const AI_CRASH: Trend = { id: 'ai', phase: 'crash', weeksInPhase: 1, phaseDuration: 3 };
  const AI_QUIET: Trend = { id: 'ai', phase: 'quiet', weeksInPhase: 1, phaseDuration: 6 };

  it('is neutral for everyone during quiet, regardless of focus', () => {
    for (const focus of ['core', 'ai', 'hardware', 'hype'] as const) {
      expect(trendFactorsFor(focus, AI_QUIET, 'scrappy')).toEqual({ demand: 1, hype: 1, churn: 1 });
    }
  });

  it('boosts demand and hype for a fully aligned focus during rising, more so at peak', () => {
    const rising = trendFactorsFor('ai', AI_RISING, 'scrappy');
    const peak = trendFactorsFor('ai', AI_PEAK, 'scrappy');
    expect(rising.demand).toBeGreaterThan(1);
    expect(rising.hype).toBeGreaterThan(1);
    expect(rising.churn).toBe(1);
    expect(peak.demand).toBeGreaterThan(rising.demand);
    expect(peak.hype).toBeGreaterThan(rising.hype);
  });

  it('is neutral for an unaligned, non-hype, non-core focus (hardware focus vs. an AI wave)', () => {
    expect(trendFactorsFor('hardware', AI_RISING, 'scrappy')).toEqual({ demand: 1, hype: 1, churn: 1 });
    expect(trendFactorsFor('hardware', AI_PEAK, 'scrappy')).toEqual({ demand: 1, hype: 1, churn: 1 });
  });

  it('collapses demand/hype and spikes churn for the aligned focus during crash', () => {
    const crash = trendFactorsFor('ai', AI_CRASH, 'scrappy');
    expect(crash.demand).toBeLessThan(1);
    expect(crash.hype).toBeLessThan(1);
    expect(crash.churn).toBeGreaterThan(1);
  });

  it('gives core a flight-to-quality demand bonus only during a crash, with neutral hype/churn', () => {
    expect(trendFactorsFor('core', AI_CRASH, 'scrappy')).toEqual({ demand: expect.any(Number), hype: 1, churn: 1 });
    expect(trendFactorsFor('core', AI_CRASH, 'scrappy').demand).toBeGreaterThan(1);
    expect(trendFactorsFor('core', AI_RISING, 'scrappy')).toEqual({ demand: 1, hype: 1, churn: 1 });
    expect(trendFactorsFor('core', AI_PEAK, 'scrappy')).toEqual({ demand: 1, hype: 1, churn: 1 });
  });

  it('applies to core during ANY trend crash, not just one specific id', () => {
    const hardwareCrash: Trend = { id: 'hardware', phase: 'crash', weeksInPhase: 1, phaseDuration: 3 };
    const cryptoCrash: Trend = { id: 'crypto', phase: 'crash', weeksInPhase: 1, phaseDuration: 3 };
    expect(trendFactorsFor('core', hardwareCrash, 'scrappy').demand).toBeGreaterThan(1);
    expect(trendFactorsFor('core', cryptoCrash, 'scrappy').demand).toBeGreaterThan(1);
  });

  it('rides any live trend at half strength for the hype focus (including crypto, which no focus tag matches)', () => {
    const cryptoRising: Trend = { id: 'crypto', phase: 'rising', weeksInPhase: 1, phaseDuration: 8 };
    const hypeFactors = trendFactorsFor('hype', cryptoRising, 'scrappy');
    const aiFullFactors = trendFactorsFor('ai', AI_RISING, 'scrappy');
    expect(hypeFactors.demand).toBeGreaterThan(1);
    expect(hypeFactors.demand).toBeLessThan(aiFullFactors.demand);
  });

  it('takes a churn/hype hit at half strength when its ridden trend crashes', () => {
    const cryptoCrash: Trend = { id: 'crypto', phase: 'crash', weeksInPhase: 1, phaseDuration: 3 };
    const hypeCrash = trendFactorsFor('hype', cryptoCrash, 'scrappy');
    const aiCrash = trendFactorsFor('ai', AI_CRASH, 'scrappy');
    expect(hypeCrash.churn).toBeGreaterThan(1);
    expect(hypeCrash.churn).toBeLessThan(aiCrash.churn);
  });

  it('Boom widens the aligned rising/peak amplitude relative to Scrappy', () => {
    expect(ERA_TREND_AMPLITUDE_MULTIPLIER.boom).toBeGreaterThan(ERA_TREND_AMPLITUDE_MULTIPLIER.scrappy);
    const scrappyBoost = trendFactorsFor('ai', AI_PEAK, 'scrappy').demand - 1;
    const boomBoost = trendFactorsFor('ai', AI_PEAK, 'boom').demand - 1;
    expect(boomBoost).toBeGreaterThan(scrappyBoost);
  });

  it('Reckoning deepens the aligned crash penalty relative to Scrappy', () => {
    expect(ERA_TREND_CRASH_DEPTH_MULTIPLIER.reckoning).toBeGreaterThan(ERA_TREND_CRASH_DEPTH_MULTIPLIER.scrappy);
    const scrappyCrash = trendFactorsFor('ai', AI_CRASH, 'scrappy');
    const reckoningCrash = trendFactorsFor('ai', AI_CRASH, 'reckoning');
    expect(reckoningCrash.churn).toBeGreaterThan(scrappyCrash.churn);
    expect(reckoningCrash.demand).toBeLessThan(scrappyCrash.demand);
  });
});
