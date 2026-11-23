import { describe, expect, it } from 'vitest';

import {
  FIRST_ALL_NIGHTER_WEEKS,
  WEEKS_BANK_CAP,
  advanceFirstAllNighter,
  canClaimFirstAllNighter,
  creditFirstAllNighter,
  initialFirstAllNighterStatus,
  initialPurchasedWeeksPool,
  isWeekBudgetExhausted,
  parseFirstAllNighterStatus,
  spendWeekFromPools,
  type FirstAllNighterStatus,
  type WeekBudget,
} from '../week-budget';

const T0 = new Date('2026-11-23T10:00:00');
const atWall: WeekBudget = { weeksRemaining: 0, regenFrom: T0.getTime(), wallHitAt: T0.getTime() };

/** Walks the store's lifecycle: every successful advance, then (maybe) a claim at the wall. */
function play(steps: ('advance' | 'hit_wall' | 'return')[]): FirstAllNighterStatus {
  let status = initialFirstAllNighterStatus(false);
  for (const step of steps) {
    status = advanceFirstAllNighter(status, {
      returningFromWall: step === 'return',
      hitWall: step === 'hit_wall',
    });
  }
  return status;
}

describe('first all-nighter eligibility', () => {
  it('a fresh install is eligible; a wall veteran picking up the OTA is not', () => {
    expect(initialFirstAllNighterStatus(false)).toBe('eligible');
    expect(initialFirstAllNighterStatus(true)).toBe('ineligible');
  });

  it('is offered at the first wall only', () => {
    expect(play(['advance', 'advance'])).toBe('eligible');
    expect(play(['advance', 'hit_wall'])).toBe('offered');
    expect(canClaimFirstAllNighter('offered', true)).toBe(true);
  });

  it('getting past the first wall unclaimed retires it for good', () => {
    const status = play(['hit_wall', 'return', 'hit_wall']);
    expect(status).toBe('ineligible');
    expect(canClaimFirstAllNighter(status, true)).toBe(false);
  });

  it('can only be claimed at the wall', () => {
    expect(canClaimFirstAllNighter('offered', false)).toBe(false);
    expect(canClaimFirstAllNighter('eligible', true)).toBe(false);
    expect(canClaimFirstAllNighter(null, true)).toBe(false);
  });

  it('is claimable once: a claimed install is never offered again', () => {
    let status: FirstAllNighterStatus = 'claimed';
    expect(canClaimFirstAllNighter(status, true)).toBe(false);
    status = advanceFirstAllNighter(status, { returningFromWall: true, hitWall: true });
    expect(status).toBe('claimed');
    expect(canClaimFirstAllNighter(status, true)).toBe(false);
  });

  it('reads garbage in storage as spent, never as a fresh gift', () => {
    expect(parseFirstAllNighterStatus(null)).toBeNull();
    expect(parseFirstAllNighterStatus('offered')).toBe('offered');
    expect(parseFirstAllNighterStatus('{"oops":1}')).toBe('ineligible');
  });
});

describe('creditFirstAllNighter', () => {
  it('credits the free budget and lifts the wall', () => {
    const credited = creditFirstAllNighter(atWall);
    expect(credited.weeksRemaining).toBe(FIRST_ALL_NIGHTER_WEEKS);
    expect(isWeekBudgetExhausted(credited, initialPurchasedWeeksPool(), false)).toBe(false);
  });

  it('keeps the regen clock running and the wall stamp for returned_after_wall', () => {
    const credited = creditFirstAllNighter(atWall);
    expect(credited.regenFrom).toBe(atWall.regenFrom);
    expect(credited.wallHitAt).toBe(atWall.wallHitAt);
  });

  it('never touches the purchased pool: the gift is spent before it', () => {
    const purchased = { weeksRemaining: 20, grantedTransactionIds: ['tx-1'], weeksSpent: 0 };
    const spent = spendWeekFromPools(creditFirstAllNighter(atWall), purchased, T0);
    expect(spent.purchased).toBe(purchased);
    expect(spent.budget.weeksRemaining).toBe(FIRST_ALL_NIGHTER_WEEKS - 1);
  });

  it('stops the regen clock if the gift fills the bank', () => {
    const nearlyFull: WeekBudget = { weeksRemaining: WEEKS_BANK_CAP - 1, regenFrom: T0.getTime() };
    expect(creditFirstAllNighter(nearlyFull).regenFrom).toBeNull();
  });
});
