import { describe, expect, it } from 'vitest';

import { newGame, reduce, tick } from '../../engine';
import { GameState } from '../../types';
import { applyEventEffects } from '../apply';
import { drawCadenceWeeks, drawCard } from '../deck';
import { SCRAPPY_DECK } from '../scrappy';
import { EventCard } from '../types';

const ALL_EVENT_IDS = SCRAPPY_DECK.map((c) => c.id);

/** Advance one week, auto-answering the first choice of any decision that blocks it. */
function tickAutoAnswer(state: GameState): GameState {
  let s = tick(state);
  if (s.pendingEvent) {
    s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    s = tick(s);
  }
  return s;
}

describe('drawCadenceWeeks', () => {
  it('always returns a value in [2, 4]', () => {
    let s: GameState = newGame(1);
    for (let i = 0; i < 100; i++) {
      const [weeks, rng] = drawCadenceWeeks(s.rng);
      expect(weeks).toBeGreaterThanOrEqual(2);
      expect(weeks).toBeLessThanOrEqual(4);
      s = { ...s, rng };
    }
  });
});

describe('draw cadence in play', () => {
  it('news entries land 2-4 weeks apart', () => {
    let s: GameState = newGame(7);
    const newsWeeks: number[] = [];
    for (let i = 0; i < 60 && newsWeeks.length < 6; i++) {
      const before = s.newsLog.length;
      s = tickAutoAnswer(s);
      // Weekly-digest entries (kind: 'digest') also append to newsLog on
      // ticks with no card draw; isolate the card entry to test cadence.
      const added = s.newsLog.slice(0, s.newsLog.length - before);
      const cardEntry = added.find((entry) => entry.kind !== 'digest');
      if (cardEntry) newsWeeks.push(cardEntry.week);
    }
    expect(newsWeeks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < newsWeeks.length; i++) {
      const gap = newsWeeks[i] - newsWeeks[i - 1];
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(4);
    }
  });
});

describe('decision cards block TICK', () => {
  it('TICK is a no-op while pendingEvent is set, and resumes after ANSWER_EVENT', () => {
    let s: GameState = newGame(3);
    let weeks = 0;
    while (!s.pendingEvent && weeks < 30) {
      s = tick(s);
      weeks++;
    }
    expect(s.pendingEvent).not.toBeNull();

    const weekWhenBlocked = s.week;
    const stillBlocked = tick(s);
    expect(stillBlocked.week).toBe(weekWhenBlocked);
    expect(stillBlocked.pendingEvent).toEqual(s.pendingEvent);

    const answered = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    expect(answered.pendingEvent).toBeNull();

    const resumed = tick(answered);
    expect(resumed.week).toBe(weekWhenBlocked + 1);
  });
});

describe('applyEventEffects', () => {
  it('applies exactly the declared deltas', () => {
    const s0 = newGame(1);
    const s1 = applyEventEffects(s0, {
      deltas: [
        { stat: 'cash', amount: 1000 },
        { stat: 'morale', amount: -5 },
        { stat: 'hype', amount: 0.1 },
        { stat: 'productQuality', amount: 20 },
        { stat: 'marketShare', amount: 0.01 },
      ],
    });
    expect(s1.cash).toBe(s0.cash + 1000);
    expect(s1.morale).toBe(s0.morale - 5);
    expect(s1.hype).toBeCloseTo(s0.hype + 0.1);
    expect(s1.productQuality).toBe(s0.productQuality + 20);
    expect(s1.marketShare).toBeCloseTo(s0.marketShare + 0.01);
  });

  it('pushes a timedEffect onto activeTimedEffects', () => {
    const s0 = newGame(1);
    const s1 = applyEventEffects(s0, {
      timedEffect: { stat: 'hype', multiplier: 1.5, weeksLeft: 3 },
    });
    expect(s1.activeTimedEffects).toEqual([{ stat: 'hype', multiplier: 1.5, weeksLeft: 3 }]);
  });
});

describe('timed effects expire on schedule', () => {
  it('applies for exactly weeksLeft ticks, then is gone', () => {
    let s: GameState = {
      ...newGame(1),
      activeTimedEffects: [{ stat: 'hype', multiplier: 2, weeksLeft: 2 }],
      drawnEventIds: ALL_EVENT_IDS, // isolate from further draws
    };
    expect(s.activeTimedEffects).toHaveLength(1);
    s = tick(s);
    expect(s.activeTimedEffects).toHaveLength(1); // 1 week left
    s = tick(s);
    expect(s.activeTimedEffects).toHaveLength(0); // expired
  });
});

describe('deck never repeats a card', () => {
  it('drawCard excludes already-drawn ids', () => {
    const s0 = newGame(2);
    const drawn: string[] = [];
    let rng = s0.rng;
    for (let i = 0; i < SCRAPPY_DECK.length; i++) {
      const draw = drawCard(SCRAPPY_DECK, drawn, rng);
      expect(draw.card).not.toBeNull();
      expect(drawn).not.toContain(draw.card!.id);
      drawn.push(draw.card!.id);
      rng = draw.rng;
    }
    expect(new Set(drawn).size).toBe(SCRAPPY_DECK.length);
    // Deck exhausted: one more draw returns null.
    const exhausted = drawCard(SCRAPPY_DECK, drawn, rng);
    expect(exhausted.card).toBeNull();
  });

  it('a full playthrough never logs the same card id twice', () => {
    let s: GameState = newGame(11);
    for (let i = 0; i < 200; i++) s = tickAutoAnswer(s);
    const ids = s.drawnEventIds;
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('determinism with events on', () => {
  it('same seed ⇒ identical state after 60 ticks, auto-answering decisions', () => {
    let a: GameState = newGame(21);
    let b: GameState = newGame(21);
    for (let i = 0; i < 60; i++) {
      a = tickAutoAnswer(a);
      b = tickAutoAnswer(b);
    }
    expect(a).toEqual(b);
  });
});

describe('adding a card requires zero engine changes', () => {
  it('a test-only card drawn from a throwaway deck resolves via the same generic path', () => {
    const testCard: EventCard = {
      id: 'test-only-card',
      era: 'scrappy',
      kind: 'news',
      title: 'Test Card',
      flavor: 'This card exists only in this test file.',
      effects: { deltas: [{ stat: 'hype', amount: 0.42 }] },
    };
    const s0 = newGame(1);
    const draw = drawCard([testCard], [], s0.rng);
    expect(draw.card).toEqual(testCard);
    const applied = applyEventEffects(s0, draw.card!.effects!);
    expect(applied.hype).toBeCloseTo(s0.hype + 0.42);
  });
});
