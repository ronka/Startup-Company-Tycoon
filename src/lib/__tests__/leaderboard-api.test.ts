import { describe, expect, it } from 'vitest';

import { parseBoardPage, parseBoardRow } from '@/lib/leaderboard-api';

const sampleRow = {
  runId: '00000000-0000-4000-8000-000000000008',
  rank: null,
  companyName: 'Daybreak Systems',
  week: 16,
  sector: 'Operations',
  stage: 'seed',
  outcome: 'bankrupt',
  founderStake: 0,
  scoreUpdatedAt: '2026-09-29T12:57:13.000Z',
  sample: true,
};

describe('parseBoardRow', () => {
  it('keeps a sample row with a null rank', () => {
    expect(parseBoardRow(sampleRow)).toEqual({
      runId: sampleRow.runId,
      rank: null,
      companyName: 'Daybreak Systems',
      week: 16,
      sector: 'Operations',
      stage: 'seed',
      outcome: 'bankrupt',
      founderStake: 0,
      sample: true,
    });
  });

  it('keeps a real rank and an unknown stage as-is', () => {
    const row = parseBoardRow({ ...sampleRow, rank: 3, stage: 'seriesB', sample: false });
    expect(row?.rank).toBe(3);
    expect(row?.stage).toBe('seriesB');
    expect(row?.sample).toBe(false);
  });

  it('drops rows missing fields the UI needs', () => {
    expect(parseBoardRow({ ...sampleRow, companyName: undefined })).toBeNull();
    expect(parseBoardRow({ ...sampleRow, founderStake: 'lots' })).toBeNull();
    expect(parseBoardRow({ ...sampleRow, outcome: 'bankruptcy' })).toBeNull();
    expect(parseBoardRow(null)).toBeNull();
  });
});

describe('parseBoardPage', () => {
  it('filters malformed rows and keeps the cursor opaque', () => {
    const page = parseBoardPage({
      mode: 'preview',
      total: 12,
      rows: [sampleRow, { junk: true }],
      nextCursor: 'Mw',
    });
    expect(page?.rows).toHaveLength(1);
    expect(page?.nextCursor).toBe('Mw');
    expect(page?.mode).toBe('preview');
  });

  it('reads live mode and a null cursor', () => {
    const page = parseBoardPage({ mode: 'live', total: 0, rows: [], nextCursor: null });
    expect(page).toEqual({ mode: 'live', samplesIncluded: false, total: 0, rows: [], nextCursor: null });
  });

  it('rejects a body that is not a board page', () => {
    expect(parseBoardPage({ error: 'unavailable' })).toBeNull();
  });
});
