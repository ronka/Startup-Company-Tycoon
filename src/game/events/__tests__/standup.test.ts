import { describe, expect, it } from 'vitest';

import { CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER } from '../../balance';
import { newGame, reduce } from '../../engine';
import { GameState } from '../../types';
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

describe('refreshCandidates effect (golden-tier reward)', () => {
  it('rerolls every open C-level seat, leaving hired seats untouched', () => {
    const s0 = newGame('Acme', 1);
    const hired = s0.cLevels.cto.candidates[0];
    const withHire: GameState = {
      ...s0,
      cLevels: { ...s0.cLevels, cto: { hired, candidates: s0.cLevels.cto.candidates } },
    };

    const refreshed = applyEventEffects(withHire, { refreshCandidates: true });

    expect(refreshed.cLevels.cto).toEqual(withHire.cLevels.cto); // hired seat untouched
    expect(refreshed.cLevels.cmo.candidates).not.toEqual(withHire.cLevels.cmo.candidates);
    expect(refreshed.cLevels.cfo.candidates).not.toEqual(withHire.cLevels.cfo.candidates);
    expect(refreshed.cLevels.cmo.hired).toBeNull();
  });

  it('is a no-op on cash/morale/hype and consumes rng deterministically', () => {
    const s0 = newGame('Acme', 2);
    const a = applyEventEffects(s0, { refreshCandidates: true });
    const b = applyEventEffects(s0, { refreshCandidates: true });
    expect(a.cash).toBe(s0.cash);
    expect(a).toEqual(b);
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
