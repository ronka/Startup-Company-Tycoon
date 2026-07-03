/**
 * Rival generation and growth. Pure functions over the seeded RNG, mirroring
 * `clevels.ts`'s pattern: names/starting stats are deterministic per seed,
 * and weekly growth threads the RNG state through explicitly.
 */

import { clamp, ERA_RIVAL_GROWTH_MULTIPLIER } from './balance';
import { Era } from './events/types';
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

/** Rivals accelerate as the player raises rounds, and further still during the Boom. */
export function rivalGrowthMultiplier(roundsRaised: number, era: Era = 'scrappy'): number {
  return (1 + roundsRaised * RIVAL_GROWTH_PER_ROUND_RAISED) * ERA_RIVAL_GROWTH_MULTIPLIER[era];
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

// ── Rivals that fight back (Task 11) ──────────────────────────────────────
/** Below this share, a rival is "share-starved" and eligible for a desperation pivot. */
export const RIVAL_DESPERATION_SHARE_THRESHOLD = 0.08;
/** Weekly chance a starved rival's pivot roll hits once eligible. */
export const RIVAL_DESPERATION_PIVOT_CHANCE = 0.05;
/** Flat quality surge a successful pivot grants. */
export const RIVAL_DESPERATION_QUALITY_BOOST = 400;

/** Reckoning-only: a rival this weak is eligible to collapse and be replaced. */
export const RIVAL_DEATH_SHARE_THRESHOLD = 0.04;
/** Weekly chance a collapse-eligible rival actually folds, once in Reckoning. */
export const RIVAL_DEATH_CHANCE = 0.06;

/** Player share that triggers a forced new entrant, regardless of era. */
export const MONOPOLY_SHARE_THRESHOLD = 0.85;
/** A forced entrant knocks the player back down toward this share. */
export const MONOPOLY_SHARE_TARGET = 0.7;
/** Starting share a fresh entrant (Reckoning collapse or monopoly response) carries. */
export const NEW_ENTRANT_STARTING_SHARE = 0.1;
/** A fresh entrant's starting quality, as a fraction of the player's current quality — a real threat, not a pushover. */
export const NEW_ENTRANT_STARTING_QUALITY_FRACTION = 0.5;

/** A flavor-only news beat (the engine stamps `week` on before pushing to `newsLog`). */
export interface RivalNewsBeat {
  title: string;
  flavor: string;
}

/**
 * Share-starved rivals occasionally gamble on a desperation pivot: a flat
 * quality surge that can claw back relevance. A no-op (and no RNG draw) for
 * any rival that isn't starved.
 */
function applyDesperationPivots(
  rivals: Rival[],
  rng: RngState,
): { rivals: Rival[]; rng: RngState; beats: RivalNewsBeat[] } {
  let r = rng;
  const beats: RivalNewsBeat[] = [];
  const next = rivals.map((rival) => {
    if (rival.marketShare >= RIVAL_DESPERATION_SHARE_THRESHOLD) return rival;
    const [roll, afterRoll] = nextFloat(r);
    r = afterRoll;
    if (roll >= RIVAL_DESPERATION_PIVOT_CHANCE) return rival;
    beats.push({
      title: `${rival.name} makes a desperate pivot`,
      flavor: `Starved for share, ${rival.name} surges its product quality in a bid to stay relevant.`,
    });
    return { ...rival, productQuality: rival.productQuality + RIVAL_DESPERATION_QUALITY_BOOST };
  });
  return { rivals: next, rng: r, beats };
}

/** A fresh competitor distinct from every currently-alive rival name. */
function spawnEntrant(
  aliveNames: string[],
  playerQuality: number,
  rng: RngState,
): { rival: Rival; rng: RngState } {
  const pool = RIVAL_NAME_POOL.filter((name) => !aliveNames.includes(name));
  const [index, afterIndex] = nextInt(rng, 0, pool.length - 1);
  return {
    rival: {
      name: pool[index],
      productQuality: Math.max(0, playerQuality * NEW_ENTRANT_STARTING_QUALITY_FRACTION),
      marketShare: NEW_ENTRANT_STARTING_SHARE,
    },
    rng: afterIndex,
  };
}

export interface RivalDynamicsResult {
  rivals: Rival[];
  marketShare: number;
  rng: RngState;
  beats: RivalNewsBeat[];
}

/**
 * Era- and state-aware rival behavior layered on top of the base growth/share
 * math in `advanceMarket` (engine.ts): share-starved rivals can pivot (quality
 * surge, no share change); in Reckoning a weak-enough rival can collapse and
 * is immediately replaced by a fresh entrant carrying the freed share; and if
 * the player is closing in on monopoly, a new entrant is forced in regardless
 * of era, carving a starting share back out of the player. Exactly two named
 * rivals always exist — a "death" swaps the slot's occupant rather than
 * shrinking the array, so every other part of the game (market.tsx, digest
 * comparisons) can keep assuming a fixed two-rival shape.
 */
export function applyRivalDynamics(
  rivals: Rival[],
  playerMarketShare: number,
  playerQuality: number,
  era: Era,
  rng: RngState,
): RivalDynamicsResult {
  const pivoted = applyDesperationPivots(rivals, rng);
  let nextRivals = pivoted.rivals;
  let r = pivoted.rng;
  const beats = [...pivoted.beats];
  let marketShare = playerMarketShare;

  if (era === 'reckoning') {
    for (let i = 0; i < nextRivals.length; i++) {
      const rival = nextRivals[i];
      if (rival.marketShare >= RIVAL_DEATH_SHARE_THRESHOLD) continue;
      const [roll, afterRoll] = nextFloat(r);
      r = afterRoll;
      if (roll >= RIVAL_DEATH_CHANCE) continue;

      const survivor = nextRivals[1 - i];
      const entrant = spawnEntrant([survivor.name], playerQuality, r);
      r = entrant.rng;
      const replaced = { ...entrant.rival, marketShare: rival.marketShare };
      nextRivals = nextRivals.map((v, idx) => (idx === i ? replaced : v));
      beats.push({
        title: `${rival.name} shuts down`,
        flavor: `${rival.name} collapses under the Reckoning. ${replaced.name} moves in to fill the gap.`,
      });
      break; // at most one collapse per week keeps this legible
    }
  }

  if (marketShare >= MONOPOLY_SHARE_THRESHOLD) {
    const weakestIndex = nextRivals[0].marketShare <= nextRivals[1].marketShare ? 0 : 1;
    const survivor = nextRivals[1 - weakestIndex];
    const entrant = spawnEntrant([survivor.name], playerQuality, r);
    r = entrant.rng;
    const carve = Math.max(NEW_ENTRANT_STARTING_SHARE, marketShare - MONOPOLY_SHARE_TARGET);
    marketShare = clamp(marketShare - carve, 0, 1);
    const replaced = { ...entrant.rival, marketShare: carve };
    nextRivals = nextRivals.map((v, idx) => (idx === weakestIndex ? replaced : v));
    beats.push({
      title: `${replaced.name} enters the market`,
      flavor: `Your near-total dominance draws a new challenger: ${replaced.name}.`,
    });
  }

  return { rivals: nextRivals, marketShare, rng: r, beats };
}
