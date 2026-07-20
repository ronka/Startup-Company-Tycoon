import { describe, expect, it } from 'vitest';

import {
  bestScore,
  initialRunHistory,
  isNewBest,
  MAX_RUNS,
  recordRun,
  type RunRecord,
} from '../run-history';
import { dateKey } from '../week-budget';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

const runOf = (score: number, overrides: Partial<RunRecord> = {}): RunRecord => ({
  endedOnDateKey: dateKey(day(2026, 7, 3)),
  reason: 'acquired',
  weeks: 20,
  score,
  seed: 1,
  companyName: 'Acme',
  ...overrides,
});

describe('initialRunHistory', () => {
  it('starts empty with a null best score', () => {
    const history = initialRunHistory();
    expect(history.runs).toEqual([]);
    expect(bestScore(history)).toBeNull();
  });
});

describe('recordRun', () => {
  it('prepends the new run so history is newest first', () => {
    let history = initialRunHistory();
    history = recordRun(history, runOf(100, { companyName: 'First' }));
    history = recordRun(history, runOf(200, { companyName: 'Second' }));
    expect(history.runs.map((r) => r.companyName)).toEqual(['Second', 'First']);
  });

  it('caps the history at MAX_RUNS, dropping the oldest', () => {
    let history = initialRunHistory();
    for (let i = 0; i < MAX_RUNS + 5; i++) {
      history = recordRun(history, runOf(i, { companyName: `Run ${i}` }));
    }
    expect(history.runs).toHaveLength(MAX_RUNS);
    // Newest first: the most recent run is Run 54, the oldest kept is Run 5.
    expect(history.runs[0].companyName).toBe(`Run ${MAX_RUNS + 4}`);
    expect(history.runs[history.runs.length - 1].companyName).toBe('Run 5');
  });
});

describe('bestScore', () => {
  it('returns the highest score across runs', () => {
    let history = initialRunHistory();
    history = recordRun(history, runOf(50));
    history = recordRun(history, runOf(500));
    history = recordRun(history, runOf(200));
    expect(bestScore(history)).toBe(500);
  });

  it('returns 0, not null, for an all-bankruptcy history', () => {
    let history = initialRunHistory();
    history = recordRun(history, runOf(0, { reason: 'bankruptcy' }));
    history = recordRun(history, runOf(0, { reason: 'bankruptcy' }));
    expect(bestScore(history)).toBe(0);
  });
});

describe('isNewBest', () => {
  it('is true for the first positive score in an empty history', () => {
    const history = initialRunHistory();
    expect(isNewBest(history, 100)).toBe(true);
  });

  it('is false for a score of 0, even with empty history', () => {
    const history = initialRunHistory();
    expect(isNewBest(history, 0)).toBe(false);
  });

  it('is true only for a strictly greater score, not a tie', () => {
    let history = initialRunHistory();
    history = recordRun(history, runOf(300));
    expect(isNewBest(history, 300)).toBe(false);
    expect(isNewBest(history, 301)).toBe(true);
    expect(isNewBest(history, 299)).toBe(false);
  });

  it('is false for bankruptcy (score 0) even against an all-bankruptcy history', () => {
    let history = initialRunHistory();
    history = recordRun(history, runOf(0, { reason: 'bankruptcy' }));
    expect(isNewBest(history, 0)).toBe(false);
  });
});
