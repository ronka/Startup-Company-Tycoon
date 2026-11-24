/**
 * The era decks, keyed by era. Lives in its own module (rather than inside
 * `engine.ts`) so the chapter/arc capstone picker in `../arcs/` can read the
 * same decks without importing the engine and creating a cycle.
 */

import { BOOM_DECK } from './boom';
import { RECKONING_DECK } from './reckoning';
import { SCRAPPY_DECK } from './scrappy';
import { Era, EventCard } from './types';

/** Each era draws from its own unique-card deck (Task 6: era-gated draw). */
export const ERA_DECKS: Record<Era, EventCard[]> = {
  scrappy: SCRAPPY_DECK,
  boom: BOOM_DECK,
  reckoning: RECKONING_DECK,
};

/** A choice that ends the run as `acquired`. Never pinned: a player who waited or paid to see it must not find the game over a tap later. */
export function isAcquisitionCard(card: EventCard): boolean {
  return card.choices?.some((choice) => choice.effects.acquisitionOffer) ?? false;
}

/** A decision card a cliffhanger may pin: a decision, never an acquisition offer. */
export function isPinnable(card: EventCard): boolean {
  return card.kind === 'decision' && !isAcquisitionCard(card);
}
