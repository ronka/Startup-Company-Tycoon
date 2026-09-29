import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import { GameState } from '../../game/types';
import { ROUND_ORDER } from '../../game/types';
import { tomorrowAgendaFor } from '../day-close';
import {
  LOW_RUNWAY_WARNING_WEEKS,
  notificationContentFor,
  progressReminderContentFor,
} from '../notification-content';

describe('notificationContentFor', () => {
  it('is null with no active game', () => {
    expect(notificationContentFor(null)).toBeNull();
  });

  it('is null once the run has ended', () => {
    const s: GameState = { ...newGame('Acme', 1), gameOver: 'bankruptcy', finalScore: 0 };
    expect(notificationContentFor(s)).toBeNull();
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
    const content = notificationContentFor(s);
    expect(content?.title).toContain('Week 34');
    expect(content?.body).toContain('Series A term sheet');
  });

  it('flags a low-runway scare when no decision is pending', () => {
    // Plenty of cash but sky-high burn (many devs, high salary role) => tiny runway.
    const s: GameState = {
      ...newGame('Acme', 1),
      cash: 1_000,
      headcount: { devs: 50, sales: 50, support: 50 },
      pendingHeadcount: { devs: 50, sales: 50, support: 50 },
    };
    const content = notificationContentFor(s);
    expect(content?.title).toBe('Runway warning');
    expect(content?.body).toMatch(/Runway is down to \d+ weeks\./);
  });

  it('falls back to a plain nudge when nothing is urgent', () => {
    const s: GameState = {
      ...newGame('Acme', 1),
      cash: 50_000_000,
      roundsRaised: ROUND_ORDER.length, // nothing left to raise
      weeksUntilNextEvent: 20, // nothing landing soon
    };
    const content = notificationContentFor(s);
    expect(content?.kind).toBe('steady');
    expect(content?.title).toBe('Startup Empire Tycoon');
    expect(content?.body).toContain(`Week ${s.week}`);
  });

  it('names an available raise, like the end-of-day panel does', () => {
    const s: GameState = { ...newGame('Acme', 1), cash: 50_000_000 };
    expect(tomorrowAgendaFor(s)?.kind).toBe('raise');
    const content = notificationContentFor(s);
    expect(content?.kind).toBe('raise');
    expect(content?.body).toContain('Money tab');
  });

  it('teases an event landing soon with the panel\'s own line', () => {
    const s: GameState = {
      ...newGame('Acme', 1),
      cash: 50_000_000,
      roundsRaised: ROUND_ORDER.length,
      weeksUntilNextEvent: 2,
    };
    const content = notificationContentFor(s);
    expect(content?.kind).toBe('event-soon');
    expect(content?.body).toBe(tomorrowAgendaFor(s)?.line);
  });

  it('always climbs the same rung as the end-of-day panel', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame('Acme', seed);
      expect(notificationContentFor(s)?.kind).toBe(tomorrowAgendaFor(s)?.kind);
    }
  });

  it('is deterministic for the same state', () => {
    const s = newGame('Acme', 7);
    expect(notificationContentFor(s)).toEqual(notificationContentFor(s));
  });

  it('LOW_RUNWAY_WARNING_WEEKS is a small, sane threshold', () => {
    expect(LOW_RUNWAY_WARNING_WEEKS).toBeGreaterThan(0);
    expect(LOW_RUNWAY_WARNING_WEEKS).toBeLessThan(10);
  });
});

describe('progressReminderContentFor', () => {
  it('is null with no live run', () => {
    expect(progressReminderContentFor(null)).toBeNull();
    const ended: GameState = { ...newGame('Acme', 1), gameOver: 'bankruptcy', finalScore: 0 };
    expect(progressReminderContentFor(ended)).toBeNull();
  });

  it('names the company and the player\'s stake', () => {
    const content = progressReminderContentFor(newGame('Acme', 1));
    expect(content?.kind).toBe('progress');
    expect(content?.title).toContain('Acme');
    expect(content?.body).toMatch(/^Your stake is /);
  });
});
