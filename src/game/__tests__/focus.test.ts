import { describe, expect, it } from 'vitest';

import {
  FOCUS_PROFILES,
  FOCUS_TRANSITION_MULTIPLIER,
  FOCUS_TRANSITION_WEEKS,
  HARDWARE_COGS_PER_CUSTOMER,
  HARDWARE_FIXED_BURN_MULTIPLIER,
  HYPE_FOCUS_BEHIND_CHURN_MULTIPLIER,
  STARTING_HEADCOUNT,
  focusChurnMultiplierFor,
  focusCogsFor,
  focusFixedBurnMultiplier,
  focusTransitionMultiplier,
  isInFocusTransition,
  qualityAfterTick,
  weeklyBurnFor,
  weeklyStatsFor,
} from '../balance';
import { newGame, reduce, tick } from '../engine';
import { GameState } from '../types';

describe('SET_FOCUS', () => {
  it('switches focus, stamps the week, and emits a news entry', () => {
    let s: GameState = { ...newGame(1), week: 5 };
    s = reduce(s, { type: 'SET_FOCUS', focus: 'hardware' });
    expect(s.focus).toBe('hardware');
    expect(s.focusChangedWeek).toBe(5);
    expect(s.newsLog[0]).toMatchObject({ week: 5, title: expect.stringContaining('hardware') });
  });

  it('is a no-op that does not reset the transition drag when re-setting the same focus', () => {
    let s: GameState = { ...newGame(1), week: 5 };
    s = reduce(s, { type: 'SET_FOCUS', focus: 'hardware' });
    const afterFirstSwitch = s;
    s = { ...s, week: 8 };
    s = reduce(s, { type: 'SET_FOCUS', focus: 'hardware' });
    expect(s.focusChangedWeek).toBe(afterFirstSwitch.focusChangedWeek);
    expect(s.newsLog).toEqual(afterFirstSwitch.newsLog);
  });

  it('starts on core with no transition drag at game start', () => {
    const s = newGame(1);
    expect(s.focus).toBe('core');
    expect(s.focusChangedWeek).toBe(0);
  });
});

describe('focus transition drag', () => {
  it('applies for exactly FOCUS_TRANSITION_WEEKS, then lifts', () => {
    for (let weeksSince = 0; weeksSince < FOCUS_TRANSITION_WEEKS; weeksSince++) {
      expect(isInFocusTransition(weeksSince, 0)).toBe(true);
      expect(focusTransitionMultiplier(weeksSince, 0)).toBe(FOCUS_TRANSITION_MULTIPLIER);
    }
    expect(isInFocusTransition(FOCUS_TRANSITION_WEEKS, 0)).toBe(false);
    expect(focusTransitionMultiplier(FOCUS_TRANSITION_WEEKS, 0)).toBe(1);
  });

  it('measurably slows quality growth while transitioning, back to normal once settled', () => {
    let mid: GameState = { ...newGame(2), week: 0, focus: 'core', focusChangedWeek: 0 };
    mid = reduce(mid, { type: 'SET_FOCUS', focus: 'hardware' }); // focusChangedWeek stamped at week 0
    const duringTransition = tick(mid); // week 1: still within FOCUS_TRANSITION_WEEKS of week 0

    let settled: GameState = { ...newGame(2), focus: 'hardware', focusChangedWeek: -1000 };
    const afterSettled = tick(settled);

    // Same starting quality (0) and dev headcount, only the drag differs.
    expect(afterSettled.productQuality).toBeGreaterThan(duringTransition.productQuality);
  });

  it('measurably dents conversion (fewer customers gained) while transitioning', () => {
    let mid: GameState = { ...newGame(3), cash: 5_000_000, week: 0, customers: 1000 };
    mid = reduce(mid, { type: 'SET_FOCUS', focus: 'hardware' });
    const duringTransition = tick(mid);

    const settled: GameState = { ...newGame(3), cash: 5_000_000, customers: 1000, focus: 'hardware', focusChangedWeek: -1000 };
    const afterSettled = tick(settled);

    expect(afterSettled.customers).toBeGreaterThan(duringTransition.customers);
  });

  it('rapid flip-flopping is strictly worse than committing: constant drag beats never settling', () => {
    // Flip-flopper: switches focus every single week, so it's permanently
    // inside the transition window and never gets the settled multiplier.
    let flopper: GameState = { ...newGame(4), cash: 5_000_000 };
    let committed: GameState = { ...newGame(4), cash: 5_000_000 };
    committed = reduce(committed, { type: 'SET_FOCUS', focus: 'hardware' });

    const focuses: Array<'hardware' | 'ai'> = ['hardware', 'ai'];
    for (let i = 0; i < 10; i++) {
      flopper = reduce(flopper, { type: 'SET_FOCUS', focus: focuses[i % 2] });
      flopper = tick(flopper);
      committed = tick(committed);
    }

    expect(committed.productQuality).toBeGreaterThan(flopper.productQuality);
    expect(committed.customers).toBeGreaterThan(flopper.customers);
  });
});

describe('focus profile multipliers land in the right formulas', () => {
  it('quality growth multiplier: core grows quality fastest, hype slowest, once settled (no transition drag)', () => {
    const grow = (focus: 'core' | 'ai' | 'hardware' | 'hype') =>
      qualityAfterTick(1000, STARTING_HEADCOUNT.devs, 70, FOCUS_PROFILES[focus].qualityGrowthMultiplier);

    expect(grow('core')).toBeGreaterThan(grow('ai'));
    expect(grow('ai')).toBeGreaterThan(grow('hardware'));
    expect(grow('hardware')).toBeGreaterThan(grow('hype'));
  });

  it('ARPC multiplier: hardware revenue per customer is 1.6x, via weeklyStatsFor', () => {
    const base = { headcount: STARTING_HEADCOUNT, cLevels: newGame(1).cLevels, hype: 1, customers: 1000, cash: 0, era: 'scrappy' as const, moraleLeverActive: false };
    const core = weeklyStatsFor({ ...base, focus: 'core' });
    const hardware = weeklyStatsFor({ ...base, focus: 'hardware' });
    expect(hardware.revenue).toBeCloseTo(core.revenue * FOCUS_PROFILES.hardware.arpcMultiplier);
  });

  it('churn multiplier: each profile applies its baseline exactly at quality parity or above (hype has no penalty when not behind)', () => {
    expect(focusChurnMultiplierFor('core', 100, 100)).toBe(FOCUS_PROFILES.core.churnMultiplier);
    expect(focusChurnMultiplierFor('ai', 100, 100)).toBe(FOCUS_PROFILES.ai.churnMultiplier);
    expect(focusChurnMultiplierFor('hardware', 100, 100)).toBe(FOCUS_PROFILES.hardware.churnMultiplier);
    expect(focusChurnMultiplierFor('hype', 200, 100)).toBe(FOCUS_PROFILES.hype.churnMultiplier);
  });

  it("hype focus's conditional churn penalty only applies while quality trails the rival average", () => {
    const ahead = focusChurnMultiplierFor('hype', 200, 100);
    const behind = focusChurnMultiplierFor('hype', 50, 100);
    expect(behind).toBeCloseTo(FOCUS_PROFILES.hype.churnMultiplier * HYPE_FOCUS_BEHIND_CHURN_MULTIPLIER);
    expect(ahead).toBeLessThan(behind);
  });

  it('hardware burn: fixed-burn multiplier and per-customer COGS both land', () => {
    expect(focusFixedBurnMultiplier('hardware')).toBe(HARDWARE_FIXED_BURN_MULTIPLIER);
    expect(focusFixedBurnMultiplier('core')).toBe(1);
    expect(focusCogsFor('hardware', 1000)).toBe(1000 * HARDWARE_COGS_PER_CUSTOMER);
    expect(focusCogsFor('core', 1000)).toBe(0);

    const coreBurn = weeklyBurnFor(STARTING_HEADCOUNT, {
      fixedBurnMultiplier: focusFixedBurnMultiplier('core'),
      variableCost: focusCogsFor('core', 1000),
    });
    const hardwareBurn = weeklyBurnFor(STARTING_HEADCOUNT, {
      fixedBurnMultiplier: focusFixedBurnMultiplier('hardware'),
      variableCost: focusCogsFor('hardware', 1000),
    });
    expect(hardwareBurn).toBeGreaterThan(coreBurn);
  });

  it('hype gain multiplier values are wired per profile (ai amplifies, core dampens)', () => {
    expect(FOCUS_PROFILES.ai.hypeGainMultiplier).toBeGreaterThan(1);
    expect(FOCUS_PROFILES.core.hypeGainMultiplier).toBeLessThan(1);
  });
});

describe('Sim-equivalent: core vs hype quality/churn, hardware vs core revenue/burn per customer', () => {
  it('a core-focused run ends with higher quality and a lower effective churn rate than an equivalent hype-focused run', () => {
    let core: GameState = { ...newGame(5), cash: 50_000_000, focus: 'core', focusChangedWeek: -1000 };
    let hype: GameState = { ...newGame(5), cash: 50_000_000, focus: 'hype', focusChangedWeek: -1000 };
    for (let i = 0; i < 15; i++) {
      core = tick(core);
      hype = tick(hype);
    }
    expect(core.productQuality).toBeGreaterThan(hype.productQuality);
    // Compare the churn multiplier each ends up facing (quality-gated, plus
    // hype's conditional penalty) rather than raw customer counts, which are
    // also driven by hype's demand-side lead boost and get noisy at this scale.
    const rivalAvg = (r: GameState) => (r.rivals[0].productQuality + r.rivals[1].productQuality) / 2;
    const coreChurnMult = focusChurnMultiplierFor('core', core.productQuality, rivalAvg(core));
    const hypeChurnMult = focusChurnMultiplierFor('hype', hype.productQuality, rivalAvg(hype));
    expect(coreChurnMult).toBeLessThan(hypeChurnMult);
  });

  it('hardware ends with higher revenue per customer and higher burn than core, at the same customer count', () => {
    const shared = { customers: 2000, headcount: STARTING_HEADCOUNT, cLevels: newGame(6).cLevels, hype: 1, cash: 0, era: 'scrappy' as const, moraleLeverActive: false };
    const core = weeklyStatsFor({ ...shared, focus: 'core' });
    const hardware = weeklyStatsFor({ ...shared, focus: 'hardware' });
    expect(hardware.revenue / 2000).toBeGreaterThan(core.revenue / 2000);
    expect(hardware.burn).toBeGreaterThan(core.burn);
  });
});
