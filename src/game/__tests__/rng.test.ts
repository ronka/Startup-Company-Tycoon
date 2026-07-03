import { describe, expect, it } from 'vitest';

import { createRng, nextFloat, nextInt, nextRange } from '../rng';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const draw = (seed: number, n: number) => {
      let rng = createRng(seed);
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const [v, next] = nextFloat(rng);
        out.push(v);
        rng = next;
      }
      return out;
    };
    expect(draw(123, 20)).toEqual(draw(123, 20));
  });

  it('advances the counter and produces floats in [0, 1)', () => {
    let rng = createRng(999);
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(next.counter).toBe(rng.counter + 1);
      rng = next;
    }
  });

  it('nextInt stays within the inclusive range', () => {
    let rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const [v, next] = nextInt(rng, 2, 4);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
      expect(Number.isInteger(v)).toBe(true);
      rng = next;
    }
  });

  it('nextRange stays within [min, max)', () => {
    let rng = createRng(11);
    for (let i = 0; i < 500; i++) {
      const [v, next] = nextRange(rng, 0.5, 2.5);
      expect(v).toBeGreaterThanOrEqual(0.5);
      expect(v).toBeLessThan(2.5);
      rng = next;
    }
  });

  it('different seeds diverge', () => {
    const [a] = nextFloat(createRng(1));
    const [b] = nextFloat(createRng(2));
    expect(a).not.toBe(b);
  });
});
