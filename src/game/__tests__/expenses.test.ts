import { describe, expect, it } from 'vitest';

import {
  FIXED_WEEKLY_BURN,
  MORALE_LEVER_WEEKLY_COST,
  WEEKLY_SALARY,
  weeklyExpensesFor,
  weeklyStatsFor,
  WeeklyStatsInput,
} from '../balance';
import { newGame } from '../engine';
import { CLevelCandidate, CLevels, Role } from '../types';

function baseInput(overrides: Partial<WeeklyStatsInput> = {}): WeeklyStatsInput {
  const base = newGame('Acme', 1);
  return {
    headcount: base.headcount,
    cLevels: base.cLevels as CLevels,
    hype: 1,
    customers: 1_000,
    cash: 100_000,
    era: 'scrappy',
    moraleLeverActive: false,
    focus: 'core',
    ...overrides,
  };
}

function cfoWithBurnCut(multiplier: number): CLevels {
  const base = newGame('Acme', 1).cLevels as CLevels;
  const candidate: CLevelCandidate = {
    id: 'cfo-1',
    name: 'Pat',
    personality: 'frugal',
    salary: 6_000,
    perk: { id: 'cfo-burnCut', label: 'Burn cut', axis: 'cfo-burnCut', multiplier },
    quirk: null,
  };
  return { ...base, cfo: { hired: candidate, candidates: [] } };
}

describe('weeklyExpensesFor', () => {
  it('total matches weeklyStatsFor(state).burn for the base state', () => {
    const input = baseInput();
    expect(weeklyExpensesFor(input).total).toBeCloseTo(weeklyStatsFor(input).burn, 6);
  });

  it('total matches weeklyStatsFor(state).burn for hardware focus (COGS + 1.4x overhead)', () => {
    const input = baseInput({ focus: 'hardware', customers: 2_000 });
    const breakdown = weeklyExpensesFor(input);
    expect(breakdown.total).toBeCloseTo(weeklyStatsFor(input).burn, 6);
    expect(breakdown.lines.find((l) => l.label === 'Hardware COGS')?.amount).toBeGreaterThan(0);
    expect(breakdown.lines.find((l) => l.label === 'Overhead')?.amount).toBeCloseTo(FIXED_WEEKLY_BURN * 1.4, 6);
  });

  it('total matches weeklyStatsFor(state).burn with the morale lever on', () => {
    const input = baseInput({ moraleLeverActive: true });
    const breakdown = weeklyExpensesFor(input);
    expect(breakdown.total).toBeCloseTo(weeklyStatsFor(input).burn, 6);
    expect(breakdown.lines.find((l) => l.label === 'Morale perks')?.amount).toBe(MORALE_LEVER_WEEKLY_COST);
  });

  it('total matches weeklyStatsFor(state).burn with a hired CFO burn-cut perk', () => {
    const input = baseInput({ cLevels: cfoWithBurnCut(0.8) });
    const breakdown = weeklyExpensesFor(input);
    expect(breakdown.total).toBeCloseTo(weeklyStatsFor(input).burn, 6);
    expect(breakdown.lines.find((l) => l.label === 'Exec salaries')?.amount).toBe(6_000);
    expect(breakdown.lines.find((l) => l.label === 'Overhead')?.amount).toBeCloseTo(FIXED_WEEKLY_BURN * 0.8, 6);
  });

  it('total matches weeklyStatsFor(state).burn with execs hired (no burn-cut perk)', () => {
    const cLevels = cfoWithBurnCut(1);
    const input = baseInput({ cLevels });
    const breakdown = weeklyExpensesFor(input);
    expect(breakdown.total).toBeCloseTo(weeklyStatsFor(input).burn, 6);
    expect(breakdown.lines.find((l) => l.label === 'Exec salaries')?.amount).toBe(6_000);
  });

  it('omits the morale perks line when the lever is off', () => {
    const breakdown = weeklyExpensesFor(baseInput({ moraleLeverActive: false }));
    expect(breakdown.lines.find((l) => l.label === 'Morale perks')).toBeUndefined();
  });

  it('omits the hardware COGS line for a non-hardware focus', () => {
    const breakdown = weeklyExpensesFor(baseInput({ focus: 'core', customers: 5_000 }));
    expect(breakdown.lines.find((l) => l.label === 'Hardware COGS')).toBeUndefined();
  });

  it('omits the exec salaries line when no C-levels are hired', () => {
    const breakdown = weeklyExpensesFor(baseInput());
    expect(breakdown.lines.find((l) => l.label === 'Exec salaries')).toBeUndefined();
  });

  it('team-salaries detail matches headcount x WEEKLY_SALARY per role and sums to the line', () => {
    const headcount = { devs: 4, sales: 2, support: 1 };
    const breakdown = weeklyExpensesFor(baseInput({ headcount }));
    const teamLine = breakdown.lines.find((l) => l.label === 'Team salaries');
    const detail = teamLine?.detail ?? [];
    for (const role of Object.keys(WEEKLY_SALARY) as Role[]) {
      const roleLine = detail.find((l) => l.label.endsWith(role));
      expect(roleLine?.amount).toBe(headcount[role] * WEEKLY_SALARY[role]);
    }
    const sum = detail.reduce((a, b) => a + b.amount, 0);
    expect(sum).toBe(teamLine?.amount);
  });
});
