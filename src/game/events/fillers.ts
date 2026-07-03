import { EventCard } from './types';

/**
 * Repeatable filler cards, drawn once an era's unique deck is exhausted so
 * late weeks never go fully silent (Task 6). `era` is nominal here — fillers
 * aren't era-gated by the engine, only unique decks are — but each still
 * needs a value to satisfy `EventCard`.
 */
export const FILLER_DECK: EventCard[] = [
  {
    id: 'filler-quiet-week',
    era: 'scrappy',
    kind: 'news',
    title: 'A Quiet Week',
    flavor: 'Nothing dramatic. The team heads-down, ships, goes home.',
    effects: {},
    repeatable: true,
  },
  {
    id: 'filler-steady-as-she-goes',
    era: 'scrappy',
    kind: 'news',
    title: 'Steady as She Goes',
    flavor: 'No headlines this week — just another week of the grind.',
    effects: {},
    repeatable: true,
  },
];
