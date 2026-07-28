import { describe, expect, it } from 'vitest';

import { newGame } from '@/game/engine';

import { storeReducer } from '../game-store';

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
