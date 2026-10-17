import { describe, expect, it } from 'vitest';

import type { OfficeTier } from '../engine/types';
import {
  advanceTierHold,
  GLOBAL_MAX_PEOPLE,
  headcountTier,
  initialTierHold,
  peopleShown,
  pickOfficeTier,
  WEALTH_THRESHOLDS,
  wealthTier,
} from '../select-office';

const MAPS = ([1, 2, 3, 4, 5, 6, 7, 8] as OfficeTier[]).map((tier) => ({
  tier,
  capacity: { comfortable: [3, 6, 10, 15, 22, 30, 42, 60][tier - 1], max: [8, 14, 20, 28, 36, 40, 40, 40][tier - 1] },
}));

const RICH = 50_000_000;
const POOR = 1_000;

describe('pickOfficeTier', () => {
  it('rich with 3 people: small office, no need for more space', () => {
    expect(pickOfficeTier(3, RICH, MAPS)).toBe(1);
  });
  it('rich with 60 people: the big fancy office', () => {
    expect(pickOfficeTier(60, RICH, MAPS)).toBe(8);
  });
  it('poor with 60 people: small cheap office, crowded', () => {
    expect(pickOfficeTier(60, POOR, MAPS)).toBe(1);
    expect(peopleShown(60, MAPS[0].capacity).crowded).toBe(true);
  });
  it('poor with 2 people: smallest office', () => {
    expect(pickOfficeTier(2, POOR, MAPS)).toBe(1);
  });
  it('more people than any office fits: top tier', () => {
    expect(headcountTier(500, MAPS)).toBe(8);
  });
});

describe('threshold edges', () => {
  it('a threshold is inclusive', () => {
    for (let i = 0; i < WEALTH_THRESHOLDS.length; i++) {
      expect(wealthTier(WEALTH_THRESHOLDS[i])).toBe(i + 1);
      if (i > 0) expect(wealthTier(WEALTH_THRESHOLDS[i] - 1)).toBe(i);
    }
  });
  it('comfortable capacity is inclusive', () => {
    expect(headcountTier(3, MAPS)).toBe(1);
    expect(headcountTier(4, MAPS)).toBe(2);
  });
  it('negative wealth is the cheapest office', () => {
    expect(wealthTier(-100_000)).toBe(1);
  });
});

describe('peopleShown', () => {
  it('caps at the office max and shows the rest as overflow', () => {
    expect(peopleShown(12, { comfortable: 3, max: 8 })).toEqual({ visible: 8, overflow: 4, crowded: true });
  });
  it('never draws more than the global cap', () => {
    expect(peopleShown(100, { comfortable: 80, max: 90 }).visible).toBe(GLOBAL_MAX_PEOPLE);
  });
  it('an empty company draws nobody', () => {
    expect(peopleShown(0, { comfortable: 3, max: 8 })).toEqual({ visible: 0, overflow: 0, crowded: false });
  });
});

describe('advanceTierHold', () => {
  const tier3Edge = WEALTH_THRESHOLDS[2];

  it('ignores a wealth wobble right at a boundary', () => {
    let hold = initialTierHold(2);
    hold = advanceTierHold(hold, 50, tier3Edge + 1, MAPS); // tier 3, but only just
    expect(hold.shown).toBe(2);
    hold = advanceTierHold(hold, 50, tier3Edge - 1, MAPS); // back to 2
    expect(hold.shown).toBe(2);
    hold = advanceTierHold(hold, 50, tier3Edge + 1, MAPS);
    expect(hold.shown).toBe(2);
  });

  it('switches once the new tier holds for two refreshes', () => {
    let hold = initialTierHold(2);
    hold = advanceTierHold(hold, 50, tier3Edge + 1, MAPS);
    hold = advanceTierHold(hold, 50, tier3Edge + 1, MAPS);
    expect(hold.shown).toBe(3);
  });

  it('switches immediately when wealth clears the boundary by more than 5%', () => {
    const hold = advanceTierHold(initialTierHold(2), 50, tier3Edge * 1.06, MAPS);
    expect(hold.shown).toBe(3);
  });

  it('ignores a wobble when headcount needs exactly the tier wealth hovers at', () => {
    // 10 people need tier 3; wealth pokes just over the tier-3 threshold and back.
    let hold = initialTierHold(2);
    hold = advanceTierHold(hold, 10, tier3Edge + 1, MAPS);
    expect(hold.shown).toBe(2);
    hold = advanceTierHold(hold, 10, tier3Edge - 1, MAPS);
    expect(hold.shown).toBe(2);
  });

  it('switches immediately on a headcount change the company can afford', () => {
    const hold = advanceTierHold(initialTierHold(1), 5, RICH, MAPS);
    expect(hold.shown).toBe(2);
    expect(advanceTierHold(hold, 2, RICH, MAPS).shown).toBe(1);
  });
});
