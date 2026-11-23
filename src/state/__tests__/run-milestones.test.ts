import { describe, expect, it } from 'vitest';

import { RUN_MILESTONE_WEEKS, maxWeekReached, milestonesCrossed } from '../run-milestones';

describe('milestonesCrossed', () => {
  it('fires week 1 on the very first tick of a run (runs start at week 0)', () => {
    expect(milestonesCrossed(0, 1)).toEqual([1]);
  });

  it('fires each milestone exactly once across a run of single-week ticks', () => {
    const fired: number[] = [];
    for (let week = 1; week <= 25; week += 1) fired.push(...milestonesCrossed(week - 1, week));
    expect(fired).toEqual([...RUN_MILESTONE_WEEKS]);
  });

  it('reports nothing on weeks between milestones', () => {
    expect(milestonesCrossed(1, 2)).toEqual([]);
    expect(milestonesCrossed(10, 11)).toEqual([]);
  });

  it('reports every milestone a multi-week jump passes over, in order', () => {
    expect(milestonesCrossed(2, 12)).toEqual([3, 5, 10]);
  });

  it('reports nothing for a non-advance or a new run (week going backwards)', () => {
    expect(milestonesCrossed(5, 5)).toEqual([]);
    expect(milestonesCrossed(20, 1)).toEqual([]);
  });
});

describe('maxWeekReached', () => {
  it('is the current week when there is no history', () => {
    expect(maxWeekReached([], 3)).toBe(3);
  });

  it("never regresses below an earlier run's best", () => {
    expect(maxWeekReached([20, 7], 3)).toBe(20);
  });

  it('moves up when the current run passes every earlier one', () => {
    expect(maxWeekReached([20, 7], 21)).toBe(21);
  });
});
