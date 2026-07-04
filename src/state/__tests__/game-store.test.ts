import { describe, expect, it } from 'vitest';

import { newGame } from '@/game/engine';

import { storeReducer } from '../game-store';

describe('storeReducer — SET_FOCUS dispatch path', () => {
  it('switches focus, stamps the week, and appends a news entry', () => {
    const state = { ...newGame(1), week: 5 };

    const next = storeReducer(state, { type: 'SET_FOCUS', focus: 'ai' });

    expect(next).not.toBeNull();
    expect(next?.focus).toBe('ai');
    expect(next?.focusChangedWeek).toBe(5);
    expect(next?.newsLog.length).toBe(state.newsLog.length + 1);
    expect(next?.newsLog[0].title).toContain('AI');
  });

  it('is a no-op when re-selecting the current focus', () => {
    const state = newGame(1);

    const next = storeReducer(state, { type: 'SET_FOCUS', focus: state.focus });

    expect(next).toBe(state);
  });

  it('is a no-op when there is no active run', () => {
    const next = storeReducer(null, { type: 'SET_FOCUS', focus: 'ai' });

    expect(next).toBeNull();
  });
});
