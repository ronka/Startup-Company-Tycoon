/**
 * The text a finished run gets shared as. Pure — no React, no platform APIs —
 * so the exact string that lands in the share sheet is testable.
 *
 * Deliberately carries no seed and no store link: the seed is meaningless to a
 * reader until same-seed play exists, and the link belongs on the image card
 * (see the share-card plan) rather than cluttering a tweet.
 */

import type { GameOverReason } from '@/game/types';

import { formatMoney } from './format';

/** Matches `expo.name` in app.json — the share text is the only place it's user-visible outside the store. */
const APP_NAME = 'Startup Company Tycoon';

const OUTCOME: Record<GameOverReason, string> = {
  bankruptcy: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

/** Low-to-high block glyphs; index 0 is the trough, the last is the peak. */
const GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** How many glyphs a rendered sparkline gets. Eight keeps it inside one tweet line. */
export const SPARK_BUCKETS = 8;

/**
 * Averages `values` down to at most `buckets` points. Runs can hit
 * `VALUATION_HISTORY_CAP` (104 weekly points), and a 104-glyph line is
 * unreadable; short runs are returned untouched rather than padded.
 */
function downsample(values: number[], buckets: number): number[] {
  if (values.length <= buckets) return values;
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor((i * values.length) / buckets);
    const end = Math.max(Math.floor(((i + 1) * values.length) / buckets), start + 1);
    const slice = values.slice(start, end);
    out.push(slice.reduce((sum, v) => sum + v, 0) / slice.length);
  }
  return out;
}

/**
 * The run's valuation curve as block glyphs, or `null` when there isn't enough
 * history to have a shape (a run that ends in week 1 or 2).
 *
 * Normalized to the run's *own* min/max, so the glyphs describe trajectory, not
 * scale — a $2M run and a $2B run with the same arc render identically. The
 * money line in `buildShareText` is what carries magnitude.
 */
export function sparkline(values: number[], buckets = SPARK_BUCKETS): string | null {
  const points = downsample(values, buckets);
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // A perfectly flat run has no shape to show. Render it mid-height rather than
  // pinning every point to the trough glyph, which would read as a collapse.
  if (max === min) return GLYPHS[3].repeat(points.length);

  return points
    .map((value) => {
      const level = Math.round(((value - min) / (max - min)) * (GLYPHS.length - 1));
      return GLYPHS[Math.min(GLYPHS.length - 1, Math.max(0, level))];
    })
    .join('');
}

/**
 * `formatMoney` keeps one decimal for in-app tables ("$312.0M"), which reads as
 * noise in a headline. Trim a trailing `.0` only — other decimals stay.
 */
function headlineMoney(n: number): string {
  return formatMoney(n).replace(/\.0(?=[KMB]$)/, '');
}

export interface ShareCardInput {
  companyName: string;
  reason: GameOverReason;
  week: number;
  score: number;
  /** `GameState.valuationHistory` — one valuation per week, newest last. */
  valuationHistory: number[];
}

/**
 * The shareable summary of a finished run:
 *
 * ```
 * Startup Company Tycoon — Acorn Labs
 *
 * ▁▂▂▄▃▅▇█  IPO, week 68
 * $312M founder take
 * ```
 */
export function buildShareText({
  companyName,
  reason,
  week,
  score,
  valuationHistory,
}: ShareCardInput): string {
  const outcome = `${OUTCOME[reason]}, week ${week}`;
  const spark = sparkline(valuationHistory);
  // Bankruptcy always scores 0 (see `scoreFor` in src/game/score.ts); saying
  // "$0 founder take" is redundant when the outcome line already says Bankrupt.
  const money = reason === 'bankruptcy' ? headlineMoney(0) : `${headlineMoney(score)} founder take`;

  return [
    `${APP_NAME} — ${companyName}`,
    '',
    spark ? `${spark}  ${outcome}` : outcome,
    money,
  ].join('\n');
}
