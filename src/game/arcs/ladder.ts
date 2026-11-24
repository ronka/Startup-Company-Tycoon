/**
 * The chapter mission ladder after the guided first weeks: which arc the run
 * is in, its missions and progress, and the pure `syncArc` step the store runs
 * after every commit to start an arc (freezing its baseline) and record
 * missions as they're met. Like `unlocks.ts`, this module decides and the
 * store records — once recorded, a mission stays done.
 */

import type { GameState } from '../types';
import { isGuided, newlyCompletedQuests, nextQuest } from '../unlocks';
import { arcCapstoneWeek, arcIndexForWeek, arcStartWeek, type ArcIndex } from './schedule';
import { ARC_TEMPLATES, baselineFor, templateIdFor } from './templates';
import type { ArcContext, ArcId, ArcRecord, MissionTemplate } from './types';

/** The guided first ladder is behind the run — or never applied (non-guided runs, old saves). */
export function guidedLadderDone(state: GameState): boolean {
  return !isGuided(state) || nextQuest(state) === null;
}

/**
 * The chapter the run is in for mission purposes. Arc 0 while the guided
 * ladder is still being climbed; after that, at least arc 1 — a guided run
 * that finishes at week 7 moves straight on to finding product-market fit
 * rather than sitting three weeks with no goal. Week 20 still belongs to arc 1
 * (it's that chapter's capstone week); week 21 starts arc 2.
 */
export function currentArcIndex(state: GameState): ArcIndex {
  if (!guidedLadderDone(state)) return 0;
  return Math.max(1, arcIndexForWeek(state.week));
}

export function contextFor(state: GameState, record: ArcRecord): ArcContext {
  return {
    arcIndex: record.index,
    startWeek: arcStartWeek(record.index),
    capstoneWeek: arcCapstoneWeek(record.index),
    state,
    baseline: record.baseline,
    startedWeek: record.startedWeek,
  };
}

/** The mission actually in each slot: the template's, or its substitute when it was ruled out at arc start. */
export function missionsFor(record: ArcRecord): MissionTemplate[] {
  return ARC_TEMPLATES[record.id].missions.map((mission) =>
    record.substituted.includes(mission.id) && mission.substitute ? mission.substitute : mission,
  );
}

function missionMet(mission: MissionTemplate, ctx: ArcContext): boolean {
  return mission.met ? mission.met(ctx) : mission.progress(ctx) >= mission.goal(ctx);
}

/** A fresh record for `index`, baseline frozen from `state` right now. */
export function startArc(state: GameState, index: ArcIndex, id: ArcId = templateIdFor(index, state)): ArcRecord {
  const record: ArcRecord = {
    index,
    id,
    startedWeek: state.week,
    baseline: baselineFor(state),
    missionsDone: [],
    substituted: [],
  };
  const ctx = contextFor(state, record);
  record.substituted = ARC_TEMPLATES[id].missions
    .filter((mission) => mission.substitute && mission.available && !mission.available(ctx))
    .map((mission) => mission.id);
  return record;
}

const ARC_IDS: readonly ArcId[] = ['seed', 'pmf', 'scale', 'boom', 'reckoning', 'crisis'];
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Shape check for a loaded save's arc record — `normalizeSave` drops anything that fails it. */
export function isArcRecord(value: unknown): value is ArcRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ArcRecord>;
  const baseline = record.baseline as Partial<ArcRecord['baseline']> | undefined;
  return (
    typeof record.index === 'number' &&
    Number.isInteger(record.index) &&
    record.index >= 0 &&
    typeof record.id === 'string' &&
    ARC_IDS.includes(record.id) &&
    typeof record.startedWeek === 'number' &&
    isStringArray(record.missionsDone) &&
    isStringArray(record.substituted) &&
    !!baseline &&
    typeof baseline.customers === 'number' &&
    typeof baseline.roundsRaised === 'number' &&
    typeof baseline.monthlyIncome === 'number' &&
    typeof baseline.headcount === 'number' &&
    typeof baseline.cLevelsHired === 'number' &&
    (baseline.lastRoundRaisedWeek === null || typeof baseline.lastRoundRaisedWeek === 'number')
  );
}

/** The record the run should have right now — the saved one, or a new arc's. Null during arc 0 or once the run is over. */
export function activeArcRecord(state: GameState): ArcRecord | null {
  if (state.gameOver) return null;
  const index = currentArcIndex(state);
  if (index < 1) return null;
  return state.arc && state.arc.index === index ? state.arc : startArc(state, index);
}

/**
 * Starts the arc the run has moved into and records every mission now met.
 * Returns the very same object when nothing changed, so the store's
 * post-commit effect can't loop.
 */
export function syncArc(state: GameState): GameState {
  const record = activeArcRecord(state);
  if (!record) return state;
  const ctx = contextFor(state, record);
  const added = missionsFor(record)
    .filter((mission) => !record.missionsDone.includes(mission.id) && missionMet(mission, ctx))
    .map((mission) => mission.id);
  if (record === state.arc && added.length === 0) return state;
  return { ...state, arc: { ...record, missionsDone: [...record.missionsDone, ...added] } };
}

export interface ArcMissionProgress {
  id: string;
  number: number;
  total: number;
  title: string;
  progress: number;
  goal: number;
  unit: MissionTemplate['unit'];
  reward: string;
  status: 'done' | 'current' | 'upcoming';
  /** True when this slot holds the substitute for a mission that couldn't be done this chapter. */
  substituted: boolean;
}

export interface ArcLadder {
  arcIndex: ArcIndex;
  id: ArcId;
  /** "Chapter 2" — 1-based for players. */
  chapterNumber: number;
  title: string;
  goalLine: string;
  capstoneWeek: number;
  missions: ArcMissionProgress[];
}

/** The chapter's missions with where the run stands on each. Null during the guided ladder, for an over run, or a template with no missions. */
export function arcLadder(state: GameState): ArcLadder | null {
  const synced = syncArc(state);
  const record = activeArcRecord(synced);
  if (!record) return null;
  const template = ARC_TEMPLATES[record.id];
  const missions = missionsFor(record);
  if (missions.length === 0) return null;
  const ctx = contextFor(synced, record);
  const done = new Set(record.missionsDone);
  const current = missions.findIndex((mission) => !done.has(mission.id));
  return {
    arcIndex: record.index,
    id: record.id,
    chapterNumber: record.index + 1,
    title: template.title(ctx),
    goalLine: template.goalLine(ctx),
    capstoneWeek: ctx.capstoneWeek,
    missions: missions.map((mission, index) => {
      const goal = mission.goal(ctx);
      const isDone = done.has(mission.id);
      return {
        id: mission.id,
        number: index + 1,
        total: missions.length,
        title: mission.title(ctx),
        progress: isDone ? goal : Math.min(mission.progress(ctx), goal),
        goal,
        unit: mission.unit,
        reward: mission.reward,
        status: isDone ? 'done' : index === current ? 'current' : 'upcoming',
        substituted: mission.id !== template.missions[index]?.id,
      };
    }),
  };
}

/** The chapter's pinned mission: the first not yet done. Null when there is none. */
export function nextArcMission(state: GameState): ArcMissionProgress | null {
  return arcLadder(state)?.missions.find((mission) => mission.status === 'current') ?? null;
}

/**
 * Whether a guided quest or chapter mission was genuinely completed — not
 * merely replaced. The "Mission complete" beat fires when the pinned mission
 * changes, and at a chapter rollover it changes because the old chapter ended
 * (say, with its raise never done), which must not read as a win. At the
 * rollover `syncArc` already holds the new chapter's record, so an old
 * chapter's unfinished mission is correctly not in it.
 */
export function missionCompleted(state: GameState, id: string): boolean {
  if ((state.questsDone ?? []).includes(id) || (newlyCompletedQuests(state) as string[]).includes(id)) return true;
  return syncArc(state).arc?.missionsDone.includes(id) ?? false;
}
