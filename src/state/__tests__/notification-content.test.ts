import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import { GameState } from '../../game/types';
import { ROUND_ORDER } from '../../game/types';
import { actionNowFor, tomorrowAgendaFor } from '../day-close';
import {
  LOW_RUNWAY_WARNING_WEEKS,
  notificationContentFor,
  progressReminderContentFor,
  weeksBackContentFor,
} from '../notification-content';
import { WEEKS_BANK_CAP } from '../week-budget';

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

  it('names an available raise, which the panel shows as a tip instead', () => {
    const s: GameState = { ...newGame('Acme', 1), cash: 50_000_000 };
    expect(actionNowFor(s)?.kind).toBe('raise');
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

  it('climbs the same rung as the end-of-day panel, except where a raise is waiting', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const s of [newGame('Acme', seed), { ...newGame('Acme', seed), roundsRaised: ROUND_ORDER.length }]) {
        const expected = actionNowFor(s) && ['event-soon', 'steady'].includes(tomorrowAgendaFor(s)!.kind)
          ? 'raise'
          : tomorrowAgendaFor(s)?.kind;
        expect(notificationContentFor(s)?.kind).toBe(expected);
      }
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

describe('weeksBackContentFor', () => {
  it('names the full bank and the company', () => {
    const content = weeksBackContentFor(newGame('Acme', 1));
    expect(content?.kind).toBe('weeks_back');
    expect(content?.body).toContain(`${WEEKS_BANK_CAP} free weeks`);
    expect(content?.body).toContain('Acme');
  });

  it('is null with no live run', () => {
    expect(weeksBackContentFor(null)).toBeNull();
    expect(weeksBackContentFor({ ...newGame('Acme', 1), gameOver: 'bankruptcy', finalScore: 0 })).toBeNull();
  });
});
