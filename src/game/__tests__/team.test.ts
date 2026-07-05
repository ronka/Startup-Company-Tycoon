import { describe, expect, it } from 'vitest';

import {
  MORALE_BASELINE,
  MORALE_HIT_PER_LAYOFF_FRACTION,
  maxHireableHeadcount,
  qualityAfterTick,
  weeklyBurnFor,
} from '../balance';
import { newGame, reduce, tick } from '../engine';
import { SCRAPPY_DECK } from '../events/scrappy';
import { GameState, Headcount } from '../types';

/** Deck exhausted up front so a test isolates pure engine mechanics from event RNG. */
const ALL_EVENT_IDS = SCRAPPY_DECK.map((c) => c.id);

/** A staffed starting roster — the game now starts empty, so tests that exercise team mechanics staff up explicitly. */
const STAFFED: Headcount = { devs: 3, sales: 1, support: 1 };

describe('SET_PENDING_HIRES', () => {
  it('queues a hire without changing headcount until the next tick', () => {
    const s0 = newGame('Acme', 1);
    const s1 = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 5 });
    expect(s1.headcount.devs).toBe(s0.headcount.devs);
    expect(s1.pendingHeadcount.devs).toBe(s0.headcount.devs + 5);
  });

  it('hire increases payroll starting next tick', () => {
    const s0 = newGame('Acme', 1);
    const hired = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 5 });
    const s1 = tick(hired);
    expect(s1.headcount.devs).toBe(s0.headcount.devs + 5);
    expect(weeklyBurnFor(s1.headcount)).toBeGreaterThan(weeklyBurnFor(s0.headcount));
  });

  it('cannot drop a role below 0', () => {
    const s0 = newGame('Acme', 1);
    const s1 = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'support', delta: -999 });
    expect(s1.pendingHeadcount.support).toBe(0);
  });

  it('cannot queue more than the cash-sanity cap', () => {
    const s0: GameState = { ...newGame('Acme', 1), cash: 10_000 };
    const s1 = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'devs', delta: 999 });
    expect(s1.pendingHeadcount.devs).toBe(maxHireableHeadcount('devs', s0.cash));
  });
});

describe('morale from layoffs', () => {
  it('firing 50% of devs drops morale by the balance-file ballpark', () => {
    const s0: GameState = { ...newGame('Acme', 2), headcount: { ...STAFFED }, pendingHeadcount: { ...STAFFED } };
    const cutDevs = Math.ceil(s0.headcount.devs / 2);
    const fired = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'devs', delta: -cutDevs });
    const s1 = tick(fired);

    const totalBefore = s0.headcount.devs + s0.headcount.sales + s0.headcount.support;
    const totalAfter = fired.pendingHeadcount.devs + s0.headcount.sales + s0.headcount.support;
    const expectedCutFraction = (totalBefore - totalAfter) / totalBefore;
    const expectedHit = expectedCutFraction * MORALE_HIT_PER_LAYOFF_FRACTION;

    // Morale drifted toward baseline *and* took the layoff hit in the same tick;
    // assert it's meaningfully lower than where it started, in the ballpark of the hit.
    expect(s1.morale).toBeLessThan(s0.morale);
    expect(s0.morale - s1.morale).toBeGreaterThan(expectedHit * 0.5);
  });

  it('hiring alone never hurts morale', () => {
    const s0 = newGame('Acme', 3);
    const hired = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'sales', delta: 3 });
    const s1 = tick(hired);
    expect(s1.morale).toBeGreaterThanOrEqual(s0.morale - 0.001);
  });
});

describe('morale drift', () => {
  it('drifts back toward baseline over time absent layoffs', () => {
    let s: GameState = {
      ...newGame('Acme', 4),
      morale: 20,
      cash: 50_000_000,
      drawnEventIds: ALL_EVENT_IDS,
    };
    const startingDistance = Math.abs(MORALE_BASELINE - s.morale);
    const distances: number[] = [];
    for (let i = 0; i < 10; i++) {
      distances.push(Math.abs(MORALE_BASELINE - s.morale));
      s = tick(s);
    }
    // Each week should close the gap to baseline (monotonically non-increasing distance).
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeLessThanOrEqual(distances[i - 1]);
    }
    expect(Math.abs(MORALE_BASELINE - s.morale)).toBeLessThan(startingDistance / 2);
  });
});

describe('morale affects quality growth', () => {
  it('low morale measurably slows quality growth over 10 ticks', () => {
    const devs = STAFFED.devs;
    let lowMorale = 10;
    let highMorale = 90;
    let qLow = 0;
    let qHigh = 0;
    for (let i = 0; i < 10; i++) {
      qLow = qualityAfterTick(qLow, devs, lowMorale);
      qHigh = qualityAfterTick(qHigh, devs, highMorale);
    }
    expect(qHigh).toBeGreaterThan(qLow);
  });
});
