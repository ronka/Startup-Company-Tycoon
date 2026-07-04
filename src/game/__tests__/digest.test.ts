import { describe, expect, it } from 'vitest';

import { buildDigestEntries, eraTransitionEntry, isNotableWeek, type WeeklySnapshot } from '../digest';
import { Rival } from '../types';

const rival = (name: string, marketShare: number, productQuality = 0): Rival => ({
  name,
  productQuality,
  marketShare,
  focus: 'core',
});

const baseSnapshot = (overrides: Partial<WeeklySnapshot> = {}): WeeklySnapshot => ({
  revenue: 1000,
  burn: 1000,
  runway: 10,
  morale: 50,
  marketShare: 0.6,
  rivals: [rival('Nimbus', 0.2), rival('Meridian', 0.2)],
  productQuality: 1,
  hype: 1,
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

  it('flags your net share move of >= 1% with one aggregate entry, attributed to the biggest mover', () => {
    const before = baseSnapshot({ marketShare: 0.6, rivals: [rival('Nimbus', 0.2), rival('Meridian', 0.2)] });

    const bigGain = buildDigestEntries(
      before,
      baseSnapshot({ marketShare: 0.61, rivals: [rival('Nimbus', 0.19), rival('Meridian', 0.2)] }),
      3,
    );
    expect(bigGain).toHaveLength(1);
    expect(bigGain).toContainEqual(
      expect.objectContaining({
        title: 'Gained 1.0% share this week',
        flavor: "Your product quality outpaced Nimbus's → +1.0% share.",
      }),
    );

    const bigLoss = buildDigestEntries(
      before,
      baseSnapshot({ marketShare: 0.58, rivals: [rival('Nimbus', 0.22, 2), rival('Meridian', 0.2)] }),
      3,
    );
    expect(bigLoss).toHaveLength(1);
    expect(bigLoss).toContainEqual(
      expect.objectContaining({
        title: 'Lost 2.0% share this week',
        flavor: "Nimbus's product quality outpaced yours → -2.0% share.",
      }),
    );

    const tinyMove = buildDigestEntries(
      before,
      baseSnapshot({ marketShare: 0.605, rivals: [rival('Nimbus', 0.198), rival('Meridian', 0.197)] }),
      3,
    );
    expect(tinyMove).toEqual([]);
  });

  it('never emits more than one share-movement entry per tick, even with several rivals moving', () => {
    const before = baseSnapshot({ marketShare: 0.6, rivals: [rival('Nimbus', 0.2), rival('Meridian', 0.2)] });
    const after = baseSnapshot({ marketShare: 0.65, rivals: [rival('Nimbus', 0.17), rival('Meridian', 0.18)] });
    const entries = buildDigestEntries(before, after, 3);
    expect(entries.filter((e) => e.title.includes('share this week'))).toHaveLength(1);
  });

  it('flags hype spiking past a band, and cooling back below it, in cause-and-effect form', () => {
    const spiked = buildDigestEntries(baseSnapshot({ hype: 1.1 }), baseSnapshot({ hype: 1.3 }), 7);
    expect(spiked).toContainEqual(
      expect.objectContaining({
        title: 'Hype spiked past 1.2x',
        flavor: expect.stringContaining('→'),
      }),
    );

    const cooled = buildDigestEntries(baseSnapshot({ hype: 1.3 }), baseSnapshot({ hype: 1.1 }), 7);
    expect(cooled).toContainEqual(
      expect.objectContaining({
        title: 'Hype cooled below 1.2x',
        flavor: expect.stringContaining('→'),
      }),
    );
  });

  it('reports only the highest hype band crossed in one jump, not every band', () => {
    const entries = buildDigestEntries(baseSnapshot({ hype: 1.0 }), baseSnapshot({ hype: 2.5 }), 7);
    expect(entries.filter((e) => e.title.startsWith('Hype'))).toEqual([
      expect.objectContaining({ title: 'Hype spiked past 2x' }),
    ]);
  });

  it('can emit multiple entries in the same tick when several thresholds cross at once', () => {
    const before = baseSnapshot({ revenue: 900, burn: 1000, runway: 7, morale: 25 });
    const after = baseSnapshot({ revenue: 1100, burn: 1000, runway: 12, morale: 55 });
    const entries = buildDigestEntries(before, after, 9);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.every((e) => e.week === 9 && e.kind === 'digest')).toBe(true);
  });
});

describe('eraTransitionEntry', () => {
  it('announces Boom and Reckoning with kind "era"', () => {
    expect(eraTransitionEntry('boom', 30)).toMatchObject({ week: 30, kind: 'era', title: expect.any(String) });
    expect(eraTransitionEntry('reckoning', 60)).toMatchObject({
      week: 60,
      kind: 'era',
      title: expect.any(String),
    });
  });

  it('never fires for scrappy, the starting era', () => {
    expect(eraTransitionEntry('scrappy', 0)).toBeNull();
  });
});

describe('isNotableWeek', () => {
  it('is not notable with zero entries', () => {
    expect(isNotableWeek([])).toBe(false);
  });

  it('is notable with any entry at all — event, digest, era, or plain', () => {
    expect(isNotableWeek([{ week: 1, title: 'x', flavor: 'y' }])).toBe(true);
    expect(isNotableWeek([{ week: 1, title: 'x', flavor: 'y', kind: 'digest' }])).toBe(true);
    expect(isNotableWeek([{ week: 1, title: 'x', flavor: 'y', kind: 'era' }])).toBe(true);
  });
});
