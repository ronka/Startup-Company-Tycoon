import { describe, expect, it } from 'vitest';

import { CLIFFHANGER_COOLDOWN_WEEKS, cliffhangerCardFor, newGame, reduce, tick } from '../../engine';
import { BOOM_DECK } from '../../events/boom';
import { ERA_DECKS, isAcquisitionCard, isPinnable } from '../../events/decks';
import { RECKONING_DECK } from '../../events/reckoning';
import { SCRAPPY_DECK } from '../../events/scrappy';
import { INVESTOR_FLAGS } from '../../investor-flags';
import type { GameState } from '../../types';
import {
  ARC_CARDS,
  CRISIS_CARD_PREFIX,
  PMF_BROAD_CAPSTONE,
  PMF_FLAGS,
  PMF_MIDPOINT,
  PMF_NICHE_CAPSTONE,
  SCALE_MIDPOINT,
  capstoneStake,
  crisisCardFor,
  pickCapstone,
  pickMidpoint,
} from '..';

const PIN = { type: 'PIN_CLIFFHANGER' } as const;
const SCHEDULED = { type: 'PIN_CLIFFHANGER', scheduledOnly: true } as const;

function at(week: number, overrides: Partial<GameState> = {}, seed = 7): GameState {
  return { ...newGame('Acme', seed), week, cash: 50_000_000, weeksUntilNextEvent: 1000, ...overrides };
}

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);
const allScrappy = ids(SCRAPPY_DECK);
const allBoom = ids(BOOM_DECK);

describe('pickCapstone ordering', () => {
  it('arc 0 picks the highest-stake pinnable Scrappy decision, deterministically', () => {
    const state = at(10);
    const card = pickCapstone({ arcIndex: 0, state })!;
    expect(card.era).toBe('scrappy');
    expect(isPinnable(card)).toBe(true);
    const best = Math.max(...SCRAPPY_DECK.filter(isPinnable).map(capstoneStake));
    expect(capstoneStake(card)).toBe(best);
    expect(pickCapstone({ arcIndex: 0, state: at(10, {}, 99) })?.id).toBe(card.id);
  });

  it('prefers a chapter follow-up whose flag the run set', () => {
    expect(pickCapstone({ arcIndex: 1, state: at(20, { storyFlags: [PMF_FLAGS.niche] }) })?.id).toBe(PMF_NICHE_CAPSTONE.id);
    expect(pickCapstone({ arcIndex: 1, state: at(20, { storyFlags: [PMF_FLAGS.broad] }) })?.id).toBe(PMF_BROAD_CAPSTONE.id);
  });

  it('then an era-deck follow-up', () => {
    const state = at(30, { era: 'boom', storyFlags: ['crunched-for-first-customer'] });
    expect(pickCapstone({ arcIndex: 2, state })?.id).toBe('boom-demanding-customer-returns');
  });

  it('never picks a flag-gated acquisition offer (Foogle)', () => {
    const state = at(30, { era: 'boom', storyFlags: [INVESTOR_FLAGS.foogle] });
    const card = pickCapstone({ arcIndex: 2, state })!;
    expect(card.id).not.toBe('boom-foogle-makes-its-move');
    expect(isAcquisitionCard(card)).toBe(false);
  });

  it('never picks an acquisition offer, across eras, arcs, and flags', () => {
    const everyFlag = [...new Set([...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK, ...ARC_CARDS].flatMap((c) => (c.requiresFlag ? [c.requiresFlag] : [])))];
    for (const era of ['scrappy', 'boom', 'reckoning'] as const) {
      for (let arcIndex = 0; arcIndex < 8; arcIndex++) {
        for (const flags of [[], everyFlag]) {
          const card = pickCapstone({ arcIndex, state: at((arcIndex + 1) * 10, { era, storyFlags: flags }) });
          if (card) expect(isAcquisitionCard(card), card.id).toBe(false);
        }
      }
    }
  });

  it('skips drawn cards', () => {
    const first = pickCapstone({ arcIndex: 0, state: at(10) })!;
    const second = pickCapstone({ arcIndex: 0, state: at(10, { drawnEventIds: [first.id] }) })!;
    expect(second.id).not.toBe(first.id);
  });

  it("lets the Series A chapter end on a Boom card from its pool while still Scrappy", () => {
    const state = at(30, { drawnEventIds: allScrappy });
    const card = pickCapstone({ arcIndex: 2, state, templateId: 'scale' })!;
    expect(['boom-board-seat-request', 'boom-conference-keynote', 'boom-talent-poaching-war', 'boom-chase-the-round']).toContain(card.id);
  });

  it('falls back to a numeric crisis template from chapter 2 on', () => {
    const state = at(20, { drawnEventIds: allScrappy });
    const card = pickCapstone({ arcIndex: 1, state })!;
    expect(card.id).toBe(`${CRISIS_CARD_PREFIX}1`);
    expect(card.choices).toHaveLength(2);
    expect(card.teaser).toBeTruthy();
    // Once that crisis has been drawn, there is nothing left.
    expect(pickCapstone({ arcIndex: 1, state: { ...state, drawnEventIds: [...allScrappy, card.id] } })).toBeNull();
  });

  it('never falls back to a crisis in arc 0', () => {
    expect(pickCapstone({ arcIndex: 0, state: at(10, { drawnEventIds: allScrappy }) })).toBeNull();
  });

  it('fills the crisis from cash, morale, and headcount', () => {
    expect(crisisCardFor(at(30, { cash: 1_000, headcount: { devs: 4, sales: 2, support: 0 } }), 2).title).toBe('The Cash Cliff');
    expect(crisisCardFor(at(30, { morale: 30 }), 2).title).toBe('The Team Is Fraying');
    expect(crisisCardFor(at(30), 2).title).toBe('Too Many Desks?');
    // Labels never carry the numbers.
    for (const card of [crisisCardFor(at(30, { cash: 1_000 }), 2), crisisCardFor(at(30, { morale: 30 }), 2), crisisCardFor(at(30), 2)]) {
      for (const choice of card.choices ?? []) expect(choice.label).not.toMatch(/\d/);
    }
  });
});

describe('PIN_CLIFFHANGER at chapter beats', () => {
  it('pins a capstone at weeks 10, 20, and 30, once per chapter', () => {
    for (const [week, arcIndex] of [[10, 0], [20, 1], [30, 2]] as const) {
      const pinned = reduce(at(week), PIN);
      expect(pinned.cliffhangerCardId, `week ${week}`).toBeTruthy();
      expect(pinned.lastCapstoneArc).toBe(arcIndex);
      expect(pinned.lastCliffhangerWeek).toBe(week);
    }
  });

  it('ignores the cooldown for a capstone, but not for an ordinary wall', () => {
    const recent = { lastCliffhangerWeek: 18 };
    expect(reduce(at(20, recent), PIN).lastCapstoneArc).toBe(1);
    expect(reduce(at(19, recent), PIN).cliffhangerCardId).toBeFalsy();
    expect(reduce(at(18 + CLIFFHANGER_COOLDOWN_WEEKS, recent), PIN).cliffhangerCardId).toBeTruthy();
  });

  it("doesn't pin a second capstone for the same chapter", () => {
    const delivered = tick(reduce(at(20), PIN));
    const answered = reduce(delivered, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    const again = reduce({ ...answered, week: 20 }, PIN);
    // Cooldown from the capstone stops the ordinary pin too.
    expect(again.cliffhangerCardId).toBeFalsy();
  });

  it('pins only chapter beats when scheduled off the wall', () => {
    const offBeat = at(13);
    expect(reduce(offBeat, SCHEDULED)).toBe(offBeat);
    expect(reduce(at(20), SCHEDULED).lastCapstoneArc).toBe(1);
    expect(reduce(at(15), SCHEDULED).cliffhangerCardId).toBe(PMF_MIDPOINT.id);
    // A chapter with no mid-chapter card leaves the state untouched off the wall.
    const boomMid = at(45, { era: 'boom' });
    expect(reduce(boomMid, SCHEDULED)).toBe(boomMid);
  });

  it('keeps an existing pin, even on a capstone week', () => {
    const pinned = reduce(at(17), PIN);
    expect(reduce({ ...pinned, week: 20 }, PIN).cliffhangerCardId).toBe(pinned.cliffhangerCardId);
  });

  it('pins the scale midpoint at week 25', () => {
    expect(reduce(at(25), SCHEDULED).cliffhangerCardId).toBe(SCALE_MIDPOINT.id);
    expect(pickMidpoint({ arcIndex: 2, state: at(25, { drawnEventIds: [SCALE_MIDPOINT.id] }) })).toBeNull();
  });
});

describe('the weeks 11–20 story', () => {
  it('week 15 sets a flag the week 20 capstone pays off', () => {
    const mid = reduce(at(15), SCHEDULED);
    expect(mid.lastMidpointArc).toBe(1);
    const landed = tick(mid);
    expect(landed.pendingEvent?.id).toBe(PMF_MIDPOINT.id);
    const answered = reduce(landed, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    expect(answered.storyFlags).toContain(PMF_FLAGS.niche);

    const capstone = reduce({ ...answered, week: 20 }, PIN);
    expect(capstone.cliffhangerCardId).toBe(PMF_NICHE_CAPSTONE.id);
    expect(cliffhangerCardFor(capstone)?.title).toBe('The Anchor Customer');
    expect(tick(capstone).pendingEvent?.id).toBe(PMF_NICHE_CAPSTONE.id);
  });

  it('delivers a generated crisis card and clears it once landed', () => {
    const state = at(30, { drawnEventIds: [...allScrappy, ...allBoom] });
    const pinned = reduce(state, PIN);
    expect(pinned.cliffhangerCardId).toBe(`${CRISIS_CARD_PREFIX}2`);
    expect(pinned.pinnedCard?.id).toBe(pinned.cliffhangerCardId);
    const landed = tick(pinned);
    expect(landed.pendingEvent?.id).toBe(`${CRISIS_CARD_PREFIX}2`);
    expect(landed.pinnedCard).toBeNull();
    expect(landed.drawnEventIds).toContain(`${CRISIS_CARD_PREFIX}2`);
  });
});

describe('chapter cards', () => {
  it('are all pinnable, teased, and outside every era deck (so the weekly draw never sees them)', () => {
    const eraIds = new Set(Object.values(ERA_DECKS).flat().map((c) => c.id));
    for (const card of ARC_CARDS) {
      expect(isPinnable(card), card.id).toBe(true);
      expect(card.teaser, card.id).toBeTruthy();
      expect(eraIds.has(card.id), card.id).toBe(false);
      expect(card.choices?.length).toBeGreaterThanOrEqual(2);
    }
  });
});
