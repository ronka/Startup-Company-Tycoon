import { describe, expect, it } from 'vitest';

import { CLIFFHANGER_COOLDOWN_WEEKS, cliffhangerCardFor, newGame, normalizeSave, reduce, tick } from '../../engine';
import { GameState } from '../../types';
import { BOOM_DECK } from '../boom';
import { RECKONING_DECK } from '../reckoning';
import { SCRAPPY_DECK } from '../scrappy';

const PIN = { type: 'PIN_CLIFFHANGER' } as const;

/** A run at week 10 with the next scheduled card far away, so only a pin can draw one. */
function atTheWall(seed = 7): GameState {
  return {
    ...newGame('Acme', seed),
    week: 10,
    cash: 50_000_000,
    weeksUntilNextEvent: 1000,
  };
}

describe('PIN_CLIFFHANGER', () => {
  it('pins an undrawn decision card and the next tick delivers it', () => {
    const pinned = reduce(atTheWall(), PIN);
    const card = cliffhangerCardFor(pinned);
    expect(card?.kind).toBe('decision');
    expect(pinned.lastCliffhangerWeek).toBe(10);

    const next = tick(pinned);
    expect(next.pendingEvent?.id).toBe(card?.id);
    expect(next.cliffhangerCardId).toBeNull();
    expect(next.drawnEventIds).toContain(card?.id);
    // Cadence re-rolls from the delivered card, like any draw.
    expect(next.weeksUntilNextEvent).toBeGreaterThanOrEqual(2);
    expect(next.weeksUntilNextEvent).toBeLessThanOrEqual(4);
  });

  it('is deterministic for a given state', () => {
    expect(reduce(atTheWall(3), PIN).cliffhangerCardId).toBe(reduce(atTheWall(3), PIN).cliffhangerCardId);
  });

  it('never pins an acquisition offer', () => {
    for (let seed = 0; seed < 200; seed++) {
      const card = cliffhangerCardFor(reduce(atTheWall(seed), PIN));
      expect(card?.choices?.some((choice) => choice.effects.acquisitionOffer)).toBe(false);
    }
  });

  it('pins nothing when every eligible card is already drawn', () => {
    const state = {
      ...atTheWall(),
      drawnEventIds: SCRAPPY_DECK.map((c) => c.id),
    };
    expect(reduce(state, PIN)).toBe(state);
  });

  it('respects the cooldown, then pins again', () => {
    const delivered = tick(reduce(atTheWall(), PIN));
    const answered = reduce(delivered, {
      type: 'ANSWER_EVENT',
      choiceIndex: 0,
    });
    const tooSoon = { ...answered, week: 10 + CLIFFHANGER_COOLDOWN_WEEKS - 1 };
    expect(reduce(tooSoon, PIN).cliffhangerCardId).toBeFalsy();
    const later = { ...answered, week: 10 + CLIFFHANGER_COOLDOWN_WEEKS };
    expect(reduce(later, PIN).cliffhangerCardId).toBeTruthy();
  });

  it('keeps an existing pin rather than re-rolling it', () => {
    const pinned = reduce(atTheWall(), PIN);
    expect(reduce({ ...pinned, week: 40 }, PIN).cliffhangerCardId).toBe(pinned.cliffhangerCardId);
  });

  it('pins while a card is pending, and delivers it once that card is answered', () => {
    const pendingCard = SCRAPPY_DECK.find((c) => c.kind === 'decision')!;
    const pending = {
      ...atTheWall(),
      pendingEvent: pendingCard,
      drawnEventIds: [pendingCard.id],
    };
    const pinned = reduce(pending, PIN);
    expect(pinned.cliffhangerCardId).toBeTruthy();
    expect(pinned.cliffhangerCardId).not.toBe(pendingCard.id);
    // Frozen until answered: the pin survives the blocked tick.
    expect(tick(pinned).cliffhangerCardId).toBe(pinned.cliffhangerCardId);
    const answered = reduce(pinned, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    expect(tick(answered).pendingEvent?.id).toBe(pinned.cliffhangerCardId);
  });

  it('does nothing once the run is over', () => {
    const over: GameState = { ...atTheWall(), gameOver: 'bankruptcy' };
    expect(reduce(over, PIN)).toBe(over);
  });

  it('loads a save from before cliffhangers with nothing pinned', () => {
    const { cliffhangerCardId: _pin, lastCliffhangerWeek: _week, ...old } = atTheWall();
    const loaded = normalizeSave(old as GameState);
    expect(cliffhangerCardFor(loaded)).toBeNull();
    expect(reduce(loaded, PIN).cliffhangerCardId).toBeTruthy();
    expect(tick(loaded).pendingEvent).toBeNull();
  });
});

describe('teasers', () => {
  it('every pinnable decision card has its own teaser', () => {
    const pinnable = [...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK].filter(
      (card) => card.kind === 'decision' && !card.choices?.some((choice) => choice.effects.acquisitionOffer),
    );
    for (const card of pinnable) expect(card.teaser, card.id).toBeTruthy();
  });
});
