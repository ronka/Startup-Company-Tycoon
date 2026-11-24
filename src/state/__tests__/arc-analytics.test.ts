import { describe, expect, it } from 'vitest';

import { PMF_MIDPOINT, syncArc } from '../../game/arcs';
import { newGame, reduce } from '../../game/engine';
import type { GameState } from '../../game/types';
import { QUESTS } from '../../game/unlocks';
import { arcMidpointEvent, arcPropsFor, arcSyncEvents, pinBeat } from '../arc-analytics';

function guidedDone(overrides: Partial<GameState> = {}): GameState {
  return {
    ...newGame('Acme', 7),
    cash: 50_000_000,
    weeksUntilNextEvent: 1000,
    unlockSchedule: 'guided-ui',
    questsDone: QUESTS.map((q) => q.id),
    ...overrides,
  };
}

describe('arcSyncEvents', () => {
  it('reports a chapter starting, with its id, index, and weeks', () => {
    const before = guidedDone({ week: 11 });
    const events = arcSyncEvents(before, syncArc(before));
    expect(events[0]).toEqual({
      name: 'arc_started',
      props: { arc_id: 'pmf', arc_index: 1, week: 11, start_week: 11, capstone_week: 20, substituted: [] },
    });
  });

  it('reports each newly met mission once', () => {
    const started = syncArc(guidedDone({ week: 11 }));
    const raised = syncArc({ ...started, roundsRaised: 1 });
    expect(arcSyncEvents(started, raised)).toEqual([
      {
        name: 'arc_mission_completed',
        props: { arc_id: 'pmf', arc_index: 1, week: 11, mission: 'pmf-raise', mission_number: 2, substituted: false },
      },
    ]);
    expect(arcSyncEvents(raised, syncArc(raised))).toEqual([]);
  });

  it('flags a substitute mission', () => {
    const started = syncArc(guidedDone({ week: 11, roundsRaised: 8 }));
    const rich = syncArc({ ...started, customers: 10_000 });
    const income = arcSyncEvents(started, rich).find((e) => e.props.mission === 'pmf-income');
    expect(income?.props.substituted).toBe(true);
  });
});

describe('pin and midpoint analytics', () => {
  it('names why a cliffhanger was pinned', () => {
    const wall = guidedDone({ week: 17 });
    expect(pinBeat(wall, reduce(wall, { type: 'PIN_CLIFFHANGER' }))).toBe('wall');
    const capstone = guidedDone({ week: 20 });
    expect(pinBeat(capstone, reduce(capstone, { type: 'PIN_CLIFFHANGER' }))).toBe('capstone');
    const mid = guidedDone({ week: 15 });
    expect(pinBeat(mid, reduce(mid, { type: 'PIN_CLIFFHANGER' }))).toBe('midpoint');
  });

  it('fires arc_midpoint once, on the tick that lands on week 15, with the card id', () => {
    const prev = guidedDone({ week: 14 });
    const next = reduce({ ...prev, week: 15 }, { type: 'PIN_CLIFFHANGER', scheduledOnly: true });
    expect(arcMidpointEvent(prev, next)).toEqual({
      name: 'arc_midpoint',
      props: { arc_id: 'pmf', arc_index: 1, week: 15, card_id: PMF_MIDPOINT.id },
    });
    expect(arcMidpointEvent(next, next)).toBeNull();
    expect(arcMidpointEvent(guidedDone({ week: 15 }), guidedDone({ week: 16 }))).toBeNull();
  });

  it('labels a week with its chapter', () => {
    expect(arcPropsFor(guidedDone({ week: 10 }))).toEqual({ arc_id: 'seed', arc_index: 0 });
    expect(arcPropsFor(guidedDone({ week: 25 }))).toEqual({ arc_id: 'scale', arc_index: 2 });
  });
});
