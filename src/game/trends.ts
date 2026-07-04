/**
 * Tech trend wave phase machine: a rotating hot trend (AI / hardware /
 * crypto) cycles quiet → rising → peak → crash-or-fade → quiet, seeded and
 * deterministic, mirroring `rivals.ts`'s pattern of threading `RngState`
 * explicitly through pure functions. `trendFactorsFor` (balance.ts) reads
 * the resulting `Trend` to compute demand/hype/churn multipliers; this
 * module only owns the phase machine and its news beats.
 */

import { ERA_TREND_CRASH_CHANCE } from './balance';
import { Era, NewsEntry } from './events/types';
import { nextFloat, nextInt } from './rng';
import { RngState, Trend, TREND_IDS, TrendId, TrendPhase } from './types';

/** Inclusive [min, max] week range rolled for each phase on entry. */
const TREND_PHASE_DURATION_RANGE: Record<TrendPhase, [number, number]> = {
  quiet: [4, 8],
  rising: [6, 10],
  peak: [4, 8],
  crash: [2, 4],
};

const TREND_NAMES: Record<TrendId, string> = {
  ai: 'AI',
  hardware: 'Hardware',
  crypto: 'Crypto',
};

function rollPhaseDuration(phase: TrendPhase, rng: RngState): [number, RngState] {
  const [min, max] = TREND_PHASE_DURATION_RANGE[phase];
  return nextInt(rng, min, max);
}

/** A trend id different from `excludeId` (or any id, when `excludeId` is null — used for the run's very first trend). */
function pickTrendId(excludeId: TrendId | null, rng: RngState): [TrendId, RngState] {
  const pool = excludeId ? TREND_IDS.filter((id) => id !== excludeId) : TREND_IDS;
  const [index, next] = nextInt(rng, 0, pool.length - 1);
  return [pool[index], next];
}

/** The run's starting trend: a random id, quiet phase, freshly rolled duration. */
export function initialTrend(rng: RngState): { trend: Trend; rng: RngState } {
  const [id, afterId] = pickTrendId(null, rng);
  const [phaseDuration, afterDuration] = rollPhaseDuration('quiet', afterId);
  return { trend: { id, phase: 'quiet', weeksInPhase: 0, phaseDuration }, rng: afterDuration };
}

/**
 * One week of the trend phase machine: quiet → rising → peak, then peak
 * resolves to either `crash` (era-dependent chance — `ERA_TREND_CRASH_CHANCE`,
 * far likelier in Reckoning) or fades straight back to `quiet`; a crash
 * itself resolves back to `quiet` once it runs its course. Whenever a new
 * `quiet` phase begins, a fresh trend id is picked, guaranteed different from
 * the one that just ran its course.
 */
export function advanceTrend(trend: Trend, era: Era, rng: RngState): { trend: Trend; rng: RngState } {
  const weeksInPhase = trend.weeksInPhase + 1;
  if (weeksInPhase < trend.phaseDuration) {
    return { trend: { ...trend, weeksInPhase }, rng };
  }

  switch (trend.phase) {
    case 'quiet': {
      const [phaseDuration, next] = rollPhaseDuration('rising', rng);
      return { trend: { id: trend.id, phase: 'rising', weeksInPhase: 0, phaseDuration }, rng: next };
    }
    case 'rising': {
      const [phaseDuration, next] = rollPhaseDuration('peak', rng);
      return { trend: { id: trend.id, phase: 'peak', weeksInPhase: 0, phaseDuration }, rng: next };
    }
    case 'peak': {
      const [crashRoll, afterRoll] = nextFloat(rng);
      if (crashRoll < ERA_TREND_CRASH_CHANCE[era]) {
        const [phaseDuration, next] = rollPhaseDuration('crash', afterRoll);
        return { trend: { id: trend.id, phase: 'crash', weeksInPhase: 0, phaseDuration }, rng: next };
      }
      const [id, afterId] = pickTrendId(trend.id, afterRoll);
      const [phaseDuration, next] = rollPhaseDuration('quiet', afterId);
      return { trend: { id, phase: 'quiet', weeksInPhase: 0, phaseDuration }, rng: next };
    }
    case 'crash': {
      const [id, afterId] = pickTrendId(trend.id, rng);
      const [phaseDuration, next] = rollPhaseDuration('quiet', afterId);
      return { trend: { id, phase: 'quiet', weeksInPhase: 0, phaseDuration }, rng: next };
    }
  }
}

/** A news beat for a meaningful trend transition this week, or null if neither the phase nor the id changed. */
export function trendPhaseChangeNewsEntry(previous: Trend, next: Trend, week: number): NewsEntry | null {
  if (previous.phase === next.phase && previous.id === next.id) return null;

  switch (next.phase) {
    case 'rising':
      return {
        week,
        kind: 'trend',
        title: `The ${TREND_NAMES[next.id]} wave rises`,
        flavor: `${TREND_NAMES[next.id]} is heating up — early movers are cashing in.`,
      };
    case 'peak':
      return {
        week,
        kind: 'trend',
        title: `The ${TREND_NAMES[next.id]} wave crests`,
        flavor: `${TREND_NAMES[next.id]} hype is at its peak — everyone's chasing it now.`,
      };
    case 'crash':
      return {
        week,
        kind: 'trend',
        title: `${TREND_NAMES[previous.id]} crashes — the tourists flee`,
        flavor: `The ${TREND_NAMES[previous.id]} wave breaks hard. Anyone still chasing it is exposed.`,
      };
    case 'quiet':
      return previous.phase === 'crash'
        ? {
            week,
            kind: 'trend',
            title: 'The dust settles',
            flavor: `The market catches its breath after the ${TREND_NAMES[previous.id]} crash.`,
          }
        : {
            week,
            kind: 'trend',
            title: `The ${TREND_NAMES[previous.id]} wave fades`,
            flavor: `${TREND_NAMES[previous.id]} cools off quietly — no crash, just fatigue.`,
          };
    default:
      return null;
  }
}
