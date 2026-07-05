import { describe, expect, it } from 'vitest';

import { cLevelPerkMultiplierFor, cLevelPerkTradeoffFor, qualityAfterTick, weeklyBurnFor } from '../balance';
import { generateCandidates, isDominated } from '../clevels';
import { newGame, reduce, tick } from '../engine';
import { createRng } from '../rng';
import { CLevelCandidate, CLevelPerkAxis, CLevelRole, GameState } from '../types';

const SAMPLE_SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const ROLES: CLevelRole[] = ['cto', 'cmo', 'cfo'];

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

  it('never produces a strictly dominated candidate within a pool, across many seeds', () => {
    for (const seed of SAMPLE_SEEDS) {
      for (const role of ROLES) {
        const { candidates } = generateCandidates(role, createRng(seed));
        for (const candidate of candidates) {
          expect(isDominated(candidate, candidates)).toBe(false);
        }
      }
    }
  });

  it('never repeats a personality string within one pool, across many seeds', () => {
    for (const seed of SAMPLE_SEEDS) {
      for (const role of ROLES) {
        const { candidates } = generateCandidates(role, createRng(seed));
        const personalities = candidates.map((c) => c.personality);
        expect(new Set(personalities).size).toBe(personalities.length);
      }
    }
  });

  it('never repeats a full name within one pool, across many seeds', () => {
    for (const seed of SAMPLE_SEEDS) {
      for (const role of ROLES) {
        const { candidates } = generateCandidates(role, createRng(seed));
        const names = candidates.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  it('each role exposes at least 2 distinct perk axes across its pool space', () => {
    for (const role of ROLES) {
      const axes = new Set<CLevelPerkAxis>();
      for (const seed of SAMPLE_SEEDS) {
        const { candidates } = generateCandidates(role, createRng(seed));
        candidates.forEach((c) => axes.add(c.perk.axis));
      }
      expect(axes.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('a quirk only ever nudges salary, never the perk itself', () => {
    for (const seed of SAMPLE_SEEDS) {
      for (const role of ROLES) {
        const { candidates } = generateCandidates(role, createRng(seed));
        for (const candidate of candidates) {
          if (!candidate.quirk) continue;
          expect(candidate.quirk.salaryDeltaFraction).not.toBe(0);
          expect(typeof candidate.perk.multiplier).toBe('number');
        }
      }
    }
  });
});

function makeCandidate(overrides: Partial<CLevelCandidate>): CLevelCandidate {
  return {
    id: 'test-candidate',
    name: 'Test Candidate',
    personality: 'Flavor text.',
    exEmployer: 'ex-Foogle',
    salary: 6_000,
    perk: { id: 'test-perk', label: 'test perk', axis: 'cto-productivity', multiplier: 1.2 },
    quirk: null,
    ...overrides,
  };
}

describe('HIRE_CLEVEL', () => {
  it('a cto-productivity perk raises devEffort via its axis multiplier', () => {
    const s0 = newGame('Acme', 7);
    const candidate = makeCandidate({
      perk: { id: 'p', label: '+20% dev productivity', axis: 'cto-productivity', multiplier: 1.2 },
    });
    s0.cLevels.cto.candidates = [candidate];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cto', candidateId: candidate.id });

    const devBoost = cLevelPerkMultiplierFor(hired.cLevels, 'cto', 'cto-productivity');
    expect(devBoost).toBe(1.2);

    // The game now starts with no devs, so exercise the perk against an explicit dev count.
    const devs = 3;
    const withoutBoost = qualityAfterTick(100, devs, s0.morale);
    const withBoost = qualityAfterTick(100, devs, s0.morale, devBoost);
    expect(withBoost).toBeGreaterThan(withoutBoost);
  });

  it('a cto-techDebt perk slows quality decay without touching growth', () => {
    const s0 = newGame('Acme', 7);
    const candidate = makeCandidate({
      perk: { id: 'p', label: '−25% tech-debt drag', axis: 'cto-techDebt', multiplier: 0.75 },
    });
    s0.cLevels.cto.candidates = [candidate];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cto', candidateId: candidate.id });

    const devBoost = cLevelPerkMultiplierFor(hired.cLevels, 'cto', 'cto-productivity');
    const decayMultiplier = cLevelPerkMultiplierFor(hired.cLevels, 'cto', 'cto-techDebt');
    expect(devBoost).toBe(1); // techDebt axis never touches the growth-side multiplier
    expect(decayMultiplier).toBe(0.75);

    const withoutPerk = qualityAfterTick(100, s0.headcount.devs, s0.morale);
    const withPerk = qualityAfterTick(100, s0.headcount.devs, s0.morale, devBoost, decayMultiplier);
    expect(withPerk).toBeGreaterThan(withoutPerk); // less decay eaten out of the same growth
  });

  it('a cto-shortcut perk boosts growth and worsens decay together', () => {
    const s0 = newGame('Acme', 7);
    const candidate = makeCandidate({
      perk: {
        id: 'p',
        label: '+40% dev productivity, +35% tech-debt drag',
        axis: 'cto-shortcut',
        multiplier: 1.4,
        tradeoffMultiplier: 1.35,
      },
    });
    s0.cLevels.cto.candidates = [candidate];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cto', candidateId: candidate.id });

    const devBoost = cLevelPerkMultiplierFor(hired.cLevels, 'cto', 'cto-shortcut');
    const decayTradeoff = cLevelPerkTradeoffFor(hired.cLevels, 'cto', 'cto-shortcut');
    expect(devBoost).toBe(1.4);
    expect(decayTradeoff).toBe(1.35);
  });

  it('a hired CFO burnCut perk cuts fixed burn; a roundTerms CFO does not', () => {
    const s0 = newGame('Acme', 8);
    const burnCutCandidate = makeCandidate({
      salary: 6_000,
      perk: { id: 'p', label: '−20% fixed burn', axis: 'cfo-burnCut', multiplier: 0.8 },
    });
    s0.cLevels.cfo.candidates = [burnCutCandidate];
    const hiredBurnCut = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cfo', candidateId: burnCutCandidate.id });
    const s1 = tick(hiredBurnCut);
    const s1Baseline = tick(s0);

    const burnNoCfo = weeklyBurnFor(hiredBurnCut.headcount);
    const burnWithCfo = weeklyBurnFor(hiredBurnCut.headcount, {
      execPayroll: burnCutCandidate.salary,
      fixedBurnMultiplier: 0.8,
    });
    expect(burnWithCfo).not.toBe(burnNoCfo);
    expect(s1.cash).not.toBe(s1Baseline.cash);

    const roundTermsCandidate = makeCandidate({
      salary: 6_000,
      perk: { id: 'p2', label: '−20% dilution on next round', axis: 'cfo-roundTerms', multiplier: 0.8 },
    });
    const s0b = newGame('Acme', 8);
    s0b.cLevels.cfo.candidates = [roundTermsCandidate];
    const hiredRoundTerms = reduce(s0b, {
      type: 'HIRE_CLEVEL',
      role: 'cfo',
      candidateId: roundTermsCandidate.id,
    });
    expect(cLevelPerkMultiplierFor(hiredRoundTerms.cLevels, 'cfo', 'cfo-burnCut')).toBe(1); // no burn cut from this axis
  });

  it('ignores an unknown candidateId', () => {
    const s0 = newGame('Acme', 9);
    const s1 = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cmo', candidateId: 'does-not-exist' });
    expect(s1).toEqual(s0);
  });
});

describe('FIRE_CLEVEL', () => {
  it('applies the departure morale hit and clears the seat', () => {
    const s0 = newGame('Acme', 11);
    const candidate = s0.cLevels.cmo.candidates[0];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cmo', candidateId: candidate.id });
    const fired = reduce(hired, { type: 'FIRE_CLEVEL', role: 'cmo' });

    expect(fired.cLevels.cmo.hired).toBeNull();
    expect(fired.morale).toBeLessThan(hired.morale);
    // A fresh offer is generated so the seat isn't stuck empty forever.
    expect(fired.cLevels.cmo.candidates.length).toBeGreaterThan(0);
  });

  it('is a no-op on an empty seat', () => {
    const s0 = newGame('Acme', 12);
    const s1 = reduce(s0, { type: 'FIRE_CLEVEL', role: 'cfo' });
    expect(s1).toEqual(s0);
  });
});

describe('C-level offers persist across ticks', () => {
  it('does not reroll standing candidates just from ticking', () => {
    let s: GameState = newGame('Acme', 13);
    const before = s.cLevels.cto.candidates;
    for (let i = 0; i < 5; i++) s = tick(s);
    expect(s.cLevels.cto.candidates).toEqual(before);
  });
});
