/**
 * Deterministic seeded RNG (mulberry32), implemented as pure functions over a
 * serializable {@link RngState}. Every draw returns the value plus the *next*
 * state, so nothing mutates in place and a saved run replays identically.
 */

import { RngState } from './types';

export function createRng(seed: number): RngState {
  return { seed: seed | 0, counter: 0 };
}

/** Draw a float in [0, 1) and return it alongside the advanced RNG state. */
export function nextFloat(rng: RngState): [number, RngState] {
  let a = (rng.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { seed: a, counter: rng.counter + 1 }];
}

/** Draw an integer in [minInclusive, maxInclusive]. */
export function nextInt(
  rng: RngState,
  minInclusive: number,
  maxInclusive: number,
): [number, RngState] {
  const [v, next] = nextFloat(rng);
  const span = maxInclusive - minInclusive + 1;
  return [minInclusive + Math.floor(v * span), next];
}

/** Draw a float in [min, max). */
export function nextRange(rng: RngState, min: number, max: number): [number, RngState] {
  const [v, next] = nextFloat(rng);
  return [min + v * (max - min), next];
}
