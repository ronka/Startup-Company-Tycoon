import { describe, expect, it } from 'vitest';

import { newGame, tick } from '../engine';
import { generateRivals, rivalQualityAfterTick } from '../rivals';
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
