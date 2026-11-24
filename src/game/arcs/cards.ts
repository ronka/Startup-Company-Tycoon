/**
 * Chapter cards: a handful of small mid-chapter decisions that set a story
 * flag, the capstone follow-ups that key off those flags, and numeric crisis
 * templates for later chapters once the era decks run dry.
 *
 * None of these are in an era deck, so the weekly draw (`tick`) never sees
 * them and the sim snapshot stays byte-identical. They only ever arrive
 * pinned, by `PIN_CLIFFHANGER`, which is why each has a teaser.
 */

import { weeklyStatsFor } from '../balance';
import type { EventCard } from '../events/types';
import type { GameState } from '../types';
import { ROLES } from '../types';
import type { ArcIndex } from './schedule';

export const PMF_FLAGS = { niche: 'pmf-niche', broad: 'pmf-broad' } as const;
export const SCALE_FLAGS = { hiredAhead: 'scale-hired-ahead', stayedLean: 'scale-stayed-lean' } as const;

/** Week 15: who is the product actually for? Small swings; the point is the flag. */
export const PMF_MIDPOINT: EventCard = {
  id: 'arc-pmf-who-is-it-for',
  era: 'scrappy',
  kind: 'decision',
  title: 'Who Is It For?',
  flavor: 'Your last ten sign-ups look nothing alike. Sales wants a niche; marketing wants everyone.',
  teaser: 'Your last ten customers have nothing in common. The team wants you to pick a lane.',
  choices: [
    {
      label: 'Pick a niche and own it',
      effects: {
        deltas: [
          { stat: 'productQuality', amount: 8 },
          { stat: 'hype', amount: -0.03 },
        ],
        setsFlag: PMF_FLAGS.niche,
      },
    },
    {
      label: "Sell to anyone who'll pay",
      effects: {
        deltas: [
          { stat: 'hype', amount: 0.05 },
          { stat: 'productQuality', amount: -5 },
        ],
        setsFlag: PMF_FLAGS.broad,
      },
    },
  ],
};

/** Week 20 capstone after picking a niche. */
export const PMF_NICHE_CAPSTONE: EventCard = {
  id: 'arc-pmf-anchor-customer',
  era: 'scrappy',
  kind: 'decision',
  title: 'The Anchor Customer',
  flavor: 'The biggest name in your niche will sign — if nobody else in their market gets the product.',
  teaser: 'The biggest name in your niche wants to talk exclusivity. Everyone else is watching.',
  requiresFlag: PMF_FLAGS.niche,
  choices: [
    {
      label: 'Sign the exclusive',
      effects: {
        deltas: [
          { stat: 'marketShare', amount: 0.03 },
          { stat: 'cash', amount: 15_000 },
          { stat: 'morale', amount: -5 },
        ],
      },
    },
    {
      label: 'Stay open to everyone',
      effects: {
        deltas: [
          { stat: 'hype', amount: 0.05 },
          { stat: 'marketShare', amount: -0.01 },
        ],
      },
    },
  ],
};

/** Week 20 capstone after selling to anyone. */
export const PMF_BROAD_CAPSTONE: EventCard = {
  id: 'arc-pmf-churn-report',
  era: 'scrappy',
  kind: 'decision',
  title: 'The Churn Report',
  flavor: 'All those sign-ups came at a price: a third of them are already gone.',
  teaser: 'Your customer list is long. Your retention chart is not.',
  requiresFlag: PMF_FLAGS.broad,
  choices: [
    {
      label: 'Rebuild for your core users',
      effects: {
        deltas: [
          { stat: 'productQuality', amount: 15 },
          { stat: 'marketShare', amount: -0.015 },
          { stat: 'morale', amount: -4 },
        ],
      },
    },
    {
      label: 'Pour more into growth',
      effects: {
        deltas: [
          { stat: 'hype', amount: 0.06 },
          { stat: 'cash', amount: -15_000 },
          { stat: 'productQuality', amount: -8 },
        ],
      },
    },
  ],
};

/** Week 25: hire for the company you'll be, or the one you are? */
export const SCALE_MIDPOINT: EventCard = {
  id: 'arc-scale-hire-ahead',
  era: 'scrappy',
  kind: 'decision',
  title: 'Hire Ahead of the Curve?',
  flavor: 'Your managers want headcount for growth you have not hit yet.',
  teaser: "Your managers want headcount for growth you haven't hit yet.",
  choices: [
    {
      label: 'Hire ahead of the plan',
      effects: {
        deltas: [
          { stat: 'morale', amount: 4 },
          { stat: 'cash', amount: -12_000 },
        ],
        setsFlag: SCALE_FLAGS.hiredAhead,
      },
    },
    {
      label: 'Hold the line on hiring',
      effects: {
        deltas: [{ stat: 'morale', amount: -3 }],
        setsFlag: SCALE_FLAGS.stayedLean,
      },
    },
  ],
};

/** Week 30 capstone after hiring ahead. */
export const SCALE_HIRED_AHEAD_CAPSTONE: EventCard = {
  id: 'arc-scale-org-chart',
  era: 'scrappy',
  kind: 'decision',
  title: 'The Org Chart Breaks',
  flavor: 'Nobody is sure who reports to whom anymore, and two teams just shipped the same feature.',
  teaser: 'Two teams just shipped the same feature. Somebody has to redraw the org chart.',
  requiresFlag: SCALE_FLAGS.hiredAhead,
  choices: [
    {
      label: 'Bring in layers of management',
      effects: {
        deltas: [
          { stat: 'cash', amount: -20_000 },
          { stat: 'productQuality', amount: 12 },
        ],
      },
    },
    {
      label: 'Keep it flat and let it sort itself out',
      effects: {
        deltas: [
          { stat: 'morale', amount: -8 },
          { stat: 'hype', amount: 0.04 },
        ],
      },
    },
  ],
};

/** Every authored chapter card, for lookups by id (delivery, teasers). */
export const ARC_CARDS: readonly EventCard[] = [
  PMF_MIDPOINT,
  PMF_NICHE_CAPSTONE,
  PMF_BROAD_CAPSTONE,
  SCALE_MIDPOINT,
  SCALE_HIRED_AHEAD_CAPSTONE,
];

export function arcCardById(id: string): EventCard | null {
  return ARC_CARDS.find((card) => card.id === id) ?? null;
}

// ── Crisis templates ────────────────────────────────────────────────────────

/** Prefix of a generated crisis card's id; the arc index makes each one unique for `drawnEventIds`. */
export const CRISIS_CARD_PREFIX = 'crisis-arc-';

export type CrisisKind = 'cash' | 'morale' | 'headcount';

/** Runway at or under this many weeks makes the cash cliff the crisis. */
const CRISIS_RUNWAY_WEEKS = 12;
/** Morale under this makes the team the crisis. */
const CRISIS_MORALE = 50;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Which crisis this state is closest to: the cash cliff, a fraying team, or a payroll that outgrew revenue. */
export function crisisKindFor(state: GameState): CrisisKind {
  const { runway } = weeklyStatsFor(state);
  if (Number.isFinite(runway) && runway <= CRISIS_RUNWAY_WEEKS) return 'cash';
  if (state.morale < CRISIS_MORALE) return 'morale';
  return 'headcount';
}

/**
 * A crisis decision with its numbers filled in from this run — burn, morale,
 * and headcount — for a chapter whose decks have nothing left to pin. The
 * numbers live only in the effects; the labels never quote them, so the wall
 * can show both choices without giving the answer away.
 */
export function crisisCardFor(state: GameState, arcIndex: ArcIndex): EventCard {
  const id = `${CRISIS_CARD_PREFIX}${arcIndex}`;
  const { burn } = weeklyStatsFor(state);
  const swing = Math.max(10_000, roundTo(burn * 3, 1_000));
  const heads = ROLES.reduce((sum, role) => sum + state.headcount[role], 0);
  const base = { id, era: state.era, kind: 'decision' as const };

  switch (crisisKindFor(state)) {
    case 'cash':
      return {
        ...base,
        title: 'The Cash Cliff',
        flavor: 'The spreadsheet is unambiguous: at this burn, the money runs out before the plan does.',
        teaser: 'The bank called. Your burn just outran the plan.',
        choices: [
          {
            label: 'Cut costs hard, starting today',
            effects: {
              deltas: [
                { stat: 'cash', amount: swing },
                { stat: 'morale', amount: -10 },
              ],
            },
          },
          {
            label: 'Bet on growth to outrun it',
            effects: {
              deltas: [
                { stat: 'hype', amount: 0.08 },
                { stat: 'cash', amount: -Math.round(swing / 2) },
              ],
            },
          },
        ],
      };
    case 'morale':
      return {
        ...base,
        title: 'The Team Is Fraying',
        flavor: 'Your best people have stopped arguing in meetings. That is never a good sign.',
        teaser: "Your best people have stopped arguing in meetings. That's never a good sign.",
        choices: [
          {
            label: 'Pay for a real reset',
            effects: {
              deltas: [
                { stat: 'cash', amount: -Math.max(10_000, roundTo(heads * 2_000, 1_000)) },
                { stat: 'morale', amount: 12 },
              ],
            },
          },
          {
            label: 'Push through to the next launch',
            effects: {
              deltas: [
                { stat: 'productQuality', amount: 15 },
                { stat: 'morale', amount: -12 },
              ],
            },
          },
        ],
      };
    case 'headcount':
      return {
        ...base,
        title: 'Too Many Desks?',
        flavor: 'Finance put one slide in front of you: payroll against revenue, and the lines have crossed.',
        teaser: 'Finance put one slide in front of you: payroll versus revenue.',
        choices: [
          {
            label: 'Freeze hiring and trim the perks',
            effects: {
              deltas: [
                { stat: 'cash', amount: swing },
                { stat: 'morale', amount: -8 },
              ],
            },
          },
          {
            label: 'Keep building the team',
            effects: {
              deltas: [
                { stat: 'morale', amount: 5 },
                { stat: 'productQuality', amount: 10 },
                { stat: 'cash', amount: -Math.round(swing / 2) },
              ],
            },
          },
        ],
      };
  }
}
