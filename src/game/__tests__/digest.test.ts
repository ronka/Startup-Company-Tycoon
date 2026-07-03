import { describe, expect, it } from 'vitest';

import { buildDigestEntries, type WeeklySnapshot } from '../digest';
import { Rival } from '../types';

const rival = (name: string, marketShare: number): Rival => ({ name, productQuality: 0, marketShare });

const baseSnapshot = (overrides: Partial<WeeklySnapshot> = {}): WeeklySnapshot => ({
  revenue: 1000,
  burn: 1000,
  runway: 10,
  morale: 50,
  rivals: [rival('Nimbus', 0.2), rival('Meridian', 0.2)],
  ...overrides,
});

describe('buildDigestEntries', () => {
  it('is pure and deterministic: same inputs produce the same entries', () => {
    const before = baseSnapshot({ revenue: 900 });
    const after = baseSnapshot({ revenue: 1100 });
    expect(buildDigestEntries(before, after, 5)).toEqual(buildDigestEntries(before, after, 5));
  });

  it('emits nothing when nothing notable crossed', () => {
    const before = baseSnapshot();
    const after = baseSnapshot({ revenue: 1010, morale: 51 });
    expect(buildDigestEntries(before, after, 3)).toEqual([]);
  });

  it('flags crossing into profitability, and back out of it', () => {
    const wasUnprofitable = baseSnapshot({ revenue: 900, burn: 1000 });
    const nowProfitable = baseSnapshot({ revenue: 1100, burn: 1000 });
    const gained = buildDigestEntries(wasUnprofitable, nowProfitable, 4);
    expect(gained).toContainEqual(expect.objectContaining({ kind: 'digest', title: 'Profitable this week' }));

    const wasProfitable = baseSnapshot({ revenue: 1100, burn: 1000 });
    const nowUnprofitable = baseSnapshot({ revenue: 900, burn: 1000 });
    const lost = buildDigestEntries(wasProfitable, nowUnprofitable, 4);
    expect(lost).toContainEqual(expect.objectContaining({ kind: 'digest', title: 'Slipped into the red' }));
  });

  it('does not fire a profitability entry when already profitable both weeks', () => {
    const before = baseSnapshot({ revenue: 1100, burn: 1000 });
    const after = baseSnapshot({ revenue: 1200, burn: 1000 });
    const entries = buildDigestEntries(before, after, 1);
    expect(entries.some((e) => e.title.includes('Profitable') || e.title.includes('red'))).toBe(false);
  });

  it('flags runway crossing the 8-week bridge threshold in either direction', () => {
    const droppedBelow = buildDigestEntries(baseSnapshot({ runway: 9 }), baseSnapshot({ runway: 7 }), 2);
    expect(droppedBelow).toContainEqual(expect.objectContaining({ title: 'Runway under 8 weeks' }));

    const climbedAbove = buildDigestEntries(baseSnapshot({ runway: 7 }), baseSnapshot({ runway: 9 }), 2);
    expect(climbedAbove).toContainEqual(expect.objectContaining({ title: 'Runway back over 8 weeks' }));
  });

  it('treats infinite runway (burn <= revenue) as above the threshold', () => {
    const entries = buildDigestEntries(
      baseSnapshot({ runway: 7 }),
      baseSnapshot({ runway: Infinity }),
      2,
    );
    expect(entries).toContainEqual(expect.objectContaining({ title: 'Runway back over 8 weeks' }));
  });

  it('flags each morale band crossed, and only the bands actually crossed', () => {
    const oneBand = buildDigestEntries(baseSnapshot({ morale: 45 }), baseSnapshot({ morale: 55 }), 6);
    expect(oneBand).toHaveLength(1);
    expect(oneBand[0]).toMatchObject({ title: 'Morale climbed past 50' });

    const twoBands = buildDigestEntries(baseSnapshot({ morale: 25 }), baseSnapshot({ morale: 75 }), 6);
    expect(twoBands.map((e) => e.title)).toEqual([
      'Morale climbed past 30',
      'Morale climbed past 50',
      'Morale climbed past 70',
    ]);

    const droppingThrough = buildDigestEntries(baseSnapshot({ morale: 60 }), baseSnapshot({ morale: 20 }), 6);
    expect(droppingThrough.map((e) => e.title)).toEqual([
      'Morale dropped below 30',
      'Morale dropped below 50',
    ]);
  });

  it('does not re-fire a band that was already crossed and stays crossed', () => {
    const entries = buildDigestEntries(baseSnapshot({ morale: 60 }), baseSnapshot({ morale: 65 }), 6);
    expect(entries).toEqual([]);
  });

  it('flags a rival move of >= 1% share and ignores smaller moves', () => {
    const before = baseSnapshot({ rivals: [rival('Nimbus', 0.2), rival('Meridian', 0.2)] });

    const bigGain = buildDigestEntries(
      before,
      baseSnapshot({ rivals: [rival('Nimbus', 0.19), rival('Meridian', 0.2)] }),
      3,
    );
    expect(bigGain).toContainEqual(expect.objectContaining({ title: 'Took share from Nimbus' }));

    const bigLoss = buildDigestEntries(
      before,
      baseSnapshot({ rivals: [rival('Nimbus', 0.22), rival('Meridian', 0.2)] }),
      3,
    );
    expect(bigLoss).toContainEqual(expect.objectContaining({ title: 'Nimbus gained ground' }));

    const tinyMove = buildDigestEntries(
      before,
      baseSnapshot({ rivals: [rival('Nimbus', 0.205), rival('Meridian', 0.2)] }),
      3,
    );
    expect(tinyMove).toEqual([]);
  });

  it('can emit multiple entries in the same tick when several thresholds cross at once', () => {
    const before = baseSnapshot({ revenue: 900, burn: 1000, runway: 7, morale: 25 });
    const after = baseSnapshot({ revenue: 1100, burn: 1000, runway: 12, morale: 55 });
    const entries = buildDigestEntries(before, after, 9);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.every((e) => e.week === 9 && e.kind === 'digest')).toBe(true);
  });
});
