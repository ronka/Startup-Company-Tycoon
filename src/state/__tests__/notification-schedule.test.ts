import { describe, expect, it } from 'vitest';

import { REENGAGEMENT_HOUR, secondsUntilNextLocalHour } from '../notification-schedule';

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
