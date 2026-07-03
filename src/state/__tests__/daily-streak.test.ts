import { describe, expect, it } from 'vitest';

import { initialStreak, updateStreak, type StreakState } from '../daily-streak';
import { dateKey } from '../week-budget';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('initialStreak', () => {
  it('starts at day 1', () => {
    const streak = initialStreak(day(2026, 7, 3));
    expect(streak.streakDays).toBe(1);
    expect(streak.lastPlayedDate).toBe(dateKey(day(2026, 7, 3)));
  });
});

describe('updateStreak', () => {
  it('is a no-op within the same local day', () => {
    const streak: StreakState = { lastPlayedDate: dateKey(day(2026, 7, 3)), streakDays: 4 };
    expect(updateStreak(streak, day(2026, 7, 3, 23))).toEqual(streak);
  });

  it('extends the streak by 1 on a consecutive day', () => {
    const streak: StreakState = { lastPlayedDate: dateKey(day(2026, 7, 3)), streakDays: 4 };
    const next = updateStreak(streak, day(2026, 7, 4));
    expect(next.streakDays).toBe(5);
    expect(next.lastPlayedDate).toBe(dateKey(day(2026, 7, 4)));
  });

  it('forgives exactly one missed day: the streak still extends by 1', () => {
    const streak: StreakState = { lastPlayedDate: dateKey(day(2026, 7, 3)), streakDays: 4 };
    // 2026-07-04 was missed entirely; this session is 2026-07-05.
    const next = updateStreak(streak, day(2026, 7, 5));
    expect(next.streakDays).toBe(5);
  });

  it('resets to day 1 after two or more consecutive misses', () => {
    const streak: StreakState = { lastPlayedDate: dateKey(day(2026, 7, 3)), streakDays: 10 };
    // 07-04 and 07-05 both missed; this session is 07-06.
    const next = updateStreak(streak, day(2026, 7, 6));
    expect(next.streakDays).toBe(1);
    expect(next.lastPlayedDate).toBe(dateKey(day(2026, 7, 6)));
  });

  it('resets after a long absence too, not just exactly two days', () => {
    const streak: StreakState = { lastPlayedDate: dateKey(day(2026, 7, 3)), streakDays: 20 };
    const next = updateStreak(streak, day(2026, 8, 1));
    expect(next.streakDays).toBe(1);
  });

  it('is deterministic for the same streak and instant', () => {
    const streak: StreakState = { lastPlayedDate: dateKey(day(2026, 7, 3)), streakDays: 4 };
    expect(updateStreak(streak, day(2026, 7, 4))).toEqual(updateStreak(streak, day(2026, 7, 4)));
  });
});
