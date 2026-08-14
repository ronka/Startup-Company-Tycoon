import { describe, expect, it } from 'vitest';

import { acquisitionOfferValuationFor, EVENT_MARKET_SHARE_CUSTOMER_SCALE, weeklyStatsFor } from '../../balance';
import { newGame, reduce, tick } from '../../engine';
import { GameState } from '../../types';
import { applyEventEffects } from '../apply';
import { BOOM_DECK } from '../boom';
import { drawCadenceWeeks, drawCard, drawFillerCard } from '../deck';
import { FILLER_DECK } from '../fillers';
import { RECKONING_DECK } from '../reckoning';
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
    let s: GameState = newGame('Acme', 1);
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
    let s: GameState = newGame('Acme', 7);
    const newsWeeks: number[] = [];
    for (let i = 0; i < 60 && newsWeeks.length < 6; i++) {
      const before = s.newsLog.length;
      s = tickAutoAnswer(s);
      // Weekly-digest entries (kind: 'digest') and trend phase changes
      // (kind: 'trend') also append to newsLog on ticks with no card draw;
      // isolate the actual card entry to test cadence.
      const added = s.newsLog.slice(0, s.newsLog.length - before);
      const cardEntry = added.find((entry) => entry.kind !== 'digest' && entry.kind !== 'trend');
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
    let s: GameState = newGame('Acme', 3);
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
    const s0 = newGame('Acme', 1);
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
    // A market-share card's swing only partially lands as customers (see
    // EVENT_MARKET_SHARE_CUSTOMER_SCALE), so the derived share moves by the scaled amount.
    expect(s1.marketShare).toBeCloseTo(s0.marketShare + 0.01 * EVENT_MARKET_SHARE_CUSTOMER_SCALE);
  });

  it('pushes a timedEffect onto activeTimedEffects', () => {
    const s0 = newGame('Acme', 1);
    const s1 = applyEventEffects(s0, {
      timedEffect: { stat: 'hype', multiplier: 1.5, weeksLeft: 3 },
    });
    expect(s1.activeTimedEffects).toEqual([{ stat: 'hype', multiplier: 1.5, weeksLeft: 3 }]);
  });
});

describe('timed effects expire on schedule', () => {
  it('applies for exactly weeksLeft ticks, then is gone', () => {
    let s: GameState = {
      ...newGame('Acme', 1),
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
    const s0 = newGame('Acme', 2);
    const drawn: string[] = [];
    let rng = s0.rng;
    for (let i = 0; i < SCRAPPY_DECK.length; i++) {
      const draw = drawCard(SCRAPPY_DECK, drawn, [], rng);
      expect(draw.card).not.toBeNull();
      expect(drawn).not.toContain(draw.card!.id);
      drawn.push(draw.card!.id);
      rng = draw.rng;
    }
    expect(new Set(drawn).size).toBe(SCRAPPY_DECK.length);
    // Deck exhausted: one more draw returns null.
    const exhausted = drawCard(SCRAPPY_DECK, drawn, [], rng);
    expect(exhausted.card).toBeNull();
  });

  it('a full playthrough never logs the same card id twice', () => {
    let s: GameState = newGame('Acme', 11);
    for (let i = 0; i < 200; i++) s = tickAutoAnswer(s);
    const ids = s.drawnEventIds;
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('determinism with events on', () => {
  it('same seed ⇒ identical state after 60 ticks, auto-answering decisions', () => {
    let a: GameState = newGame('Acme', 21);
    let b: GameState = newGame('Acme', 21);
    for (let i = 0; i < 60; i++) {
      a = tickAutoAnswer(a);
      b = tickAutoAnswer(b);
    }
    expect(a).toEqual(b);
  });
});

describe('acquisition offers', () => {
  const FEELER_ID = 'scrappy-acquisition-feeler';
  const feeler = SCRAPPY_DECK.find((c) => c.id === FEELER_ID)!;
  const acceptIndex = feeler.choices!.findIndex((c) => c.effects.acquisitionOffer);
  const declineIndex = 1 - acceptIndex;

  it('offer size derives from current valuation', () => {
    const low = acquisitionOfferValuationFor(1_000_000, 1.2);
    const high = acquisitionOfferValuationFor(2_000_000, 1.2);
    expect(low).toBeCloseTo(1_200_000);
    expect(high).toBeGreaterThan(low);
  });

  it('accepting ends the run as "acquired" with the correct score', () => {
    let s: GameState = {
      ...newGame('Acme', 30),
      pendingEvent: feeler,
      founderEquity: 0.5,
      productQuality: 1_000_000,
      marketShare: 1,
    };
    const { valuation } = weeklyStatsFor(s);
    s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: acceptIndex });
    expect(s.gameOver).toBe('acquired');
    expect(s.pendingEvent).toBeNull();
    expect(s.finalScore).toBeCloseTo(0.5 * acquisitionOfferValuationFor(valuation, 1.2));
  });

  it('declining applies the card-stated side effects and keeps the run going', () => {
    let s: GameState = { ...newGame('Acme', 31), pendingEvent: feeler };
    const before = s;
    s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: declineIndex });
    expect(s.gameOver).toBeNull();
    expect(s.pendingEvent).toBeNull();
    expect(s.hype).toBeCloseTo(before.hype + 0.05);
    expect(s.morale).toBe(before.morale - 2);
  });

  it('a bare sim (auto-answers first choice) never stalls on an acquisition card', () => {
    let s: GameState = { ...newGame('Acme', 32), pendingEvent: feeler };
    s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    // pendingEvent always clears, whichever way choice 0 resolves (here,
    // decline-and-continue) — tick() is free to advance again immediately.
    expect(s.pendingEvent).toBeNull();
    const resumed = tick(s);
    expect(resumed.week).toBe(s.week + 1);
  });
});

describe('era-gated decks (Task 6)', () => {
  it('the Boom deck never draws while the run is in Scrappy', () => {
    let s: GameState = newGame('Acme', 60);
    for (let i = 0; i < 40; i++) {
      s = tickAutoAnswer(s);
      // Stop the moment the run leaves Scrappy. The tick that *enters* Boom is
      // allowed to draw a Boom card — the deck is picked from the era as it
      // stands at the draw, and `boomStartWeek` is that same week. Asserting
      // past this point tests the wrong era.
      if (s.era !== 'scrappy') break;
      const drawnBoomCards = s.newsLog.filter((entry) =>
        BOOM_DECK.some((card) => card.title === entry.title),
      );
      expect(drawnBoomCards).toHaveLength(0);
    }
  });

  it('each era deck is disjoint: no card id appears in more than one era deck', () => {
    const ids = [...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('story flags (Task 6)', () => {
  const drama = SCRAPPY_DECK.find((c) => c.id === 'scrappy-cofounder-drama')!;
  const productLedIndex = drama.choices!.findIndex(
    (c) => c.effects.setsFlag === 'cofounder-product-led',
  );
  const growthLedIndex = 1 - productLedIndex;
  const followUp = BOOM_DECK.find((c) => c.id === 'boom-cofounder-drama-part-two')!;

  it('the follow-up card is locked out with no flags set', () => {
    const draw = drawCard([followUp], [], [], newGame('Acme', 1).rng);
    expect(draw.card).toBeNull();
  });

  it('choosing the flag-setting choice unlocks the follow-up card', () => {
    const s0 = newGame('Acme', 1);
    const s1 = reduce({ ...s0, pendingEvent: drama }, { type: 'ANSWER_EVENT', choiceIndex: productLedIndex });
    expect(s1.storyFlags).toContain('cofounder-product-led');

    const draw = drawCard([followUp], [], s1.storyFlags, s0.rng);
    expect(draw.card).toEqual(followUp);
  });

  it('choosing the other choice leaves the follow-up locked (choice-dependent)', () => {
    const s0 = newGame('Acme', 2);
    const s1 = reduce({ ...s0, pendingEvent: drama }, { type: 'ANSWER_EVENT', choiceIndex: growthLedIndex });
    expect(s1.storyFlags).not.toContain('cofounder-product-led');

    const draw = drawCard([followUp], [], s1.storyFlags, s0.rng);
    expect(draw.card).toBeNull();
  });
});

describe('repeatable filler pool (Task 6)', () => {
  it('draws a filler once the unique deck is exhausted, without adding it to drawnEventIds', () => {
    const draw = drawFillerCard(FILLER_DECK, [], newGame('Acme', 1).rng);
    expect(draw.card).not.toBeNull();
    expect(draw.card!.repeatable).toBe(true);
  });

  it('draws fillers (not silence) once the Scrappy deck is exhausted, and uniques still never repeat', () => {
    // Pinned far out so the run stays in Scrappy long enough to exhaust its
    // unique deck — isolates filler fallback from era-gating (Task 6 tests
    // era-gating separately).
    let s: GameState = {
      ...newGame('Acme', 11),
      cash: 50_000_000,
      boomStartWeek: 1000,
      reckoningStartWeek: 2000,
    };
    const fillerTitles = new Set(FILLER_DECK.map((c) => c.title));
    let sawFiller = false;

    for (let i = 0; i < 60; i++) {
      s = tickAutoAnswer(s);
      if (s.newsLog.some((entry) => fillerTitles.has(entry.title))) sawFiller = true;
    }

    expect(sawFiller).toBe(true);
    // Uniques (non-repeatable) still never repeat within drawnEventIds.
    const uniqueIds = s.drawnEventIds;
    expect(new Set(uniqueIds).size).toBe(uniqueIds.length);
    expect(uniqueIds).toEqual(expect.arrayContaining(ALL_EVENT_IDS));
  });
});

describe('deck content (Task 7)', () => {
  const ALL_DECKS = [...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK];

  it('has 30–50 total cards across the three era decks', () => {
    expect(ALL_DECKS.length).toBeGreaterThanOrEqual(30);
    expect(ALL_DECKS.length).toBeLessThanOrEqual(50);
  });

  it('has at least 5 genuine dilemma cards — both choices cost something', () => {
    const isCost = (delta: { amount: number }) => delta.amount < 0;
    const dilemmas = ALL_DECKS.filter(
      (card) =>
        card.kind === 'decision' &&
        card.choices &&
        card.choices.length === 2 &&
        card.choices.every((choice) => (choice.effects.deltas ?? []).some(isCost)),
    );
    expect(dilemmas.length).toBeGreaterThanOrEqual(5);
  });

  it('no dead-air stretch longer than ~6 weeks across a 100-week playthrough', () => {
    let s: GameState = { ...newGame('Acme', 70), cash: 50_000_000 };
    const eventfulWeeks = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const before = s.newsLog.length;
      s = tickAutoAnswer(s);
      if (s.newsLog.length > before) eventfulWeeks.add(s.week);
    }
    const weeks = [...eventfulWeeks].sort((a, b) => a - b);
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i] - weeks[i - 1]).toBeLessThanOrEqual(6);
    }
  });

  describe('chained story arcs respect flags and fire in order', () => {
    it('"First Big Customer" → "That First Customer, All Grown Up" (Scrappy → Boom)', () => {
      const setter = SCRAPPY_DECK.find((c) => c.id === 'scrappy-first-big-customer')!;
      const followUp = BOOM_DECK.find((c) => c.id === 'boom-demanding-customer-returns')!;
      const crunchIndex = setter.choices!.findIndex(
        (c) => c.effects.setsFlag === 'crunched-for-first-customer',
      );

      const s0 = newGame('Acme', 1);
      expect(drawCard([followUp], [], s0.storyFlags, s0.rng).card).toBeNull();

      const s1 = reduce({ ...s0, pendingEvent: setter }, { type: 'ANSWER_EVENT', choiceIndex: crunchIndex });
      expect(drawCard([followUp], [], s1.storyFlags, s0.rng).card).toEqual(followUp);
    });

    it('"An Early Feeler" (decline) → "Second Thoughts" (Scrappy → Reckoning)', () => {
      const setter = SCRAPPY_DECK.find((c) => c.id === 'scrappy-acquisition-feeler')!;
      const followUp = RECKONING_DECK.find((c) => c.id === 'reckoning-regret-the-decline')!;
      const declineIndex = setter.choices!.findIndex(
        (c) => c.effects.setsFlag === 'declined-early-acquisition',
      );

      const s0 = newGame('Acme', 1);
      expect(drawCard([followUp], [], s0.storyFlags, s0.rng).card).toBeNull();

      const s1 = reduce({ ...s0, pendingEvent: setter }, { type: 'ANSWER_EVENT', choiceIndex: declineIndex });
      expect(drawCard([followUp], [], s1.storyFlags, s0.rng).card).toEqual(followUp);
    });

    it('a real playthrough only ever draws a follow-up after its flag-setting card, never before', () => {
      let s: GameState = { ...newGame('Acme', 5), cash: 50_000_000 };
      const followUpIds = ['boom-cofounder-drama-part-two', 'boom-demanding-customer-returns', 'reckoning-regret-the-decline'];
      const requiredFlagFor: Record<string, string> = {
        'boom-cofounder-drama-part-two': 'cofounder-product-led',
        'boom-demanding-customer-returns': 'crunched-for-first-customer',
        'reckoning-regret-the-decline': 'declined-early-acquisition',
      };

      for (let i = 0; i < 150 && s.week < 150; i++) {
        s = tick(s);
        if (s.pendingEvent && followUpIds.includes(s.pendingEvent.id)) {
          expect(s.storyFlags).toContain(requiredFlagFor[s.pendingEvent.id]);
        }
        if (s.pendingEvent) {
          s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
        }
      }
    });
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
    const s0 = newGame('Acme', 1);
    const draw = drawCard([testCard], [], [], s0.rng);
    expect(draw.card).toEqual(testCard);
    const applied = applyEventEffects(s0, draw.card!.effects!);
    expect(applied.hype).toBeCloseTo(s0.hype + 0.42);
  });
});
