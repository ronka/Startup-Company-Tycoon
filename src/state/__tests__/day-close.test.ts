import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import { GameState } from '../../game/types';
import { actionNowFor, raiseAvailable, tomorrowAgendaFor } from '../day-close';
import { ROUND_ORDER } from '../../game/types';

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

  it('never advertises a raise — that belongs to actionNowFor', () => {
    const s = healthy();
    expect(raiseAvailable(s)).toBe(true);
    expect(tomorrowAgendaFor(s)?.kind).not.toBe('raise');
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

describe('actionNowFor', () => {
  it('is null with no live run', () => {
    expect(actionNowFor(null)).toBeNull();
    expect(actionNowFor({ ...healthy(), gameOver: 'bankruptcy', finalScore: 0 })).toBeNull();
  });

  it('points at the Money tab when a raise is available', () => {
    const action = actionNowFor(healthy());
    expect(action?.kind).toBe('raise');
    expect(action?.href).toBe('/money');
    expect(action?.line).toBe('Investors are ready to talk.');
  });

  it('mentions thin runway when the raise is also the way out', () => {
    const s: GameState = {
      ...newGame('Acme', 1),
      cash: 1_000,
      headcount: { devs: 50, sales: 50, support: 50 },
      pendingHeadcount: { devs: 50, sales: 50, support: 50 },
    };
    expect(actionNowFor(s)?.line).toMatch(/Runway's thin/);
  });

  it('is null while the round is on cooldown or every round is raised', () => {
    const base = healthy();
    expect(actionNowFor({ ...base, lastRoundRaisedWeek: base.week })).toBeNull();
    expect(actionNowFor({ ...base, roundsRaised: ROUND_ORDER.length })).toBeNull();
  });

  it('stands down while a decision card owns the screen', () => {
    const s: GameState = {
      ...healthy(),
      pendingEvent: {
        id: 'x',
        era: 'scrappy',
        kind: 'decision',
        title: 'Series A term sheet',
        flavor: '...',
        choices: [{ label: 'Sign', effects: {} }],
      },
    };
    expect(actionNowFor(s)).toBeNull();
  });
});
