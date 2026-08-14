import { describe, expect, it } from 'vitest';

import { CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER } from '../../balance';
import { newGame, reduce } from '../../engine';
import { applyEventEffects } from '../apply';
import {
  CLEAN_RAISE_TERMS_FLAG,
  STANDUP_GOLDEN_STREAK_DAYS,
  STANDUP_RARE_STREAK_DAYS,
  STANDUP_UPGRADED_STREAK_DAYS,
  standupCardForStreak,
  standupTierForStreak,
} from '../standup';

describe('standupTierForStreak', () => {
  it('matches the PRD milestone table, forgivingly (>=, not ==)', () => {
    expect(standupTierForStreak(1)).toBe('base');
    expect(standupTierForStreak(STANDUP_UPGRADED_STREAK_DAYS - 1)).toBe('base');
    expect(standupTierForStreak(STANDUP_UPGRADED_STREAK_DAYS)).toBe('upgraded');
    expect(standupTierForStreak(STANDUP_GOLDEN_STREAK_DAYS - 1)).toBe('upgraded');
    expect(standupTierForStreak(STANDUP_GOLDEN_STREAK_DAYS)).toBe('golden');
    expect(standupTierForStreak(STANDUP_RARE_STREAK_DAYS - 1)).toBe('golden');
    expect(standupTierForStreak(STANDUP_RARE_STREAK_DAYS)).toBe('rare');
    expect(standupTierForStreak(STANDUP_RARE_STREAK_DAYS + 50)).toBe('rare');
  });
});

describe('standupCardForStreak', () => {
  it('is a real decision card with exactly 3 choices at every tier', () => {
    for (const streak of [1, STANDUP_UPGRADED_STREAK_DAYS, STANDUP_GOLDEN_STREAK_DAYS, STANDUP_RARE_STREAK_DAYS]) {
      const card = standupCardForStreak(streak);
      expect(card.kind).toBe('decision');
      expect(card.choices).toHaveLength(3);
    }
  });

  it('is deterministic: same streak, same card', () => {
    expect(standupCardForStreak(10)).toEqual(standupCardForStreak(10));
  });

  it('every reward stays within documented caps — no cash grant exceeds $25,000, no morale grant exceeds 15', () => {
    for (const streak of [1, STANDUP_UPGRADED_STREAK_DAYS, STANDUP_GOLDEN_STREAK_DAYS, STANDUP_RARE_STREAK_DAYS]) {
      const card = standupCardForStreak(streak);
      for (const choice of card.choices ?? []) {
        for (const delta of choice.effects.deltas ?? []) {
          if (delta.stat === 'cash') expect(delta.amount).toBeLessThanOrEqual(25_000);
          if (delta.stat === 'morale') expect(delta.amount).toBeLessThanOrEqual(15);
          if (delta.stat === 'hype') expect(delta.amount).toBeLessThanOrEqual(0.2);
        }
      }
    }
  });
});

describe('grantRoll effect (golden-tier reward)', () => {
  it('records one earned roll for the store to credit', () => {
    const s0 = newGame('Acme', 1);
    expect(s0.rollGrantsEarned).toBe(0);
    expect(applyEventEffects(s0, { grantRoll: true }).rollGrantsEarned).toBe(1);
  });

  it('counts monotonically, so two grants are never collapsed into one', () => {
    const s0 = newGame('Acme', 1);
    const twice = applyEventEffects(applyEventEffects(s0, { grantRoll: true }), { grantRoll: true });
    expect(twice.rollGrantsEarned).toBe(2);
  });

  it('touches nothing else — no seat is refilled and no rng is consumed', () => {
    const s0 = newGame('Acme', 2);
    const granted = applyEventEffects(s0, { grantRoll: true });
    expect(granted.cash).toBe(s0.cash);
    expect(granted.cLevels).toEqual(s0.cLevels);
    // The seats stay empty: the reward is a spin, not a free offer. That is
    // the whole point — the old refreshCandidates bypassed the roll budget.
    expect(granted.rng).toEqual(s0.rng);
  });

  it("is the golden tier's reward, and no other tier grants one", () => {
    const grantsRoll = (streakDays: number) =>
      (standupCardForStreak(streakDays).choices ?? []).some((c) => c.effects.grantRoll);
    expect(grantsRoll(STANDUP_GOLDEN_STREAK_DAYS)).toBe(true);
    for (const streakDays of [1, STANDUP_UPGRADED_STREAK_DAYS, STANDUP_RARE_STREAK_DAYS]) {
      expect(grantsRoll(streakDays)).toBe(false);
    }
  });
});

describe('clean raise terms flag (rare-tier reward)', () => {
  it('is set by setsFlag and consumed by the next RAISE_ROUND, discounting dilution', () => {
    const s0 = newGame('Acme', 3);
    const withFlag = applyEventEffects(s0, { setsFlag: CLEAN_RAISE_TERMS_FLAG });
    expect(withFlag.storyFlags).toContain(CLEAN_RAISE_TERMS_FLAG);

    const withoutFlag = reduce(s0, { type: 'RAISE_ROUND' });
    const withFlagRaised = reduce(withFlag, { type: 'RAISE_ROUND' });

    const baseDilutedEquity = withoutFlag.founderEquity;
    const discountedDilutedEquity = withFlagRaised.founderEquity;
    // A smaller dilution means founder equity ends up higher post-raise.
    expect(discountedDilutedEquity).toBeGreaterThan(baseDilutedEquity);
    // The flag is a one-time use — it's gone after the raise closes.
    expect(withFlagRaised.storyFlags).not.toContain(CLEAN_RAISE_TERMS_FLAG);
  });

  it('CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER is a genuine discount, not a no-op', () => {
    expect(CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER).toBeLessThan(1);
    expect(CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER).toBeGreaterThan(0);
  });
});
