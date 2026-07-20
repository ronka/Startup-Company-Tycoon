/**
 * Persisted run history — store-layer only, same spirit as `daily-streak.ts`:
 * pure, `Date`-driven where relevant, and testable without a provider. Each
 * completed run (bankruptcy, acquisition, or IPO) is recorded once, giving
 * the game-over screen something to compare the current run against (a
 * personal best) and, later, a log for the daily-challenge feature to write
 * into. Kept entirely out of `src/game/` — the engine stays unaware of past
 * runs.
 */

import type { GameOverReason } from '@/game/types';

/** Newest-first history never grows past this many runs. */
export const MAX_RUNS = 50;

export interface RunRecord {
  /** Local calendar date (YYYY-MM-DD via `dateKey`) the run ended on. */
  endedOnDateKey: string;
  reason: GameOverReason;
  weeks: number;
  score: number;
  seed: number;
  companyName: string;
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
