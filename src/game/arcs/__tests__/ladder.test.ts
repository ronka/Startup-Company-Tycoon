import { describe, expect, it } from 'vitest';

import { newGame, normalizeSave } from '../../engine';
import type { CLevelCandidate, GameState } from '../../types';
import { ROUND_ORDER } from '../../types';
import { QUESTS } from '../../unlocks';
import {
  arcCapstoneWeek,
  arcIndexForWeek,
  arcLadder,
  arcMidWeek,
  currentArcIndex,
  customersGoal,
  incomeGoal,
  isCapstoneWeek,
  isMidpointWeek,
  nextArcMission,
  syncArc,
} from '..';

/** A run with plenty of cash, so runway never interferes unless a test wants it to. */
function run(overrides: Partial<GameState> = {}): GameState {
  return { ...newGame('Acme', 7), cash: 50_000_000, ...overrides };
}

/** A guided run whose first ladder is fully climbed. */
function guidedDone(overrides: Partial<GameState> = {}): GameState {
  return run({ unlockSchedule: 'guided-ui', questsDone: QUESTS.map((q) => q.id), ...overrides });
}

const hire = (id: string): CLevelCandidate => ({
  id,
  name: id,
  personality: '',
  exEmployer: '',
  tier: 'mid',
  salary: 0,
  perk: { id: 'neutral', label: '', axis: 'cto-productivity', multiplier: 1 },
  quirk: null,
});

describe('chapter schedule', () => {
  it('splits weeks into 10-week arcs with the capstone on the last week', () => {
    expect([0, 1, 10, 11, 20, 21, 30, 31].map(arcIndexForWeek)).toEqual([0, 0, 0, 1, 1, 2, 2, 3]);
    expect([0, 1, 2, 3].map(arcCapstoneWeek)).toEqual([10, 20, 30, 40]);
    expect(arcMidWeek(1)).toBe(15);
  });

  it('marks capstone weeks 10/20/30… and midpoints 15/25/… (none in arc 0)', () => {
    expect([10, 20, 30, 40].every(isCapstoneWeek)).toBe(true);
    expect([0, 5, 9, 15, 21].some(isCapstoneWeek)).toBe(false);
    expect([15, 25, 35].every(isMidpointWeek)).toBe(true);
    expect([5, 10, 14, 20].some(isMidpointWeek)).toBe(false);
  });
});

describe('which chapter a run is in', () => {
  it('stays on arc 0 while the guided ladder is unfinished', () => {
    const s = run({ unlockSchedule: 'guided-ui', questsDone: [], week: 4 });
    expect(currentArcIndex(s)).toBe(0);
    expect(arcLadder(s)).toBeNull();
    expect(syncArc(s)).toBe(s);
  });

  it('moves a guided run that finished at week 8 straight on to product-market fit', () => {
    const s = guidedDone({ week: 8 });
    expect(currentArcIndex(s)).toBe(1);
    const synced = syncArc(s);
    expect(synced.arc).toMatchObject({ index: 1, id: 'pmf', startedWeek: 8 });
    expect(arcLadder(synced)?.title).toBe('Find product-market fit');
  });

  it('gives a non-guided run the chapter ladder from the start', () => {
    expect(syncArc(run({ week: 3 })).arc?.id).toBe('pmf');
  });

  it('keeps week 20 in arc 1 (its capstone week) and starts arc 2 at week 21', () => {
    expect(currentArcIndex(guidedDone({ week: 20 }))).toBe(1);
    expect(currentArcIndex(guidedDone({ week: 21 }))).toBe(2);
  });

  it('starts an old save loaded at week 34 on arc 3, keyed off its era', () => {
    expect(syncArc(run({ week: 34 })).arc).toMatchObject({ index: 3, id: 'scale', startedWeek: 34 });
    expect(syncArc(run({ week: 34, era: 'boom' })).arc?.id).toBe('boom');
    expect(syncArc(run({ week: 64, era: 'reckoning' })).arc?.id).toBe('reckoning');
    expect(syncArc(run({ week: 54, era: 'reckoning' })).arc?.id).toBe('crisis');
  });

  it('does nothing once the run is over', () => {
    const over = run({ week: 15, gameOver: 'bankruptcy' });
    expect(syncArc(over)).toBe(over);
    expect(arcLadder(over)).toBeNull();
  });
});

describe('the weeks 11–20 ladder', () => {
  it('lists the five PMF missions in order, the first one current', () => {
    const ladder = arcLadder(syncArc(guidedDone({ week: 11, customers: 12 })))!;
    expect(ladder.missions.map((m) => m.id)).toEqual([
      'pmf-clevel',
      'pmf-raise',
      'pmf-customers',
      'pmf-runway',
      'pmf-capstone',
    ]);
    expect(ladder.missions.map((m) => m.title)).toEqual([
      'Hire your first C-level',
      'Raise your Seed',
      'Reach 32 customers',
      'End a week with 8+ weeks of runway',
      'Face the week 20 decision',
    ]);
    expect(ladder.missions[0].status).toBe('current');
    expect(ladder.capstoneWeek).toBe(20);
    expect(nextArcMission(guidedDone({ week: 11 }))?.id).toBe('pmf-clevel');
  });

  it('sizes the customer goal as max(2× baseline, baseline + 20)', () => {
    expect(customersGoal(5, 2, 20)).toBe(25);
    expect(customersGoal(40, 2, 20)).toBe(80);
    expect(customersGoal(0, 2, 20)).toBe(20);
  });

  it('freezes the baseline so the goal never chases the player', () => {
    const started = syncArc(guidedDone({ week: 11, customers: 40 }));
    expect(arcLadder(started)!.missions[2].goal).toBe(80);
    const grown = syncArc({ ...started, week: 13, customers: 70 });
    expect(arcLadder(grown)!.missions[2]).toMatchObject({ goal: 80, progress: 70 });
    const done = syncArc({ ...grown, week: 14, customers: 85 });
    expect(done.arc?.missionsDone).toContain('pmf-customers');
    // Sticky: dipping back below the goal keeps it done.
    expect(syncArc({ ...done, customers: 10 }).arc?.missionsDone).toContain('pmf-customers');
  });

  it('records missions met out of order, and keeps the first unmet one current', () => {
    const started = syncArc(guidedDone({ week: 11 }));
    const hired = syncArc({ ...started, cLevels: { ...started.cLevels, cto: { hired: hire('c1'), offer: null } } });
    expect(hired.arc?.missionsDone).toEqual(['pmf-clevel']);
    expect(nextArcMission(hired)?.id).toBe('pmf-raise');
    const raised = syncArc({ ...hired, roundsRaised: 1 });
    expect(raised.arc?.missionsDone).toEqual(['pmf-clevel', 'pmf-raise']);
  });

  it('returns the very same object when nothing changed', () => {
    const synced = syncArc(guidedDone({ week: 12 }));
    expect(syncArc(synced)).toBe(synced);
  });

  it('only counts the runway mission after a week has finished inside the arc', () => {
    const started = syncArc(guidedDone({ week: 11 }));
    expect(started.arc?.missionsDone).not.toContain('pmf-runway');
    expect(syncArc({ ...started, week: 12 }).arc?.missionsDone).toContain('pmf-runway');
    // Thin runway doesn't count.
    expect(syncArc({ ...started, week: 12, cash: 10 }).arc?.missionsDone ?? []).not.toContain('pmf-runway');
  });

  it('completes the capstone mission when that chapter\'s capstone is pinned', () => {
    const started = syncArc(guidedDone({ week: 20 }));
    expect(started.arc?.missionsDone).not.toContain('pmf-capstone');
    expect(syncArc({ ...started, lastCapstoneArc: 1 }).arc?.missionsDone).toContain('pmf-capstone');
    // Arc 0's capstone doesn't count for arc 1.
    expect(syncArc({ ...started, lastCapstoneArc: 0 }).arc?.missionsDone).not.toContain('pmf-capstone');
  });
});

describe('the raise mission never soft-locks', () => {
  it('becomes an income goal when every round is raised', () => {
    const s = syncArc(guidedDone({ week: 11, roundsRaised: ROUND_ORDER.length }));
    expect(s.arc?.substituted).toEqual(['pmf-raise']);
    const slot = arcLadder(s)!.missions[1];
    expect(slot).toMatchObject({ id: 'pmf-income', substituted: true, unit: 'money' });
  });

  it('becomes an income goal when the raise cooldown runs past the week before the capstone', () => {
    // Raised at week 15: the 7-week cooldown ends week 22, after the week-20 capstone.
    const late = syncArc(guidedDone({ week: 16, roundsRaised: 1, lastRoundRaisedWeek: 15 }));
    expect(late.arc?.substituted).toEqual(['pmf-raise']);
    // Raised at week 5: clear by week 12, so Series A is the goal.
    const early = syncArc(guidedDone({ week: 11, roundsRaised: 1, lastRoundRaisedWeek: 5 }));
    expect(early.arc?.substituted).toEqual([]);
    expect(arcLadder(early)!.missions[1].title).toBe('Raise your Series A');
  });

  it('decides once at arc start, not live', () => {
    const started = syncArc(guidedDone({ week: 11, roundsRaised: 1, lastRoundRaisedWeek: 5 }));
    const later = syncArc({ ...started, week: 13, lastRoundRaisedWeek: 12 });
    expect(later.arc?.substituted).toEqual([]);
  });

  it('sizes the income substitute off the frozen baseline', () => {
    expect(incomeGoal(0)).toBe(3_000);
    expect(incomeGoal(5_000)).toBe(10_000);
    expect(incomeGoal(1_234)).toBe(4_500);
  });

  it('swaps the C-level mission for a team goal when every seat is already filled', () => {
    const seats = { cto: { hired: hire('a'), offer: null }, cmo: { hired: hire('b'), offer: null }, cfo: { hired: hire('c'), offer: null } };
    const s = syncArc(guidedDone({ week: 11, cLevels: seats }));
    expect(s.arc?.substituted).toContain('pmf-clevel');
    expect(arcLadder(s)!.missions[0].id).toBe('pmf-team');
  });
});

describe('moving between chapters', () => {
  it('starts a fresh arc 2 ladder with a new baseline at week 21', () => {
    const arc1 = syncArc(guidedDone({ week: 20, customers: 30, lastCapstoneArc: 1 }));
    const arc2 = syncArc({ ...arc1, week: 21, customers: 50 });
    expect(arc2.arc).toMatchObject({ index: 2, id: 'scale', startedWeek: 21, missionsDone: [] });
    expect(arc2.arc?.baseline.customers).toBe(50);
    expect(arcLadder(arc2)?.missions.map((m) => m.id)).toEqual(['scale-raise', 'scale-customers', 'scale-team', 'scale-capstone']);
  });
});

describe('normalizeSave with chapters', () => {
  it('loads a save from before chapters, then starts its chapter', () => {
    const { arc: _a, lastCapstoneArc: _c, lastMidpointArc: _m, pinnedCard: _p, ...old } = guidedDone({ week: 14 });
    const loaded = normalizeSave(old as GameState);
    expect(loaded.arc).toBeUndefined();
    expect(syncArc(loaded).arc).toMatchObject({ index: 1, startedWeek: 14 });
  });

  it('keeps a valid arc record and drops a malformed one', () => {
    const valid = syncArc(guidedDone({ week: 12 }));
    expect(normalizeSave(valid).arc).toEqual(valid.arc);
    const broken = { ...valid, arc: { index: 'one', id: 'pmf' } } as unknown as GameState;
    const loaded = normalizeSave(broken);
    expect(loaded.arc).toBeUndefined();
    expect(syncArc(loaded).arc?.index).toBe(1);
    const unknownId = { ...valid, arc: { ...valid.arc!, id: 'mystery' } } as unknown as GameState;
    expect(normalizeSave(unknownId).arc).toBeUndefined();
  });
});
