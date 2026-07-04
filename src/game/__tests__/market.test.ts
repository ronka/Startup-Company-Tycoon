import { describe, expect, it } from 'vitest';

import { trendFactorsFor } from '../balance';
import { newGame, tick } from '../engine';
import {
  applyChurnDefectionToRivals,
  applyRivalDynamics,
  focusForTrend,
  generateRivals,
  MONOPOLY_SHARE_THRESHOLD,
  NEW_ENTRANT_STARTING_SHARE,
  RIVAL_DEATH_SHARE_THRESHOLD,
  RIVAL_DESPERATION_SHARE_THRESHOLD,
  rivalQualityAfterTick,
  rivalTrendShareDelta,
} from '../rivals';
import { createRng } from '../rng';
import { GameState, Trend } from '../types';

const MARKET_CUSTOMERS = 10_000;

/** Quiet phase is neutral for every focus (see `trendFactorsFor`), so passing this keeps
 *  pre-Task-4 numeric assertions about share/quality shift untouched. */
const NEUTRAL_TREND: Trend = { id: 'ai', phase: 'quiet', weeksInPhase: 0, phaseDuration: 6 };

describe('generateRivals', () => {
  it('produces exactly 2 rivals with distinct names and distinct focuses, deterministic per seed', () => {
    const a = generateRivals(createRng(1));
    const b = generateRivals(createRng(1));
    expect(a.rivals).toHaveLength(2);
    expect(a.rivals[0].name).not.toBe(a.rivals[1].name);
    expect(a.rivals[0].focus).not.toBe(a.rivals[1].focus);
    expect(a.rivals).toEqual(b.rivals);
  });
});

describe('rivalQualityAfterTick', () => {
  it('grows deterministically per seed', () => {
    const [qa] = rivalQualityAfterTick(100, createRng(5));
    const [qb] = rivalQualityAfterTick(100, createRng(5));
    expect(qa).toBe(qb);
    expect(qa).toBeGreaterThan(100); // baseline growth is always positive on top
  });
});

describe('market share conservation', () => {
  it('you + both rivals never exceed 100% over many ticks', () => {
    let s: GameState = { ...newGame(3), cash: 50_000_000 };
    for (let i = 0; i < 40; i++) {
      s = tick(s);
      const total = s.marketShare + s.rivals[0].marketShare + s.rivals[1].marketShare;
      expect(total).toBeLessThanOrEqual(1.0001); // floating point slack
      expect(s.marketShare).toBeGreaterThanOrEqual(0);
      expect(s.rivals[0].marketShare).toBeGreaterThanOrEqual(0);
      expect(s.rivals[1].marketShare).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('quality gap drives share', () => {
  it('a dominant product retains/gains more share than an outclassed one over 20 ticks', () => {
    const base: GameState = { ...newGame(1), cash: 50_000_000 };

    // Dominant product: sky-high starting quality, rivals frozen weak.
    let dominant: GameState = {
      ...base,
      productQuality: 100_000,
      rivals: base.rivals.map((r) => ({ ...r, productQuality: 1 })),
    };
    // Outclassed product: near-zero quality, rivals sky-high.
    let outclassed: GameState = {
      ...base,
      productQuality: 1,
      rivals: base.rivals.map((r) => ({ ...r, productQuality: 100_000 })),
    };
    for (let i = 0; i < 20; i++) {
      dominant = tick(dominant);
      outclassed = tick(outclassed);
    }
    expect(dominant.marketShare).toBeGreaterThan(outclassed.marketShare);
    expect(dominant.customers).toBeGreaterThan(outclassed.customers);
  });

  it('never lets total share sit at or above 100% pre-exit: monopoly forces a fresh entrant', () => {
    // Player is crushing both rivals; without the monopoly guardrail this
    // would run away toward 100% share over enough ticks. Support is scaled
    // to fully cover the customer base so churn doesn't crash share below the
    // monopoly threshold before the guardrail gets a chance to fire.
    let s: GameState = {
      ...newGame(9),
      cash: 50_000_000,
      productQuality: 500_000,
      customers: 9_000,
      marketCustomers: MARKET_CUSTOMERS,
      headcount: { ...newGame(9).headcount, support: 50 },
      pendingHeadcount: { ...newGame(9).pendingHeadcount, support: 50 },
      rivals: [
        { name: 'Vertex Labs', productQuality: 1, marketShare: 0.06, focus: 'core' },
        { name: 'Nimbus', productQuality: 1, marketShare: 0.04, focus: 'hardware' },
      ],
    };
    for (let i = 0; i < 10; i++) {
      s = tick(s);
      expect(s.marketShare).toBeLessThan(1);
    }
    // The forced entrant should have shown up in the news feed at least once.
    expect(s.newsLog.some((e) => e.title.includes('enters the market'))).toBe(true);
  });
});

describe('applyChurnDefectionToRivals', () => {
  const rivals: GameState['rivals'] = [
    { name: 'Vertex Labs', productQuality: 100, marketShare: 0.3, focus: 'core' },
    { name: 'Nimbus', productQuality: 100, marketShare: 0.1, focus: 'hardware' },
  ];

  it('splits defectors proportionally to each rival\'s current share', () => {
    const result = applyChurnDefectionToRivals(rivals, 400, MARKET_CUSTOMERS);
    // Vertex holds 3/4 of the combined rival share, so it gets 3/4 of the defectors.
    expect(result[0].marketShare).toBeCloseTo(0.3 + (400 * 0.75) / MARKET_CUSTOMERS);
    expect(result[1].marketShare).toBeCloseTo(0.1 + (400 * 0.25) / MARKET_CUSTOMERS);
  });

  it('splits evenly when both rivals are at zero share', () => {
    const zeroed = rivals.map((r) => ({ ...r, marketShare: 0 }));
    const result = applyChurnDefectionToRivals(zeroed, 200, MARKET_CUSTOMERS);
    expect(result[0].marketShare).toBeCloseTo(result[1].marketShare);
  });

  it('is a no-op with zero defectors', () => {
    expect(applyChurnDefectionToRivals(rivals, 0, MARKET_CUSTOMERS)).toEqual(rivals);
  });
});

describe('applyRivalDynamics (Task 11: rivals that fight back)', () => {
  const baseRivals: GameState['rivals'] = [
    { name: 'Vertex Labs', productQuality: 100, marketShare: 0.5, focus: 'core' },
    { name: 'Nimbus', productQuality: 100, marketShare: 0.5, focus: 'hardware' },
  ];

  it('is deterministic: same inputs produce the same output', () => {
    const a = applyRivalDynamics(baseRivals, 1_000, MARKET_CUSTOMERS, 200, 'scrappy', NEUTRAL_TREND, createRng(42));
    const b = applyRivalDynamics(baseRivals, 1_000, MARKET_CUSTOMERS, 200, 'scrappy', NEUTRAL_TREND, createRng(42));
    expect(a).toEqual(b);
  });

  it('never rolls or pivots a rival above the desperation threshold', () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = applyRivalDynamics(baseRivals, 1_000, MARKET_CUSTOMERS, 200, 'scrappy', NEUTRAL_TREND, createRng(seed));
      expect(result.beats).toHaveLength(0);
      expect(result.rivals).toEqual(baseRivals);
    }
  });

  it('a share-starved rival can pivot to a quality surge and switch focus toward the hot trend', () => {
    const starved: GameState['rivals'] = [
      { name: 'Vertex Labs', productQuality: 100, marketShare: RIVAL_DESPERATION_SHARE_THRESHOLD - 0.01, focus: 'core' },
      { name: 'Nimbus', productQuality: 100, marketShare: 0.5, focus: 'hardware' },
    ];
    let pivoted = false;
    for (let seed = 0; seed < 200 && !pivoted; seed++) {
      const result = applyRivalDynamics(starved, 1_000, MARKET_CUSTOMERS, 200, 'scrappy', NEUTRAL_TREND, createRng(seed));
      if (result.beats.some((b) => b.title.includes('desperate pivot'))) {
        pivoted = true;
        expect(result.rivals[0].productQuality).toBeGreaterThan(100);
        expect(result.rivals[0].focus).toBe(focusForTrend(NEUTRAL_TREND));
        expect(result.rivals[1]).toEqual(starved[1]); // untouched
      }
    }
    expect(pivoted).toBe(true);
  });

  it('a weak rival can collapse in Reckoning and is replaced, inheriting its freed share and spawning trend-aligned', () => {
    const dying: GameState['rivals'] = [
      { name: 'Vertex Labs', productQuality: 10, marketShare: RIVAL_DEATH_SHARE_THRESHOLD - 0.01, focus: 'core' },
      { name: 'Nimbus', productQuality: 100, marketShare: 0.5, focus: 'hardware' },
    ];
    let collapsed = false;
    for (let seed = 0; seed < 300 && !collapsed; seed++) {
      const result = applyRivalDynamics(dying, 1_000, MARKET_CUSTOMERS, 200, 'reckoning', NEUTRAL_TREND, createRng(seed));
      if (result.beats.some((b) => b.title.includes('shuts down'))) {
        collapsed = true;
        expect(result.rivals[0].name).not.toBe('Vertex Labs');
        expect(result.rivals[0].name).not.toBe('Nimbus'); // never reuses the survivor's name
        expect(result.rivals[0].marketShare).toBe(dying[0].marketShare); // freed share inherited
        expect(result.rivals[0].focus).toBe(focusForTrend(NEUTRAL_TREND));
        expect(result.rivals[1]).toEqual(dying[1]); // survivor untouched
      }
    }
    expect(collapsed).toBe(true);
  });

  it('never collapses a rival outside Reckoning, no matter how weak', () => {
    const dying: GameState['rivals'] = [
      { name: 'Vertex Labs', productQuality: 10, marketShare: 0.001, focus: 'core' },
      { name: 'Nimbus', productQuality: 100, marketShare: 0.5, focus: 'hardware' },
    ];
    for (const era of ['scrappy', 'boom'] as const) {
      for (let seed = 0; seed < 100; seed++) {
        const result = applyRivalDynamics(dying, 1_000, MARKET_CUSTOMERS, 200, era, NEUTRAL_TREND, createRng(seed));
        expect(result.beats.some((b) => b.title.includes('shuts down'))).toBe(false);
      }
    }
  });

  it('forces a new entrant the moment player share hits the monopoly threshold, carving it back down', () => {
    const playerCustomers = MONOPOLY_SHARE_THRESHOLD * MARKET_CUSTOMERS;
    const result = applyRivalDynamics(baseRivals, playerCustomers, MARKET_CUSTOMERS, 200, 'scrappy', NEUTRAL_TREND, createRng(1));
    expect(result.customers / MARKET_CUSTOMERS).toBeLessThan(MONOPOLY_SHARE_THRESHOLD);
    expect(result.beats.some((b) => b.title.includes('enters the market'))).toBe(true);
    const entrant = result.rivals.find((r) => !baseRivals.some((br) => br.name === r.name));
    expect(entrant).toBeDefined();
    expect(entrant!.marketShare).toBeGreaterThanOrEqual(NEW_ENTRANT_STARTING_SHARE);
    expect(entrant!.focus).toBe(focusForTrend(NEUTRAL_TREND));
  });

  it('does not force an entrant below the monopoly threshold', () => {
    const playerCustomers = (MONOPOLY_SHARE_THRESHOLD - 0.1) * MARKET_CUSTOMERS;
    const result = applyRivalDynamics(baseRivals, playerCustomers, MARKET_CUSTOMERS, 200, 'scrappy', NEUTRAL_TREND, createRng(1));
    expect(result.beats.some((b) => b.title.includes('enters the market'))).toBe(false);
  });
});

describe('rival trend coupling (Task 4: rivals as strategic actors)', () => {
  const RISING_AI: Trend = { id: 'ai', phase: 'rising', weeksInPhase: 1, phaseDuration: 8 };
  const PEAK_AI: Trend = { id: 'ai', phase: 'peak', weeksInPhase: 1, phaseDuration: 6 };
  const CRASH_AI: Trend = { id: 'ai', phase: 'crash', weeksInPhase: 1, phaseDuration: 3 };

  it('rivalTrendShareDelta is positive when demand is boosted, negative when it collapses, zero when neutral', () => {
    expect(rivalTrendShareDelta({ demand: 1.3, hype: 1, churn: 1 })).toBeGreaterThan(0);
    expect(rivalTrendShareDelta({ demand: 0.6, hype: 1, churn: 1 })).toBeLessThan(0);
    expect(rivalTrendShareDelta({ demand: 1, hype: 1, churn: 1 })).toBe(0);
  });

  it("an aligned rival's quality visibly surges during its wave and its growth slows on crash, vs. an unaligned sibling", () => {
    let state: GameState = {
      ...newGame(1),
      cash: 50_000_000,
      trend: PEAK_AI,
      rivals: [
        { name: 'Vertex Labs', productQuality: 100, marketShare: 0.3, focus: 'ai' }, // aligned
        { name: 'Nimbus', productQuality: 100, marketShare: 0.3, focus: 'hardware' }, // unaligned
      ],
    };
    const afterPeak = tick(state);
    const alignedGrowthAtPeak = afterPeak.rivals[0].productQuality - state.rivals[0].productQuality;
    const unalignedGrowthAtPeak = afterPeak.rivals[1].productQuality - state.rivals[1].productQuality;
    expect(alignedGrowthAtPeak).toBeGreaterThan(unalignedGrowthAtPeak);

    state = { ...state, trend: CRASH_AI };
    const afterCrash = tick(state);
    const alignedGrowthAtCrash = afterCrash.rivals[0].productQuality - state.rivals[0].productQuality;
    expect(alignedGrowthAtCrash).toBeLessThan(alignedGrowthAtPeak);
  });

  it("an aligned rival's share erodes on crash — positioning alone matters, without the player changing anything", () => {
    // Player stays on its default 'core' focus throughout — this isolates the
    // trend's effect on the rival from anything the player does.
    const state: GameState = {
      ...newGame(1),
      cash: 50_000_000,
      trend: CRASH_AI,
      rivals: [
        { name: 'Vertex Labs', productQuality: 100, marketShare: 0.3, focus: 'ai' }, // crashing
        { name: 'Nimbus', productQuality: 100, marketShare: 0.3, focus: 'core' }, // unaffected by the crash
      ],
    };
    expect(state.focus).toBe('core');
    const after = tick(state);
    expect(after.rivals[0].marketShare).toBeLessThan(state.rivals[0].marketShare);
  });

  it('rising demand for an aligned focus is smaller than peak demand (trendFactorsFor sanity used by rival coupling)', () => {
    expect(trendFactorsFor('ai', RISING_AI, 'scrappy').demand).toBeLessThan(
      trendFactorsFor('ai', PEAK_AI, 'scrappy').demand,
    );
  });
});

describe('support headcount retains customers (replaces the old share-shift dampening)', () => {
  it('more support reduces churn, retaining more customers after a tick', () => {
    const base: GameState = {
      ...newGame(2),
      cash: 50_000_000,
      customers: 1_000,
      productQuality: 1,
      rivals: [
        { name: 'A', productQuality: 100_000, marketShare: 0.2, focus: 'core' },
        { name: 'B', productQuality: 100_000, marketShare: 0.2, focus: 'hardware' },
      ],
    };
    const noSupport: GameState = {
      ...base,
      headcount: { ...base.headcount, support: 0 },
      pendingHeadcount: { ...base.pendingHeadcount, support: 0 },
    };
    const withSupport: GameState = {
      ...base,
      headcount: { ...base.headcount, support: 20 },
      pendingHeadcount: { ...base.pendingHeadcount, support: 20 },
    };

    const afterNoSupport = tick(noSupport);
    const afterWithSupport = tick(withSupport);

    expect(afterWithSupport.customers).toBeGreaterThan(afterNoSupport.customers);
  });
});
