import { describe, expect, it } from 'vitest';

import { buildShareText, sparkline, SPARK_BUCKETS, type ShareCardInput } from '../share-card';

const runOf = (overrides: Partial<ShareCardInput> = {}): ShareCardInput => ({
  companyName: 'Acorn Labs',
  reason: 'ipo',
  week: 68,
  score: 312_000_000,
  valuationHistory: [1, 2, 2, 4, 3, 5, 7, 8],
  ...overrides,
});

/** A rising series of `n` points, for exercising the downsampler. */
const rising = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sparkline', () => {
  it('maps a series onto low-to-high block glyphs', () => {
    expect(sparkline([1, 2, 2, 4, 3, 5, 7, 8])).toBe('▁▂▂▄▃▅▇█');
  });

  it('returns null when there is no shape to show', () => {
    expect(sparkline([])).toBeNull();
    expect(sparkline([42])).toBeNull();
  });

  it('renders a flat run mid-height rather than as a collapse', () => {
    expect(sparkline([5, 5, 5, 5])).toBe('▄▄▄▄');
  });

  it('downsamples a full-length history to exactly SPARK_BUCKETS glyphs', () => {
    // 104 is VALUATION_HISTORY_CAP — the longest series a run can produce.
    expect(sparkline(rising(104))).toHaveLength(SPARK_BUCKETS);
  });

  it('leaves short histories at their own length instead of padding', () => {
    expect(sparkline([1, 5, 3])).toHaveLength(3);
  });

  it('always spans trough to peak', () => {
    const line = sparkline(rising(50));
    expect(line?.startsWith('▁')).toBe(true);
    expect(line?.endsWith('█')).toBe(true);
  });

  it('honours a custom bucket count', () => {
    expect(sparkline(rising(50), 4)).toHaveLength(4);
  });
});

describe('buildShareText', () => {
  it('renders a winning run', () => {
    expect(buildShareText(runOf())).toBe(
      ['Startup Company Tycoon — Acorn Labs', '', '▁▂▂▄▃▅▇█  IPO, week 68', '$312M founder take'].join('\n'),
    );
  });

  it('renders a bankruptcy as $0 with no founder-take wording', () => {
    expect(
      buildShareText(
        runOf({
          companyName: 'Nimbus AI',
          reason: 'bankruptcy',
          week: 31,
          score: 0,
          valuationHistory: [3, 4, 5, 3, 2, 1, 1, 1],
        }),
      ),
    ).toBe(['Startup Company Tycoon — Nimbus AI', '', '▅▆█▅▃▁▁▁  Bankrupt, week 31', '$0'].join('\n'));
  });

  it('labels an acquisition', () => {
    expect(buildShareText(runOf({ reason: 'acquired' }))).toContain('Acquired, week 68');
  });

  it('drops the sparkline line when the run ended too early to have one', () => {
    const text = buildShareText(runOf({ week: 1, valuationHistory: [] }));
    expect(text).toBe(
      ['Startup Company Tycoon — Acorn Labs', '', 'IPO, week 1', '$312M founder take'].join('\n'),
    );
  });

  it('trims the trailing .0 that formatMoney keeps for in-app tables', () => {
    expect(buildShareText(runOf({ score: 312_000_000 }))).toContain('$312M');
    expect(buildShareText(runOf({ score: 1_500_000 }))).toContain('$1.5M');
  });

  it('stays within four lines so it fits a single post', () => {
    expect(buildShareText(runOf()).split('\n')).toHaveLength(4);
  });
});
