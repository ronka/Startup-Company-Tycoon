import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import { GameState } from '../../game/types';
import { LOW_RUNWAY_WARNING_WEEKS, notificationContentFor } from '../notification-content';

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
    const s: GameState = { ...newGame('Acme', 1), cash: 50_000_000 };
    const content = notificationContentFor(s);
    expect(content?.title).toBe('Startup Empire Tycoon');
    expect(content?.body).toContain(`Week ${s.week}`);
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
