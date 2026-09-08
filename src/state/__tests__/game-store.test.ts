import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { posthog } from '@/analytics/posthog';
import { newGame } from '@/game/engine';

import { loadWeekBudget, storeReducer, WEEK_BUDGET_STORAGE_KEY } from '../game-store';
import {
  createInitialWeeksEnrollment,
  INITIAL_WEEKS_EXPERIMENT_STORAGE_KEY,
} from '../initial-weeks-experiment';
import { isRollBudgetExhausted, spendRoll, type RollBudget } from '../roll-budget';

afterEach(() => vi.restoreAllMocks());

describe('initial free-weeks enrollment', () => {
  it('persists assignment before the treatment budget and exposes only afterward', async () => {
    vi.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue();
    vi.spyOn(posthog, 'reloadFeatureFlagsAsync').mockResolvedValue({ 'initial-free-weeks-v1': 'test' });
    const getFlag = vi.spyOn(posthog, 'getFeatureFlag').mockReturnValue('test');

    const budget = await loadWeekBudget(true);

    expect(budget.weeksRemaining).toBe(10);
    expect(setItem.mock.calls[0][0]).toBe(INITIAL_WEEKS_EXPERIMENT_STORAGE_KEY);
    expect(setItem.mock.calls[1][0]).toBe(WEEK_BUDGET_STORAGE_KEY);
    expect(getFlag.mock.calls[0][1]).toEqual({ sendEvent: false });
    expect(getFlag.mock.calls[1][1]).toBeUndefined();
  });

  it('does not re-award treatment when an assignment marker survives without a budget', async () => {
    const enrollment = createInitialWeeksEnrollment('test', new Date('2026-09-08T10:00:00.000Z'));
    vi.spyOn(AsyncStorage, 'getItem').mockImplementation((key) =>
      Promise.resolve(key === INITIAL_WEEKS_EXPERIMENT_STORAGE_KEY ? JSON.stringify(enrollment) : null),
    );
    const reload = vi.spyOn(posthog, 'reloadFeatureFlagsAsync');

    const budget = await loadWeekBudget(true);

    expect(budget.weeksRemaining).toBe(5);
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps existing installs and failed flag requests on the ordinary five-week grant', async () => {
    vi.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
    const reload = vi.spyOn(posthog, 'reloadFeatureFlagsAsync').mockRejectedValue(new Error('offline'));
    const setItem = vi.spyOn(AsyncStorage, 'setItem');

    expect((await loadWeekBudget(false)).weeksRemaining).toBe(5);
    expect(reload).not.toHaveBeenCalled();

    expect((await loadWeekBudget(true)).weeksRemaining).toBe(5);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('storeReducer — SET_FOCUS dispatch path', () => {
  it('switches focus, stamps the week, and appends a news entry', () => {
    const state = { ...newGame('Acme', 1), week: 5 };

    const next = storeReducer(state, { type: 'SET_FOCUS', focus: 'ai' });

    expect(next).not.toBeNull();
    expect(next?.focus).toBe('ai');
    expect(next?.focusChangedWeek).toBe(5);
    expect(next?.newsLog.length).toBe(state.newsLog.length + 1);
    expect(next?.newsLog[0].title).toContain('AI');
  });

  it('is a no-op when re-selecting the current focus', () => {
    const state = newGame('Acme', 1);

    const next = storeReducer(state, { type: 'SET_FOCUS', focus: state.focus });

    expect(next).toBe(state);
  });

  it('is a no-op when there is no active run', () => {
    const next = storeReducer(null, { type: 'SET_FOCUS', focus: 'ai' });

    expect(next).toBeNull();
  });
});

describe('storeReducer — REVIVE dispatch path', () => {
  it('un-ends a bankrupt run through the store layer', () => {
    const bankrupt = { ...newGame('Acme', 1), cash: -40_000, weeksInTheRed: 3, gameOver: 'bankruptcy' as const, finalScore: 0 };

    const next = storeReducer(bankrupt, { type: 'REVIVE', reason: 'Your uncle died and left you his fortune.' });

    expect(next?.gameOver).toBeNull();
    expect(next?.finalScore).toBeNull();
    expect(next?.weeksInTheRed).toBe(0);
    expect(next?.cash).toBeGreaterThan(0);
    expect(next?.newsLog[0].flavor).toContain('uncle');
  });

  it('is a no-op when there is no active run', () => {
    expect(storeReducer(null, { type: 'REVIVE', reason: 'x' })).toBeNull();
  });
});

describe('storeReducer — ROLL_CANDIDATES dispatch path', () => {
  it('fills the seat through the real dispatch path', () => {
    const next = storeReducer(newGame('Acme', 1), { type: 'ROLL_CANDIDATES', role: 'cto' });

    expect(next?.cLevels.cto.offer?.candidates).toHaveLength(2);
  });

  it('is a no-op when there is no active run', () => {
    expect(storeReducer(null, { type: 'ROLL_CANDIDATES', role: 'cto' })).toBeNull();
  });

  /**
   * The budget gate itself lives in `dispatchWithSnapshot`, which is not
   * exported and needs a rendered provider to exercise. What is testable — and
   * what actually decides whether a spin is refused — is the predicate pair the
   * gate is built from, so pin those to the behaviour the gate depends on:
   * exhausted refuses, dev free play never does, and a spend is not reversible
   * by a second call.
   */
  it('refuses a spin exactly when the budget predicate says the wall is up', () => {
    const empty: RollBudget = { lastSessionDate: '2026-08-14', rollsRemaining: 0 };
    const spare: RollBudget = { lastSessionDate: '2026-08-14', rollsRemaining: 1 };

    expect(isRollBudgetExhausted(spare, false)).toBe(false);
    expect(isRollBudgetExhausted(spendRoll(spare), false)).toBe(true);
    expect(isRollBudgetExhausted(empty, true)).toBe(false); // dev free play
    // The gate reads `null` as "not loaded yet" and returns before spending,
    // so an unresolved read can never hand out a free spin.
    expect(isRollBudgetExhausted(null, false)).toBe(false);
  });
});

describe('storeReducer — NEW_GAME dispatch path', () => {
  it('produces a fresh run carrying the given company name', () => {
    const next = storeReducer(null, { type: 'NEW_GAME', companyName: 'Widgets Inc', seed: 42 });

    expect(next).not.toBeNull();
    expect(next?.companyName).toBe('Widgets Inc');
    expect(next?.week).toBe(0);
  });

  // The store duplicates the engine's NEW_GAME case, so a param added to
  // `newGame` can silently drop on the real dispatch path while engine tests pass.
  it('carries the founding logo through', () => {
    const next = storeReducer(null, { type: 'NEW_GAME', companyName: 'Widgets Inc', seed: 42, logo: '🚀' });

    expect(next?.companyLogo).toBe('🚀');
  });
});
