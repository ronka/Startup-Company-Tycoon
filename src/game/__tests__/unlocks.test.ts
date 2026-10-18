import { describe, expect, it } from 'vitest';

import { newGame, reduce } from '../engine';
import type { GameState } from '../types';
import {
  FEATURES,
  isGuided,
  newlyCompletedQuests,
  nextQuest,
  QUESTS,
  unlockConditionFor,
  unlockedFeatures,
} from '../unlocks';

const guided = (overrides: Partial<GameState> = {}): GameState => ({
  ...newGame('Test Co', 1),
  unlockSchedule: 'guided-ui',
  questsDone: [],
  ...overrides,
});

describe('unlock ladder', () => {
  it('leaves runs without a schedule fully unlocked, with no quests', () => {
    const state = newGame('Test Co', 1);
    expect(isGuided(state)).toBe(false);
    expect([...unlockedFeatures(state)].sort()).toEqual([...FEATURES].sort());
    expect(nextQuest(state)).toBeNull();
    expect(newlyCompletedQuests(state)).toEqual([]);
  });

  it('opens week 0 on hiring the first developer, with everything locked', () => {
    const state = guided();
    expect(unlockedFeatures(state).size).toBe(0);
    expect(nextQuest(state)).toMatchObject({ id: 'hire-dev', number: 1, total: QUESTS.length, progress: 0, goal: 1 });
  });

  it('counts a queued hire straight away, before the week ticks', () => {
    const state = reduce(guided(), { type: 'SET_PENDING_HIRES', role: 'devs', delta: 1 });
    expect(newlyCompletedQuests(state)).toEqual(['hire-dev']);
    expect(nextQuest(state)?.id).toBe('hire-sales');
  });

  it('unlocks Money at 10 customers', () => {
    const state = guided({ questsDone: ['hire-dev', 'hire-sales', 'first-customer'], customers: 10.4 });
    expect(newlyCompletedQuests(state)).toEqual(['ten-customers']);
    expect(unlockedFeatures(state).has('money')).toBe(true);
    expect(nextQuest(state)?.id).toBe('income');
  });

  it('backstops Money at week 6 even with no customers', () => {
    expect(unlockedFeatures(guided({ week: 5 })).has('money')).toBe(false);
    expect(unlockedFeatures(guided({ week: 6 })).has('money')).toBe(true);
  });

  it('opens Money straight away in a runway crisis', () => {
    const broke = guided({ cash: 20_000, pendingHeadcount: { devs: 2, sales: 1, support: 0 }, headcount: { devs: 2, sales: 1, support: 0 } });
    expect(unlockedFeatures(broke).has('money')).toBe(true);
  });

  it('keeps a recorded unlock open when the numbers fall back', () => {
    // Money was unlocked at 10 customers; churn has since taken them back to 4.
    const state = guided({ questsDone: ['hire-dev', 'hire-sales', 'first-customer', 'ten-customers'], customers: 4 });
    expect(unlockedFeatures(state).has('money')).toBe(true);
    expect(newlyCompletedQuests(state)).toEqual([]);
  });

  it('does not bring a done quest back when its numbers drop', () => {
    const state = guided({ questsDone: ['hire-dev'] }); // the only dev was let go
    expect(nextQuest(state)?.id).toBe('hire-sales');
  });

  it('records quests met out of order without skipping the earlier ones', () => {
    // Organic leads can bring a customer before any salesperson is hired.
    const state = guided({ questsDone: ['hire-dev'], customers: 1 });
    expect(newlyCompletedQuests(state)).toEqual(['first-customer']);
    expect(nextQuest(state)?.id).toBe('hire-sales');
  });

  it('opens everything by the week-12 backstop', () => {
    const state = guided({ week: 12, pendingHeadcount: { devs: 1, sales: 1, support: 0 }, customers: 1 });
    expect([...unlockedFeatures(state)].sort()).toEqual([...FEATURES].sort());
    expect(nextQuest(state)).toBeNull();
  });

  it('describes when each locked feature opens', () => {
    for (const feature of FEATURES) expect(unlockConditionFor(feature)).toMatch(/^Unlocks at /);
  });
});
