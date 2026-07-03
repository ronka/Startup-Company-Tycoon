/** Pure deck-drawing helpers, driven by the seeded RNG. */

import { nextInt } from '../rng';
import { RngState } from '../types';
import { EventCard } from './types';

/** A card without a `requiresFlag`, or one whose required flag has been set. */
function isUnlocked(card: EventCard, storyFlags: string[]): boolean {
  return !card.requiresFlag || storyFlags.includes(card.requiresFlag);
}

/** Draw a random unlocked card from `deck` that isn't in `drawnIds`. Never repeats. */
export function drawCard(
  deck: EventCard[],
  drawnIds: string[],
  storyFlags: string[],
  rng: RngState,
): { card: EventCard | null; rng: RngState } {
  const available = deck.filter((c) => !drawnIds.includes(c.id) && isUnlocked(c, storyFlags));
  if (available.length === 0) return { card: null, rng };
  const [index, next] = nextInt(rng, 0, available.length - 1);
  return { card: available[index], rng: next };
}

/**
 * Draw a random unlocked card from a repeatable filler pool — no `drawnIds`
 * exclusion, so the same filler can come up again once an era's unique deck
 * is exhausted (keeping late weeks from going fully silent).
 */
export function drawFillerCard(
  fillers: EventCard[],
  storyFlags: string[],
  rng: RngState,
): { card: EventCard | null; rng: RngState } {
  const available = fillers.filter((c) => isUnlocked(c, storyFlags));
  if (available.length === 0) return { card: null, rng };
  const [index, next] = nextInt(rng, 0, available.length - 1);
  return { card: available[index], rng: next };
}

/** Weeks until the next draw: 2–4, inclusive. */
export function drawCadenceWeeks(rng: RngState): [number, RngState] {
  return nextInt(rng, 2, 4);
}
