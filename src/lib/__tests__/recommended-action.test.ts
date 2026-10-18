import { describe, expect, it } from 'vitest';

import { newGame } from '@/game/engine';
import type { EventCard } from '@/game/events/types';
import type { GameState } from '@/game/types';
import { hudSlotAction, recommendedAction } from '@/lib/recommended-action';

const team = (devs: number, sales: number, support = 0) => ({ devs, sales, support });

const run = (overrides: Partial<GameState> = {}): GameState => ({
  ...newGame('Test Co', 1),
  unlockSchedule: 'guided-ui',
  questsDone: [],
  ...overrides,
});

describe('recommendedAction', () => {
  it('starts by hiring a developer, then a salesperson', () => {
    expect(recommendedAction(run()).id).toBe('hire-dev');
    expect(recommendedAction(run({ pendingHeadcount: team(1, 0) })).id).toBe('hire-sales');
  });

  it('answers a pending card before anything else', () => {
    const card: EventCard = { id: 'x', era: 'scrappy', kind: 'decision', title: 'X', flavor: '', choices: [] };
    expect(recommendedAction(run({ pendingEvent: card })).id).toBe('answer-card');
  });

  it('says Next week once the first two hires are in', () => {
    expect(recommendedAction(run({ pendingHeadcount: team(1, 1) }))).toMatchObject({ id: 'next-week', label: 'Next week' });
  });

  it('asks for support once enough customers are uncovered', () => {
    expect(recommendedAction(run({ pendingHeadcount: team(1, 1), customers: 24 })).id).toBe('next-week');
    expect(recommendedAction(run({ pendingHeadcount: team(1, 1), customers: 25 })).id).toBe('hire-support');
    expect(recommendedAction(run({ pendingHeadcount: team(1, 1, 1), customers: 60 })).id).toBe('next-week');
  });

  it('recommends raising only when runway is short and Money is unlocked', () => {
    const short = { pendingHeadcount: team(2, 1), headcount: team(2, 1), cash: 100_000, week: 3 };
    expect(recommendedAction(run(short)).id).toBe('raise'); // runway < 10 opens Money as a crisis backstop
    expect(recommendedAction(run({ ...short, cash: 200_000 })).id).toBe('next-week');
  });
});

describe('hudSlotAction', () => {
  it('puts the week-0 hires in the Next Week slot, then gives the slot back', () => {
    expect(hudSlotAction(run())?.id).toBe('hire-dev');
    expect(hudSlotAction(run({ pendingHeadcount: team(1, 0), questsDone: ['hire-dev'] }))?.id).toBe('hire-sales');
    expect(hudSlotAction(run({ pendingHeadcount: team(1, 1), questsDone: ['hire-dev', 'hire-sales'] }))).toBeNull();
  });

  it('never takes the slot outside a guided run', () => {
    expect(hudSlotAction(newGame('Test Co', 1))).toBeNull();
  });

  it('never takes the slot back once the hiring quests are done', () => {
    // The only dev was let go at week 8; Next Week must stay reachable.
    const later = run({ week: 8, questsDone: ['hire-dev', 'hire-sales', 'first-customer', 'ten-customers'], pendingHeadcount: team(0, 1) });
    expect(hudSlotAction(later)).toBeNull();
  });
});
