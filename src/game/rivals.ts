/**
 * Rival generation and growth. Pure functions over the seeded RNG, mirroring
 * `clevels.ts`'s pattern: names/starting stats are deterministic per seed,
 * and weekly growth threads the RNG state through explicitly.
 */

import { nextFloat, nextInt, nextRange } from './rng';
import { Rival, RngState } from './types';

const RIVAL_NAME_POOL = [
  'Vertex Labs',
  'Nimbus',
  'Forge Systems',
  'Halcyon',
  'Quanta',
  'Brightline',
  'Ironclad',
  'Meridian',
];

export const STARTING_RIVAL_QUALITY = 50;
export const STARTING_RIVAL_MARKET_SHARE = 0.2;

/** Flat weekly quality growth every rival gets, script-driven rather than input-driven. */
export const RIVAL_BASE_QUALITY_GROWTH = 20;
/** Chance per week a rival gets an extra jitter swing on top of the base growth. */
export const RIVAL_JITTER_CHANCE = 0.15;
export const RIVAL_JITTER_MIN = -50;
export const RIVAL_JITTER_MAX = 100;
/** Extra growth multiplier rivals gain per round the player has raised — funding draws competition. */
export const RIVAL_GROWTH_PER_ROUND_RAISED = 0.3;

/** Rivals accelerate as the player raises rounds and the market heats up. */
export function rivalGrowthMultiplier(roundsRaised: number): number {
  return 1 + roundsRaised * RIVAL_GROWTH_PER_ROUND_RAISED;
}

/** Two named rivals with distinct names, drawn deterministically from the run's RNG. */
export function generateRivals(rng: RngState): { rivals: Rival[]; rng: RngState } {
  let r = rng;
  const usedIndices = new Set<number>();
  const rivals: Rival[] = [];

  while (rivals.length < 2) {
    let index: number;
    [index, r] = nextInt(r, 0, RIVAL_NAME_POOL.length - 1);
    if (usedIndices.has(index)) continue;
    usedIndices.add(index);
    rivals.push({
      name: RIVAL_NAME_POOL[index],
      productQuality: STARTING_RIVAL_QUALITY,
      marketShare: STARTING_RIVAL_MARKET_SHARE,
    });
  }

  return { rivals, rng: r };
}

/**
 * One week of scripted rival quality growth: flat baseline plus an occasional
 * jitter, scaled up by `growthMultiplier` (stage-driven — see
 * `rivalGrowthMultiplier`) so competitors sharpen up as the market heats up.
 */
export function rivalQualityAfterTick(
  quality: number,
  rng: RngState,
  growthMultiplier: number = 1,
): [number, RngState] {
  const [roll, afterRoll] = nextFloat(rng);
  if (roll < RIVAL_JITTER_CHANCE) {
    const [jitter, afterJitter] = nextRange(afterRoll, RIVAL_JITTER_MIN, RIVAL_JITTER_MAX);
    return [
      Math.max(0, quality + (RIVAL_BASE_QUALITY_GROWTH + jitter) * growthMultiplier),
      afterJitter,
    ];
  }
  return [Math.max(0, quality + RIVAL_BASE_QUALITY_GROWTH * growthMultiplier), afterRoll];
}
