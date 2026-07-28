/**
 * Persisted run history — store-layer only, same spirit as `daily-streak.ts`:
 * pure, `Date`-driven where relevant, and testable without a provider. Each
 * completed run (bankruptcy, acquisition, or IPO) is recorded once, giving
 * the game-over screen something to compare the current run against (a
 * personal best) and, later, a log for the daily-challenge feature to write
 * into. Kept entirely out of `src/game/` — the engine stays unaware of past
 * runs.
 */

import type { Era } from '@/game/events/types';
import type { FocusId, GameOverReason } from '@/game/types';

/** Newest-first history never grows past this many runs. */
export const MAX_RUNS = 50;

/**
 * One finished run. The six fields above the divider have always been written;
 * everything below it was added later and is therefore optional — records
 * already sitting in `run-history/v1` on a player's device lack them entirely,
 * which is why the storage key was not bumped. Anything reading these must
 * tolerate `undefined` rather than assume a default.
 */
export interface RunRecord {
  /** Local calendar date (YYYY-MM-DD via `dateKey`) the run ended on. */
  endedOnDateKey: string;
  reason: GameOverReason;
  weeks: number;
  score: number;
  seed: number;
  companyName: string;

  /**
   * Company valuation the score was computed from — i.e. `score / founderEquity`
   * for an exit, and the live valuation for a bankruptcy (which scores a flat 0
   * and so carries no exit price of its own).
   */
  exitValuation?: number;
  /** Founder ownership at exit, 0–1. */
  founderEquity?: number;
  customers?: number;
  /** Rank-and-file headcount plus filled C-level seats. */
  employees?: number;
  era?: Era;
  focus?: FocusId;
}

export interface RunHistory {
  /** Newest first. */
  runs: RunRecord[];
}

export function initialRunHistory(): RunHistory {
  return { runs: [] };
}

/** Prepends `record`, capping the history at `MAX_RUNS` (oldest dropped first). */
export function recordRun(history: RunHistory, record: RunRecord): RunHistory {
  return { runs: [record, ...history.runs].slice(0, MAX_RUNS) };
}

/**
 * Highest score across all recorded runs, or `null` when there is no
 * history yet. Bankruptcy runs score 0 (see `scoreFor` in `src/game/score.ts`),
 * so an all-bankruptcy history returns 0, not `null`.
 */
export function bestScore(history: RunHistory): number | null {
  if (history.runs.length === 0) return null;
  return history.runs.reduce((max, run) => Math.max(max, run.score), 0);
}

/**
 * True when `score` beats the best score recorded in `history` so far
 * (strictly greater — tying your best is not a new best) and `score` is
 * positive (going bankrupt is never a "new best").
 */
export function isNewBest(history: RunHistory, score: number): boolean {
  if (score <= 0) return false;
  const best = bestScore(history);
  return best === null || score > best;
}

/**
 * Index into `history.runs` of the personal-best run, or `null` when no run
 * scored above zero — an all-bankruptcy history has no "best" to badge, which
 * matches `isNewBest` treating a bankruptcy as never a record.
 *
 * On a tie the *earliest* run wins: it set the record, the later one only
 * matched it. Since `runs` is newest-first, that is the last index reaching
 * the maximum, hence the `>=`.
 */
export function bestRunIndex(history: RunHistory): number | null {
  let bestIndex: number | null = null;
  let best = 0;
  history.runs.forEach((run, index) => {
    if (run.score > 0 && run.score >= best) {
      best = run.score;
      bestIndex = index;
    }
  });
  return bestIndex;
}
