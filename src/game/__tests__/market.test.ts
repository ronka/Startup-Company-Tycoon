import { describe, expect, it } from 'vitest';

import { newGame, tick } from '../engine';
import {
  applyRivalDynamics,
  generateRivals,
  MONOPOLY_SHARE_THRESHOLD,
  NEW_ENTRANT_STARTING_SHARE,
  RIVAL_DEATH_SHARE_THRESHOLD,
  RIVAL_DESPERATION_SHARE_THRESHOLD,
  rivalQualityAfterTick,
} from '../rivals';
import { createRng } from '../rng';
import { GameState } from '../types';

describe('generateRivals', () => {
  it('produces exactly 2 rivals with distinct names, deterministic per seed', () => {
    const a = generateRivals(createRng(1));
    const b = generateRivals(createRng(1));
    expect(a.rivals).toHaveLength(2);
    expect(a.rivals[0].name).not.toBe(a.rivals[1].name);
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
  it('higher relative quality gains share over 20 ticks; lower loses it', () => {
    const base: GameState = { ...newGame(1), cash: 50_000_000 };

    // Dominant product: sky-high starting quality, rivals frozen weak.
    let dominant: GameState = {
      ...base,
      productQuality: 100_000,
      rivals: base.rivals.map((r) => ({ ...r, productQuality: 1 })),
    };
    for (let i = 0; i < 20; i++) dominant = tick(dominant);
    expect(dominant.marketShare).toBeGreaterThan(base.marketShare);

    // Outclassed product: near-zero quality, rivals sky-high.
    let outclassed: GameState = {
      ...base,
      productQuality: 1,
      rivals: base.rivals.map((r) => ({ ...r, productQuality: 100_000 })),
    };
    for (let i = 0; i < 20; i++) outclassed = tick(outclassed);
    expect(outclassed.marketShare).toBeLessThan(base.marketShare);
  });

  it('never lets total share sit at or above 100% pre-exit: monopoly forces a fresh entrant', () => {
    // Player is crushing both rivals; without the monopoly guardrail this
    // would run away toward 100% share over enough ticks.
    let s: GameState = {
      ...newGame(9),
      cash: 50_000_000,
      productQuality: 500_000,
      marketShare: 0.9,
      rivals: [
        { name: 'Vertex Labs', productQuality: 1, marketShare: 0.06 },
        { name: 'Nimbus', productQuality: 1, marketShare: 0.04 },
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

describe('applyRivalDynamics (Task 11: rivals that fight back)', () => {
  const baseRivals = [
    { name: 'Vertex Labs', productQuality: 100, marketShare: 0.5 },
    { name: 'Nimbus', productQuality: 100, marketShare: 0.5 },
  ];

  it('is deterministic: same inputs produce the same output', () => {
    const a = applyRivalDynamics(baseRivals, 0.1, 200, 'scrappy', createRng(42));
    const b = applyRivalDynamics(baseRivals, 0.1, 200, 'scrappy', createRng(42));
    expect(a).toEqual(b);
  });

  it('never rolls or pivots a rival above the desperation threshold', () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = applyRivalDynamics(baseRivals, 0.1, 200, 'scrappy', createRng(seed));
      expect(result.beats).toHaveLength(0);
      expect(result.rivals).toEqual(baseRivals);
    }
  });

  it('a share-starved rival can pivot to a quality surge', () => {
    const starved = [
      { name: 'Vertex Labs', productQuality: 100, marketShare: RIVAL_DESPERATION_SHARE_THRESHOLD - 0.01 },
      { name: 'Nimbus', productQuality: 100, marketShare: 0.5 },
    ];
    let pivoted = false;
    for (let seed = 0; seed < 200 && !pivoted; seed++) {
      const result = applyRivalDynamics(starved, 0.1, 200, 'scrappy', createRng(seed));
      if (result.beats.some((b) => b.title.includes('desperate pivot'))) {
        pivoted = true;
        expect(result.rivals[0].productQuality).toBeGreaterThan(100);
        expect(result.rivals[1]).toEqual(starved[1]); // untouched
      }
    }
    expect(pivoted).toBe(true);
  });

  it('a weak rival can collapse in Reckoning and is replaced, inheriting its freed share', () => {
    const dying = [
      { name: 'Vertex Labs', productQuality: 10, marketShare: RIVAL_DEATH_SHARE_THRESHOLD - 0.01 },
      { name: 'Nimbus', productQuality: 100, marketShare: 0.5 },
    ];
    let collapsed = false;
    for (let seed = 0; seed < 300 && !collapsed; seed++) {
      const result = applyRivalDynamics(dying, 0.1, 200, 'reckoning', createRng(seed));
      if (result.beats.some((b) => b.title.includes('shuts down'))) {
        collapsed = true;
        expect(result.rivals[0].name).not.toBe('Vertex Labs');
        expect(result.rivals[0].name).not.toBe('Nimbus'); // never reuses the survivor's name
        expect(result.rivals[0].marketShare).toBe(dying[0].marketShare); // freed share inherited
        expect(result.rivals[1]).toEqual(dying[1]); // survivor untouched
      }
    }
    expect(collapsed).toBe(true);
  });

  it('never collapses a rival outside Reckoning, no matter how weak', () => {
    const dying = [
      { name: 'Vertex Labs', productQuality: 10, marketShare: 0.001 },
      { name: 'Nimbus', productQuality: 100, marketShare: 0.5 },
    ];
    for (const era of ['scrappy', 'boom'] as const) {
      for (let seed = 0; seed < 100; seed++) {
        const result = applyRivalDynamics(dying, 0.1, 200, era, createRng(seed));
        expect(result.beats.some((b) => b.title.includes('shuts down'))).toBe(false);
      }
    }
  });

  it('forces a new entrant the moment player share hits the monopoly threshold, carving it back down', () => {
    const result = applyRivalDynamics(baseRivals, MONOPOLY_SHARE_THRESHOLD, 200, 'scrappy', createRng(1));
    expect(result.marketShare).toBeLessThan(MONOPOLY_SHARE_THRESHOLD);
    expect(result.beats.some((b) => b.title.includes('enters the market'))).toBe(true);
    const entrant = result.rivals.find((r) => !baseRivals.some((br) => br.name === r.name));
    expect(entrant).toBeDefined();
    expect(entrant!.marketShare).toBeGreaterThanOrEqual(NEW_ENTRANT_STARTING_SHARE);
  });

  it('does not force an entrant below the monopoly threshold', () => {
    const result = applyRivalDynamics(baseRivals, MONOPOLY_SHARE_THRESHOLD - 0.1, 200, 'scrappy', createRng(1));
    expect(result.beats.some((b) => b.title.includes('enters the market'))).toBe(false);
  });

  it('support headcount dampens share losses', () => {
    const base: GameState = {
      ...newGame(2),
      cash: 50_000_000,
      productQuality: 1,
      rivals: [
        { name: 'A', productQuality: 100_000, marketShare: 0.2 },
        { name: 'B', productQuality: 100_000, marketShare: 0.2 },
      ],
    };
    const noSupport: GameState = {
      ...base,
      headcount: { ...base.headcount, support: 0 },
      pendingHeadcount: { ...base.pendingHeadcount, support: 0 },
    };
    const withSupport: GameState = {
      ...base,
      headcount: { ...base.headcount, support: 3 },
      pendingHeadcount: { ...base.pendingHeadcount, support: 3 },
    };

    const afterNoSupport = tick(noSupport);
    const afterWithSupport = tick(withSupport);

    expect(afterWithSupport.marketShare).toBeGreaterThan(afterNoSupport.marketShare);
  });
});
