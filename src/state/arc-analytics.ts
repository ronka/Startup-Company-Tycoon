/**
 * Analytics for the chapter system, as pure state diffs so the store only
 * forwards them. Same vocabulary everywhere: `arc_id` ('pmf', 'scale', …),
 * `arc_index` (0 = weeks 1–10), `week`, and `card_id` where a card is involved.
 */

import {
  ARC_TEMPLATES,
  arcCapstoneWeek,
  arcIndexForWeek,
  arcStartWeek,
  isMidpointWeek,
  missionsFor,
  templateIdFor,
} from '@/game/arcs';
import type { GameState } from '@/game/types';

export interface ArcAnalyticsEvent {
  name: 'arc_started' | 'arc_mission_completed' | 'arc_midpoint';
  props: Record<string, string | number | boolean | null | string[]>;
}

/** What `SYNC_ARC` is about to record, as events: a chapter starting, and each mission met. */
export function arcSyncEvents(before: GameState, after: GameState): ArcAnalyticsEvent[] {
  const record = after.arc;
  if (!record) return [];
  const events: ArcAnalyticsEvent[] = [];
  const base = { arc_id: record.id, arc_index: record.index, week: after.week };
  const started = !before.arc || before.arc.index !== record.index;
  if (started) {
    events.push({
      name: 'arc_started',
      props: {
        ...base,
        start_week: arcStartWeek(record.index),
        capstone_week: arcCapstoneWeek(record.index),
        substituted: record.substituted,
      },
    });
  }
  const already = started ? [] : (before.arc?.missionsDone ?? []);
  const slots = missionsFor(record).map((mission) => mission.id);
  const original = ARC_TEMPLATES[record.id].missions.map((mission) => mission.id);
  for (const mission of record.missionsDone) {
    if (already.includes(mission)) continue;
    const slot = slots.indexOf(mission);
    events.push({
      name: 'arc_mission_completed',
      props: { ...base, mission, mission_number: slot + 1, substituted: slot >= 0 && original[slot] !== mission },
    });
  }
  return events;
}

/** The chapter a week belongs to, as analytics names it. */
export function arcPropsFor(state: GameState): { arc_id: string; arc_index: number } {
  const arcIndex = arcIndexForWeek(state.week);
  const arcId = state.arc?.index === arcIndex ? state.arc.id : templateIdFor(arcIndex, state);
  return { arc_id: arcId, arc_index: arcIndex };
}

/** Why a cliffhanger was pinned between `prev` and `next`: a chapter's capstone, its midpoint card, or an ordinary wall. */
export function pinBeat(prev: GameState, next: GameState): 'capstone' | 'midpoint' | 'wall' {
  if ((next.lastCapstoneArc ?? -1) > (prev.lastCapstoneArc ?? -1)) return 'capstone';
  if ((next.lastMidpointArc ?? -1) > (prev.lastMidpointArc ?? -1)) return 'midpoint';
  return 'wall';
}

/**
 * The midpoint beat, once, on the tick that lands on week 15, 25, …
 * `card_id` is the mid-chapter card when this tick's pin was it.
 */
export function arcMidpointEvent(prev: GameState, next: GameState): ArcAnalyticsEvent | null {
  if (next.week <= prev.week || !isMidpointWeek(next.week)) return null;
  const pinnedMidpoint = (next.lastMidpointArc ?? -1) > (prev.lastMidpointArc ?? -1);
  return {
    name: 'arc_midpoint',
    props: {
      ...arcPropsFor(next),
      week: next.week,
      card_id: pinnedMidpoint ? (next.cliffhangerCardId ?? null) : null,
    },
  };
}
