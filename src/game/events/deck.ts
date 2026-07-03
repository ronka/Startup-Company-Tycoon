/** Pure deck-drawing helpers, driven by the seeded RNG. */

import { nextInt } from '../rng';
import { RngState } from '../types';
import { EventCard } from './types';

/** Draw a random card from `deck` that isn't in `drawnIds`. Never repeats. */
export function drawCard(
  deck: EventCard[],
  drawnIds: string[],
  rng: RngState,
): { card: EventCard | null; rng: RngState } {
  const available = deck.filter((c) => !drawnIds.includes(c.id));
  if (available.length === 0) return { card: null, rng };
  const [index, next] = nextInt(rng, 0, available.length - 1);
  return { card: available[index], rng: next };
}

/** Weeks until the next draw: 2–4, inclusive. */
export function drawCadenceWeeks(rng: RngState): [number, RngState] {
  return nextInt(rng, 2, 4);
}
