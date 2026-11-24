/**
 * Picks the card a chapter ends on, and the mid-chapter beat before it. Pure
 * and deterministic: no RNG, so the same state always pins the same capstone.
 */

import { ERA_DECKS, isPinnable } from '../events/decks';
import { stakeScore } from '../events/stakes';
import type { EventCard } from '../events/types';
import type { GameState } from '../types';
import { ARC_CARDS, arcCardById, crisisCardFor } from './cards';
import type { ArcIndex } from './schedule';
import { ARC_TEMPLATES, templateIdFor } from './templates';
import type { ArcId } from './types';

export interface CapstoneInput {
  arcIndex: ArcIndex;
  state: GameState;
  /** The running chapter's template; derived from the arc index and era when absent. */
  templateId?: ArcId;
}

const ALL_DECK_CARDS: readonly EventCard[] = [...Object.values(ERA_DECKS).flat(), ...ARC_CARDS];

function cardById(id: string): EventCard | null {
  return ALL_DECK_CARDS.find((card) => card.id === id) ?? null;
}

const flagMet = (card: EventCard, flags: readonly string[]) => !card.requiresFlag || flags.includes(card.requiresFlag);

/** Flags some card somewhere requires — a card that sets one seeds a later payoff. */
const FOLLOW_UP_FLAGS: ReadonlySet<string> = new Set(
  ALL_DECK_CARDS.flatMap((card) => (card.requiresFlag ? [card.requiresFlag] : [])),
);

/**
 * A capstone's stake: the card's own swings, plus one more unit of stake for a
 * card that seeds a follow-up — that card's choice carries into a later chapter.
 */
export function capstoneStake(card: EventCard): number {
  const seeds = card.choices?.some((choice) => choice.effects.setsFlag && FOLLOW_UP_FLAGS.has(choice.effects.setsFlag));
  return stakeScore(card) + (seeds ? 2 : 0);
}

/** Highest stake first; id breaks ties so the order never depends on deck order. */
function byStake(a: EventCard, b: EventCard): number {
  return capstoneStake(b) - capstoneStake(a) || a.id.localeCompare(b.id);
}

/**
 * The card a chapter ends on. In order:
 * 1. a flag-gated follow-up whose flag this run has set — chapter cards first
 *    (the payoff of this chapter's midpoint), then the current era deck;
 * 2. the highest-stake pinnable decision still undrawn, from the era deck plus
 *    the chapter's own `capstonePool`;
 * 3. from chapter 2 on, a crisis template filled from cash, morale, and headcount.
 *
 * Never an acquisition offer (see `isPinnable`). Null when nothing qualifies —
 * arc 0 never falls through to a crisis, so a first wall with an exhausted
 * deck behaves exactly as before.
 */
export function pickCapstone({ arcIndex, state, templateId }: CapstoneInput): EventCard | null {
  const drawn = new Set(state.drawnEventIds);
  const flags = state.storyFlags;
  const eligible = (card: EventCard) => isPinnable(card) && !drawn.has(card.id) && flagMet(card, flags);
  const eraDeck = ERA_DECKS[state.era];

  const followUp = (cards: readonly EventCard[]) =>
    cards.filter((card) => card.requiresFlag && eligible(card)).sort(byStake)[0] ?? null;
  const chosen = followUp(ARC_CARDS) ?? followUp(eraDeck);
  if (chosen) return chosen;

  const template = ARC_TEMPLATES[templateId ?? templateIdFor(arcIndex, state)];
  const pool = [...eraDeck, ...(template.capstonePool ?? []).map(cardById).filter((c): c is EventCard => c !== null)];
  const best = pool.filter(eligible).sort(byStake)[0];
  if (best) return best;

  if (arcIndex < 1) return null;
  const crisis = crisisCardFor(state, arcIndex);
  return drawn.has(crisis.id) ? null : crisis;
}

/** The chapter's mid-arc decision, if its template has one and it hasn't been drawn. */
export function pickMidpoint({ arcIndex, state, templateId }: CapstoneInput): EventCard | null {
  const template = ARC_TEMPLATES[templateId ?? templateIdFor(arcIndex, state)];
  if (!template.midpointCardId) return null;
  const card = arcCardById(template.midpointCardId);
  if (!card || state.drawnEventIds.includes(card.id) || !isPinnable(card)) return null;
  return card;
}
