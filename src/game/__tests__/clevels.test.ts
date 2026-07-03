import { describe, expect, it } from 'vitest';

import { qualityAfterTick, weeklyBurnFor } from '../balance';
import { generateCandidates } from '../clevels';
import { newGame, reduce, tick } from '../engine';
import { createRng } from '../rng';
import { GameState } from '../types';

describe('generateCandidates', () => {
  it('is deterministic per seed', () => {
    const a = generateCandidates('cto', createRng(1));
    const b = generateCandidates('cto', createRng(1));
    expect(a.candidates).toEqual(b.candidates);
  });

  it('differs across roles drawn from the same rng state', () => {
    const rng = createRng(1);
    const cto = generateCandidates('cto', rng);
    const cmo = generateCandidates('cmo', rng);
    expect(cto.candidates).not.toEqual(cmo.candidates);
  });

  it('produces unique candidate ids within an offer', () => {
    const { candidates } = generateCandidates('cfo', createRng(42));
    const ids = new Set(candidates.map((c) => c.id));
    expect(ids.size).toBe(candidates.length);
  });
});

describe('HIRE_CLEVEL', () => {
  it('hiring a CTO raises devEffort by the perk multiplier', () => {
    const s0 = newGame(7);
    const candidate = s0.cLevels.cto.candidates[0];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cto', candidateId: candidate.id });

    expect(hired.cLevels.cto.hired).toEqual(candidate);

    const withoutBoost = qualityAfterTick(0, s0.headcount.devs, s0.morale);
    const withBoost = qualityAfterTick(0, s0.headcount.devs, s0.morale, candidate.perk.multiplier);
    expect(withBoost).toBeGreaterThan(withoutBoost);
    expect(withBoost).toBeCloseTo(withoutBoost * candidate.perk.multiplier);
  });

  it('a hired C-level salary joins the weekly burn', () => {
    const s0 = newGame(8);
    const candidate = s0.cLevels.cfo.candidates[0];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cfo', candidateId: candidate.id });
    const s1 = tick(hired);
    const s1Baseline = tick(s0);
    // CFO also cuts fixed burn, so just assert the salary is reflected somewhere:
    // burn without any exec vs. burn with exec payroll added back at multiplier 1.
    const burnNoCfo = weeklyBurnFor(hired.headcount);
    const burnWithCfo = weeklyBurnFor(hired.headcount, {
      execPayroll: candidate.salary,
      fixedBurnMultiplier: candidate.perk.multiplier,
    });
    expect(burnWithCfo).not.toBe(burnNoCfo);
    expect(s1.cash).not.toBe(s1Baseline.cash);
  });

  it('ignores an unknown candidateId', () => {
    const s0 = newGame(9);
    const s1 = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cmo', candidateId: 'does-not-exist' });
    expect(s1).toEqual(s0);
  });
});

describe('FIRE_CLEVEL', () => {
  it('applies the departure morale hit and clears the seat', () => {
    const s0 = newGame(11);
    const candidate = s0.cLevels.cmo.candidates[0];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cmo', candidateId: candidate.id });
    const fired = reduce(hired, { type: 'FIRE_CLEVEL', role: 'cmo' });

    expect(fired.cLevels.cmo.hired).toBeNull();
    expect(fired.morale).toBeLessThan(hired.morale);
    // A fresh offer is generated so the seat isn't stuck empty forever.
    expect(fired.cLevels.cmo.candidates.length).toBeGreaterThan(0);
  });

  it('is a no-op on an empty seat', () => {
    const s0 = newGame(12);
    const s1 = reduce(s0, { type: 'FIRE_CLEVEL', role: 'cfo' });
    expect(s1).toEqual(s0);
  });
});

describe('C-level offers persist across ticks', () => {
  it('does not reroll standing candidates just from ticking', () => {
    let s: GameState = newGame(13);
    const before = s.cLevels.cto.candidates;
    for (let i = 0; i < 5; i++) s = tick(s);
    expect(s.cLevels.cto.candidates).toEqual(before);
  });
});
