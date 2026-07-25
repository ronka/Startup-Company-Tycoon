import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import { GameState } from '../../game/types';
import { tomorrowAgendaFor } from '../day-close';

/** A run with enough cash that the runway branch can never fire. */
function healthy(overrides: Partial<GameState> = {}): GameState {
  return { ...newGame('Acme', 1), cash: 50_000_000, ...overrides };
}

describe('tomorrowAgendaFor', () => {
  it('is null with no active game', () => {
    expect(tomorrowAgendaFor(null)).toBeNull();
  });

  it('is null once the run has ended', () => {
    const s: GameState = { ...newGame('Acme', 1), gameOver: 'bankruptcy', finalScore: 0 };
    expect(tomorrowAgendaFor(s)).toBeNull();
  });

  it('prioritizes a pending decision over everything else', () => {
    const s: GameState = {
      ...newGame('Acme', 1),
      week: 34,
      cash: 10, // would otherwise trigger the low-runway branch
      pendingEvent: {
        id: 'x',
        era: 'scrappy',
        kind: 'decision',
        title: 'Series A term sheet',
        flavor: '...',
        choices: [{ label: 'Sign', effects: {} }],
      },
    };
    const agenda = tomorrowAgendaFor(s);
    expect(agenda?.kind).toBe('decision');
    expect(agenda?.line).toContain('Series A term sheet');
  });

  it('names a low-runway scare when no decision is pending', () => {
    // Plenty of cash but sky-high burn (many devs, high salary role) => tiny runway.
    const s: GameState = {
      ...newGame('Acme', 1),
      cash: 1_000,
      headcount: { devs: 50, sales: 50, support: 50 },
      pendingHeadcount: { devs: 50, sales: 50, support: 50 },
    };
    const agenda = tomorrowAgendaFor(s);
    expect(agenda?.kind).toBe('runway');
    expect(agenda?.line).toMatch(/Runway is down to \d+ weeks/);
  });

  it('points at an available raise when the run is otherwise healthy', () => {
    const agenda = tomorrowAgendaFor(healthy());
    expect(agenda?.kind).toBe('raise');
    expect(agenda?.line).toContain('raise');
  });

  it('teases a card landing soon once the raise is on cooldown', () => {
    const base = healthy();
    const twoWeeks = tomorrowAgendaFor({
      ...base,
      lastRoundRaisedWeek: base.week,
      weeksUntilNextEvent: 2,
    });
    expect(twoWeeks?.kind).toBe('event-soon');
    expect(twoWeeks?.line).toContain('2 weeks');

    const oneWeek = tomorrowAgendaFor({
      ...base,
      lastRoundRaisedWeek: base.week,
      weeksUntilNextEvent: 1,
    });
    expect(oneWeek?.kind).toBe('event-soon');
    expect(oneWeek?.line).toContain('1 week');
    expect(oneWeek?.line).not.toContain('1 weeks');
  });

  it('falls back to steady when the deck is exhausted', () => {
    // NO_MORE_EVENTS parks weeksUntilNextEvent at MAX_SAFE_INTEGER; without the
    // upper bound in the ladder this would render "within 9007199254740991 weeks".
    const base = healthy();
    const agenda = tomorrowAgendaFor({
      ...base,
      roundsRaised: 3,
      lastRoundRaisedWeek: base.week,
      weeksUntilNextEvent: Number.MAX_SAFE_INTEGER,
    });
    expect(agenda?.kind).toBe('steady');
    expect(agenda?.line).toContain('Acme');
  });

  it('always produces a non-empty line on every branch', () => {
    const base = healthy();
    const states: GameState[] = [
      { ...base, cash: 1_000, headcount: { devs: 50, sales: 50, support: 50 }, pendingHeadcount: { devs: 50, sales: 50, support: 50 } },
      base,
      { ...base, lastRoundRaisedWeek: base.week, weeksUntilNextEvent: 2 },
      { ...base, roundsRaised: 3, lastRoundRaisedWeek: base.week, weeksUntilNextEvent: Number.MAX_SAFE_INTEGER },
    ];
    const kinds = states.map((s) => {
      const agenda = tomorrowAgendaFor(s);
      expect(agenda?.line.length).toBeGreaterThan(0);
      return agenda?.kind;
    });
    // Each state above is built to land on a different rung of the ladder.
    expect(new Set(kinds).size).toBe(states.length);
  });
});
