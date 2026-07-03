import { describe, expect, it } from 'vitest';

import {
  BANKRUPTCY_FUSE_WEEKS,
  DEV_EFFORT_EXPONENT,
  DEV_EFFORT_PER_DEV,
  FIXED_WEEKLY_BURN,
  HYPE_DECAY_RATE,
  INDUSTRY_MULTIPLE,
  REVENUE_PER_QUALITY_SHARE,
  STARTING_CASH,
  STARTING_HEADCOUNT,
  STARTING_HYPE,
  STARTING_MARKET_SHARE,
  STARTING_MORALE,
  VALUATION_HISTORY_CAP,
  WEEKLY_SALARY,
  clamp,
  devEffort,
  hypeAfterTick,
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
import { rivalGrowthMultiplier } from '../rivals';
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

  it('devEffort is sublinear: doubling headcount less than doubles output', () => {
    const oneDev = devEffort(5);
    const twoDev = devEffort(10);
    expect(twoDev).toBeGreaterThan(oneDev);
    expect(twoDev).toBeLessThan(oneDev * 2);
  });

  it('devEffort matches the devs^exponent shape exactly', () => {
    expect(devEffort(7)).toBeCloseTo(Math.pow(7, DEV_EFFORT_EXPONENT) * DEV_EFFORT_PER_DEV);
  });
});

describe('revenue + valuation formulas', () => {
  it('revenueFor matches quality × marketShare × hype × salesFactor × the revenue scalar exactly', () => {
    expect(revenueFor(1000, 0.2, 1.5, 1.2)).toBe(1000 * 0.2 * 1.5 * 1.2 * REVENUE_PER_QUALITY_SHARE);
  });

  it('valuationFor matches revenue × industryMultiple × hype exactly', () => {
    expect(valuationFor(1000, 1.3)).toBe(1000 * INDUSTRY_MULTIPLE * 1.3);
  });
});

describe('hype decay', () => {
  it('closes ~5% of the gap to 1.0 each week', () => {
    expect(hypeAfterTick(2.0)).toBeCloseTo(2.0 + (1.0 - 2.0) * HYPE_DECAY_RATE);
    expect(hypeAfterTick(0.5)).toBeCloseTo(0.5 + (1.0 - 0.5) * HYPE_DECAY_RATE);
  });

  it('is a fixed point at 1.0', () => {
    expect(hypeAfterTick(1.0)).toBe(1.0);
  });

  it('drifts toward 1.0 from above and below over many ticks', () => {
    let hot = 3.0;
    let cold = 0.2;
    for (let i = 0; i < 100; i++) {
      hot = hypeAfterTick(hot);
      cold = hypeAfterTick(cold);
    }
    expect(Math.abs(hot - 1.0)).toBeLessThan(0.05);
    expect(Math.abs(cold - 1.0)).toBeLessThan(0.05);
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

describe('weekly digest (wired into tick)', () => {
  const craterMorale = (state: GameState): GameState => {
    let s = reduce(state, { type: 'SET_PENDING_HIRES', role: 'devs', delta: -2 });
    s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: -1 });
    return reduce(s, { type: 'SET_PENDING_HIRES', role: 'support', delta: -1 });
  };

  it('appends kind:"digest" entries when a big layoff craters morale through every band', () => {
    const s0 = craterMorale(newGame(11));
    const s1 = tick(s0);
    const digestEntries = s1.newsLog.filter((e) => e.kind === 'digest' && e.week === s1.week);
    expect(digestEntries.map((e) => e.title)).toEqual(
      expect.arrayContaining([
        'Morale dropped below 30',
        'Morale dropped below 50',
        'Morale dropped below 70',
      ]),
    );
  });

  it('does not re-fire a morale-band entry while morale stays under the band', () => {
    const s1 = tick(craterMorale(newGame(11)));
    expect(s1.morale).toBeLessThan(30);

    const s2 = tick(s1); // no further cuts queued; morale drifts up but stays under 30
    expect(s2.morale).toBeLessThan(30);
    const secondWeekDigest = s2.newsLog.filter((e) => e.kind === 'digest' && e.week === s2.week);
    expect(secondWeekDigest.some((e) => e.title.startsWith('Morale'))).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const runDigest = () => tick(craterMorale(newGame(11))).newsLog.filter((e) => e.kind === 'digest');
    expect(runDigest()).toEqual(runDigest());
  });

  it('every tick produces the underlying cash/revenue numbers the UI can summarize regardless of whether any threshold crossed', () => {
    // digest entries are opportunistic extras — the week-in-review sheet's
    // baseline content (cash delta, revenue vs burn) always comes from the
    // resulting state directly, never from newsLog.
    const s1 = tick(newGame(3));
    expect(typeof s1.cash).toBe('number');
    expect(typeof s1.week).toBe('number');
  });
});

describe('hiring feedback loop', () => {
  it('hiring 2 more devs measurably changes weekly revenue within 3 ticks', () => {
    // Drain the deck so a decision card can't freeze one branch and not the
    // other, and give both branches generous cash so neither goes bankrupt
    // mid-comparison.
    const base: GameState = {
      ...newGame(11),
      cash: 5_000_000,
      drawnEventIds: SCRAPPY_DECK.map((c) => c.id),
    };
    const baseline = tickN(base, 3);

    const withMoreDevs: GameState = {
      ...base,
      headcount: { ...base.headcount, devs: base.headcount.devs + 2 },
      pendingHeadcount: { ...base.pendingHeadcount, devs: base.pendingHeadcount.devs + 2 },
    };
    const boosted = tickN(withMoreDevs, 3);

    const baselineRevenue = revenueFor(
      baseline.productQuality,
      baseline.marketShare,
      baseline.hype,
      salesFactorFor(baseline.headcount.sales),
    );
    const boostedRevenue = revenueFor(
      boosted.productQuality,
      boosted.marketShare,
      boosted.hype,
      salesFactorFor(boosted.headcount.sales),
    );

    expect(boosted.productQuality).toBeGreaterThan(baseline.productQuality);
    // A noticeable lift: at least 10% more weekly revenue within 3 ticks.
    expect(boostedRevenue).toBeGreaterThan(baselineRevenue * 1.1);
  });
});

describe('rival growth scales with stage', () => {
  it('rivals grow faster after the player has raised rounds', () => {
    const noRounds = rivalGrowthMultiplier(0);
    const oneRound = rivalGrowthMultiplier(1);
    const threeRounds = rivalGrowthMultiplier(3);
    expect(oneRound).toBeGreaterThan(noRounds);
    expect(threeRounds).toBeGreaterThan(oneRound);
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
  it('ends the run after 3 consecutive weeks of negative cash, even with rounds unraised, and then freezes', () => {
    const MAX_WEEKS = 500; // safety cap so a broken economy fails loudly, not by hanging

    // No rounds raised, and the event deck exhausted: no lifeline and no
    // decision cards to freeze the loop — isolates pure burn mechanics. The
    // fuse must still fire even though a round is technically raisable.
    let s: GameState = {
      ...newGame(3),
      drawnEventIds: SCRAPPY_DECK.map((c) => c.id),
    };
    let weeks = 0;
    while (!s.gameOver && weeks < MAX_WEEKS) {
      s = tick(s);
      weeks++;
    }
    expect(s.gameOver).toBe('bankruptcy');
    expect(s.cash).toBeLessThan(0);
    expect(s.weeksInTheRed).toBe(BANKRUPTCY_FUSE_WEEKS);

    // Further ticks are no-ops once the run is over.
    const frozen = tick(s);
    expect(frozen).toEqual(s);
  });

  it('does not end the run before the fuse burns down, even deep in the red', () => {
    let s: GameState = { ...newGame(4), cash: -1_000_000 };
    s = tick(s);
    expect(s.gameOver).toBeNull();
    expect(s.weeksInTheRed).toBe(1);
  });
});

describe('weeksInTheRed', () => {
  // Deck exhausted so a decision card can't freeze tick() partway through
  // and stall the fuse count — isolates pure cash mechanics.
  const noEvents = { drawnEventIds: SCRAPPY_DECK.map((c) => c.id) };

  it('increments each tick cash stays negative, and resets the moment cash recovers', () => {
    let s: GameState = { ...newGame(5), ...noEvents, cash: -1_000_000 };
    expect(s.weeksInTheRed).toBe(0);

    s = tick(s);
    expect(s.weeksInTheRed).toBe(1);
    s = tick(s);
    expect(s.weeksInTheRed).toBe(2);

    // Recovers back into the black: fuse resets to 0.
    s = { ...s, cash: 1_000_000 };
    s = tick(s);
    expect(s.weeksInTheRed).toBe(0);
  });

  it('triggers bankruptcy exactly on the 3rd consecutive red week, not before', () => {
    let s: GameState = { ...newGame(6), ...noEvents, cash: -1_000_000 };
    s = tick(s);
    expect(s.gameOver).toBeNull();
    s = tick(s);
    expect(s.gameOver).toBeNull();
    s = tick(s);
    expect(s.gameOver).toBe('bankruptcy');
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
