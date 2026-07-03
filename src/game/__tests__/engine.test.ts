import { describe, expect, it } from 'vitest';

import {
  FIXED_WEEKLY_BURN,
  INDUSTRY_MULTIPLE,
  STARTING_CASH,
  STARTING_HEADCOUNT,
  STARTING_HYPE,
  STARTING_MARKET_SHARE,
  STARTING_MORALE,
  VALUATION_HISTORY_CAP,
  WEEKLY_SALARY,
  clamp,
  payrollFor,
  qualityAfterTick,
  revenueFor,
  salesFactorFor,
  shareShiftFor,
  supportProtectionFactor,
  valuationFor,
  weeklyBurnFor,
} from '../balance';
import { newGame, reduce, tick } from '../engine';
import { SCRAPPY_DECK } from '../events/scrappy';
import { GameState } from '../types';

const tickN = (state: GameState, n: number): GameState => {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s);
  return s;
};

describe('newGame', () => {
  it('produces the documented starting shape', () => {
    const s = newGame(1);
    expect(s.week).toBe(0);
    expect(s.cash).toBe(STARTING_CASH);
    expect(s.headcount).toEqual(STARTING_HEADCOUNT);
    expect(s.gameOver).toBeNull();
    // rng.counter is nonzero: generating the initial CTO/CMO/CFO offers consumes draws.
    expect(s.rng.counter).toBeGreaterThan(0);
    expect(s.createdWithSeed).toBe(1);
    expect(s.hype).toBe(STARTING_HYPE);
    expect(s.marketShare).toBe(STARTING_MARKET_SHARE);
    expect(s.valuationHistory).toEqual([]);
    expect(s.cLevels.cto.hired).toBeNull();
    expect(s.cLevels.cto.candidates).toHaveLength(3);
  });
});

describe('product quality', () => {
  it('more devs grow quality faster', () => {
    const slower = qualityAfterTick(10, 3, STARTING_MORALE);
    const faster = qualityAfterTick(10, 10, STARTING_MORALE);
    expect(faster).toBeGreaterThan(slower);
  });

  it('decays toward zero with no devs', () => {
    const q1 = qualityAfterTick(100, 0, STARTING_MORALE);
    expect(q1).toBeLessThan(100);
    const q2 = qualityAfterTick(q1, 0, STARTING_MORALE);
    expect(q2).toBeLessThan(q1);
  });
});

describe('revenue + valuation formulas', () => {
  it('revenueFor matches quality × marketShare × hype × salesFactor exactly', () => {
    expect(revenueFor(1000, 0.2, 1.5, 1.2)).toBe(1000 * 0.2 * 1.5 * 1.2);
  });

  it('valuationFor matches revenue × industryMultiple × hype exactly', () => {
    expect(valuationFor(1000, 1.3)).toBe(1000 * INDUSTRY_MULTIPLE * 1.3);
  });
});

describe('valuationHistory', () => {
  it('grows one entry per tick and caps at VALUATION_HISTORY_CAP', () => {
    // Generous cash so the run survives well past the cap window; deck
    // exhausted so a decision card can't freeze the loop partway through.
    let s: GameState = {
      ...newGame(1),
      cash: 50_000_000,
      drawnEventIds: SCRAPPY_DECK.map((c) => c.id),
    };
    const weeks = VALUATION_HISTORY_CAP + 20;
    for (let i = 0; i < weeks; i++) {
      s = tick(s);
      expect(s.valuationHistory.length).toBe(Math.min(i + 1, VALUATION_HISTORY_CAP));
    }
    expect(s.valuationHistory.length).toBe(VALUATION_HISTORY_CAP);
  });
});

describe('balance math', () => {
  it('payroll sums salaries across roles', () => {
    expect(payrollFor({ devs: 2, sales: 1, support: 0 })).toBe(
      2 * WEEKLY_SALARY.devs + WEEKLY_SALARY.sales,
    );
  });

  it('weekly burn adds fixed overhead to payroll', () => {
    const hc = STARTING_HEADCOUNT;
    expect(weeklyBurnFor(hc)).toBe(payrollFor(hc) + FIXED_WEEKLY_BURN);
  });
});

describe('tick', () => {
  it('deducts burn net of that week\'s revenue and advances the clock', () => {
    const s0 = newGame(7);
    const burn = weeklyBurnFor(s0.headcount);
    const quality = qualityAfterTick(s0.productQuality, s0.headcount.devs, s0.morale);

    // tick() shifts market share against each rival before computing revenue.
    const protection = supportProtectionFactor(s0.headcount.support);
    const shareDelta = s0.rivals.reduce((sum, rival) => {
      const shift = shareShiftFor(quality, rival.productQuality);
      return sum + (shift < 0 ? shift * protection : shift);
    }, 0);
    const marketShare = clamp(s0.marketShare + shareDelta, 0, 1);

    const revenue = revenueFor(quality, marketShare, s0.hype, salesFactorFor(s0.headcount.sales));
    const s1 = tick(s0);
    expect(s1.week).toBe(1);
    expect(s1.cash).toBe(STARTING_CASH - burn + revenue);
    // does not mutate the input
    expect(s0.week).toBe(0);
    expect(s0.cash).toBe(STARTING_CASH);
  });
});

describe('determinism', () => {
  it('same seed ⇒ identical state after 50 ticks', () => {
    const a = tickN(newGame(42), 50);
    const b = tickN(newGame(42), 50);
    expect(a).toEqual(b);
  });
});

describe('bankruptcy', () => {
  it('ends the run once cash goes below zero with no rounds left, and then freezes', () => {
    const MAX_WEEKS = 500; // safety cap so a broken economy fails loudly, not by hanging

    // All 3 rounds already raised, and the event deck exhausted: no lifeline
    // and no decision cards to freeze the loop — isolates pure burn mechanics.
    let s: GameState = {
      ...newGame(3),
      roundsRaised: 3,
      drawnEventIds: SCRAPPY_DECK.map((c) => c.id),
    };
    let weeks = 0;
    while (!s.gameOver && weeks < MAX_WEEKS) {
      s = tick(s);
      weeks++;
    }
    expect(s.gameOver).toBe('bankruptcy');
    expect(s.cash).toBeLessThan(0);

    // Further ticks are no-ops once the run is over.
    const frozen = tick(s);
    expect(frozen).toEqual(s);
  });

  it('does not end the run on negative cash while a round is still raisable', () => {
    let s: GameState = { ...newGame(4), cash: -1_000_000 };
    s = tick(s);
    expect(s.gameOver).toBeNull();
    expect(s.roundsRaised).toBe(0);
  });
});

describe('reduce', () => {
  it('routes TICK through tick()', () => {
    const s0 = newGame(9);
    expect(reduce(s0, { type: 'TICK' })).toEqual(tick(s0));
  });

  it('NEW_GAME produces a fresh deterministic run', () => {
    const started = tickN(newGame(5), 3);
    const reset = reduce(started, { type: 'NEW_GAME', seed: 5 });
    expect(reset).toEqual(newGame(5));
  });
});
