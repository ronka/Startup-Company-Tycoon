import { describe, expect, it } from 'vitest';

import {
  REENGAGEMENT_HOUR,
  REMINDER_SEQUENCE,
  secondsUntilNextLocalHour,
  secondsUntilReminder,
  secondsUntilWeeksBack,
} from '../notification-schedule';

describe('secondsUntilNextLocalHour', () => {
  it('targets today when now is before the hour', () => {
    expect(secondsUntilNextLocalHour(new Date(2026, 6, 25, 7, 0, 0), 9)).toBe(7200);
  });

  it('targets tomorrow when now is past the hour', () => {
    expect(secondsUntilNextLocalHour(new Date(2026, 6, 25, 10, 0, 0), 9)).toBe(82800);
  });

  it('targets tomorrow when now lands exactly on the hour, never 0', () => {
    expect(secondsUntilNextLocalHour(new Date(2026, 6, 25, 9, 0, 0), 9)).toBe(86400);
  });

  it('names the same instant when recomputed through an evening', () => {
    // The whole point of an absolute target: a player who backgrounds the app
    // twice in one evening must not push the nudge past the morning slot.
    const now1 = new Date(2026, 6, 25, 20, 0, 0);
    const now2 = new Date(2026, 6, 25, 20, 30, 0);
    expect(now1.getTime() + secondsUntilNextLocalHour(now1, 9) * 1000).toBe(
      now2.getTime() + secondsUntilNextLocalHour(now2, 9) * 1000,
    );
  });

  it('rolls over the end of a month', () => {
    const now = new Date(2026, 6, 31, 23, 0, 0);
    const seconds = secondsUntilNextLocalHour(now, 9);
    expect(seconds).toBeGreaterThan(0);
    const target = new Date(now.getTime() + seconds * 1000);
    expect([target.getFullYear(), target.getMonth(), target.getDate(), target.getHours()]).toEqual([
      2026, 7, 1, 9,
    ]);
  });

  it('is always strictly positive, whatever hour of the day it is called at', () => {
    for (let h = 0; h < 24; h += 1) {
      expect(secondsUntilNextLocalHour(new Date(2026, 6, 25, h, 0, 0), REENGAGEMENT_HOUR)).toBeGreaterThan(0);
    }
  });
});

describe('secondsUntilReminder', () => {
  const HOUR = 9;

  it('matches the single nudge on day 1', () => {
    const now = new Date(2026, 8, 29, 22, 15);
    expect(secondsUntilReminder(now, HOUR, 1)).toBe(secondsUntilNextLocalHour(now, HOUR));
  });

  it('lands on local 09:00 two and six days after day 1', () => {
    const now = new Date(2026, 8, 29, 22, 15);
    const day3 = new Date(now.getTime() + secondsUntilReminder(now, HOUR, 3) * 1000);
    const day7 = new Date(now.getTime() + secondsUntilReminder(now, HOUR, 7) * 1000);
    expect([day3.getMonth(), day3.getDate(), day3.getHours(), day3.getMinutes()]).toEqual([9, 2, 9, 0]);
    expect([day7.getMonth(), day7.getDate(), day7.getHours(), day7.getMinutes()]).toEqual([9, 6, 9, 0]);
  });

  it('counts day 1 as today when called before 09:00', () => {
    const now = new Date(2026, 8, 29, 7, 0);
    const day3 = new Date(now.getTime() + secondsUntilReminder(now, HOUR, 3) * 1000);
    expect([day3.getDate(), day3.getHours()]).toEqual([1, 9]);
  });

  it('gives every reminder in the sequence a distinct id', () => {
    expect(new Set(REMINDER_SEQUENCE.map((r) => r.id)).size).toBe(REMINDER_SEQUENCE.length);
  });
});

describe('secondsUntilWeeksBack', () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m, 0);

  it('lands exactly when the bank is full, in waking hours', () => {
    expect(secondsUntilWeeksBack(at(14), at(20))).toEqual({ seconds: 6 * 3600 });
  });

  it('stays quiet overnight, from 22:00 until 08:00', () => {
    expect(secondsUntilWeeksBack(at(17), at(22))).toEqual({ skipped: 'quiet_hours' });
    expect(secondsUntilWeeksBack(at(1), at(7, 59))).toEqual({ skipped: 'quiet_hours' });
    expect(secondsUntilWeeksBack(at(2), at(8))).not.toEqual({ skipped: 'quiet_hours' });
  });

  it('defers to the 09:00 nudge when it would land within an hour of it', () => {
    expect(secondsUntilWeeksBack(at(3), at(8, 30))).toEqual({ skipped: 'near_morning_nudge' });
    expect(secondsUntilWeeksBack(at(4), at(9, 59))).toEqual({ skipped: 'near_morning_nudge' });
    expect(secondsUntilWeeksBack(at(4), at(10))).toEqual({ seconds: 6 * 3600 });
  });

  it('skips a bank that is already full', () => {
    expect(secondsUntilWeeksBack(at(14), at(14))).toEqual({ skipped: 'passed' });
  });
});
