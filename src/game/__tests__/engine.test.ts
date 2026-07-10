import { describe, expect, it } from 'vitest';

import {
  ARPC,
  BANKRUPTCY_FUSE_WEEKS,
  BOOM_START_WEEK_MAX,
  BOOM_START_WEEK_MIN,
  DEV_EFFORT_EXPONENT,
  DEV_EFFORT_PER_DEV,
  ERA_DILUTION_MULTIPLIER,
  ERA_HYPE_DECAY_MULTIPLIER,
  ERA_IPO_WINDOW_OPEN,
  ERA_MORALE_BASELINE,
  ERA_ROUND_CASH_MULTIPLIER,
  ERA_VALUATION_MULTIPLE_MULTIPLIER,
  FIXED_WEEKLY_BURN,
  HYPE_DECAY_RATE,
  INDUSTRY_MULTIPLE,
  IPO_SUSTAIN_WEEKS,
  MORALE_ATTRITION_THRESHOLD,
  MORALE_CRISIS_PRODUCTIVITY_MULTIPLIER,
  MORALE_CRISIS_THRESHOLD,
  MORALE_LEVER_WEEKLY_COST,
  RECKONING_START_WEEK_MAX,
  RECKONING_START_WEEK_MIN,
  REVIVE_CASH,
  STARTING_CASH,
  STARTING_HEADCOUNT,
  STARTING_HYPE,
  STARTING_MARKET_SHARE,
  STARTING_MORALE,
  VALUATION_HISTORY_CAP,
  WEEKLY_SALARY,
  bottleneckFor,
  devEffort,
  hypeAfterTick,
  moraleAfterTick,
  moraleCrisisMultiplier,
  payrollFor,
  qualityAfterTick,
  revenueFor,
  roundTermsFor,
  valuationFor,
  weeklyBurnFor,
} from '../balance';
import { isNotableWeek } from '../digest';
import { newGame, reduce, tick, tickMany } from '../engine';
import { BOOM_DECK } from '../events/boom';
import { RECKONING_DECK } from '../events/reckoning';
import { SCRAPPY_DECK } from '../events/scrappy';
import { rivalGrowthMultiplier } from '../rivals';
import { GameState, Headcount } from '../types';

const tickN = (state: GameState, n: number): GameState => {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s);
  return s;
};

/** A staffed starting roster — the game now starts empty, so tests exercising team/layoff mechanics staff up explicitly. */
const STAFFED: Headcount = { devs: 3, sales: 1, support: 1 };
/** newGame with an explicit non-empty team, for tests that assumed the old default roster. */
const staffedGame = (seed: number): GameState => {
  const g = newGame('Acme', seed);
  return { ...g, headcount: { ...STAFFED }, pendingHeadcount: { ...STAFFED } };
};

/** Every era's unique card ids — pre-seeding this as `drawnEventIds` isolates a
 * long-running test from any decision card (across every era) freezing tick(). */
const ALL_ERA_EVENT_IDS = [...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK].map((c) => c.id);

describe('newGame', () => {
  it('produces the documented starting shape', () => {
    const s = newGame('Acme', 1);
    expect(s.week).toBe(0);
    expect(s.cash).toBe(STARTING_CASH);
    expect(s.headcount).toEqual(STARTING_HEADCOUNT);
    expect(s.gameOver).toBeNull();
    // rng.counter is nonzero: generating the initial CTO/CMO/CFO offers consumes draws.
    expect(s.rng.counter).toBeGreaterThan(0);
    expect(s.createdWithSeed).toBe(1);
    expect(s.companyName).toBe('Acme');
    expect(s.hype).toBe(STARTING_HYPE);
    expect(s.marketShare).toBe(STARTING_MARKET_SHARE);
    expect(s.valuationHistory).toEqual([]);
    expect(s.cLevels.cto.hired).toBeNull();
    expect(s.cLevels.cto.candidates).toHaveLength(6);
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
  it('revenueFor matches customers × ARPC exactly, with an optional focus multiplier', () => {
    expect(revenueFor(1000)).toBe(1000 * ARPC);
    expect(revenueFor(1000, 1.1)).toBe(1000 * ARPC * 1.1);
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
      ...newGame('Acme', 1),
      cash: 50_000_000,
      drawnEventIds: ALL_ERA_EVENT_IDS,
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
    const s0 = newGame('Acme', 7);
    const burn = weeklyBurnFor(s0.headcount);
    // Revenue is billed against the customer base held at the *start* of the
    // week — the pipeline's gains/churn this tick affect next week's bill, not this one.
    const revenue = revenueFor(s0.customers);
    const s1 = tick(s0);
    expect(s1.week).toBe(1);
    expect(s1.cash).toBe(STARTING_CASH - burn + revenue);
    // does not mutate the input
    expect(s0.week).toBe(0);
    expect(s0.cash).toBe(STARTING_CASH);
  });
});

describe('tickMany (fast-forward)', () => {
  it('is deterministic: same seed and weeks produce the same end state', () => {
    const a = tickMany(newGame('Acme', 11), 5);
    const b = tickMany(newGame('Acme', 11), 5);
    expect(a).toEqual(b);
  });

  it('matches manual step-by-step ticking, stopping the instant a week is notable, the bottleneck changes, or maxWeeks runs out', () => {
    const s0: GameState = { ...newGame('Acme', 11), cash: 50_000_000, weeksUntilNextEvent: 1000 };
    const bottleneckOf = (s: GameState) =>
      bottleneckFor({
        quality: s.productQuality,
        rivalAvgQuality: s.rivals.reduce((sum, r) => sum + r.productQuality, 0) / s.rivals.length,
        support: s.headcount.support,
        customers: s.customers,
        marketCustomers: s.marketCustomers,
      });
    let manual = s0;
    for (let i = 0; i < 5; i++) {
      if (manual.gameOver || manual.pendingEvent) break;
      const bottleneckBefore = bottleneckOf(manual);
      const next = tick(manual);
      const weekEntries = next.newsLog.filter((entry) => entry.week === next.week);
      manual = next;
      if (manual.gameOver || manual.pendingEvent || isNotableWeek(weekEntries)) break;
      if (bottleneckOf(manual) !== bottleneckBefore) break;
    }
    expect(tickMany(s0, 5)).toEqual(manual);
  });

  it('stops the moment a decision card is drawn, without answering it', () => {
    // Seed 5 lands a decision card (not a news card) on the very first draw
    // under the current RNG stream. Note candidate offers, the trend phase
    // machine, and per-rival focus assignment all draw ahead of this one in
    // `newGame`/`tick`, so the exact seed that draws a decision card shifts
    // whenever any of those change.
    const s0: GameState = { ...newGame('Acme', 5), cash: 50_000_000, weeksUntilNextEvent: 1 };
    const result = tickMany(s0, 10);
    expect(result.pendingEvent).not.toBeNull();
    expect(result.week).toBeLessThan(10);
  });

  it('stops on game over instead of ticking a frozen state', () => {
    const s0: GameState = { ...newGame('Acme', 11), cash: -1, weeksInTheRed: 2, weeksUntilNextEvent: 1000 };
    const result = tickMany(s0, 10);
    expect(result.gameOver).toBe('bankruptcy');
  });

  it('never advances past a notable week even mid-run', () => {
    // Force a morale-band crossing on the very first tick by cratering morale
    // before advancing — the digest entry should halt the fast-forward at week 1.
    let s0: GameState = { ...staffedGame(11), cash: 50_000_000, weeksUntilNextEvent: 1000, morale: 71 };
    s0 = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'devs', delta: -3 });
    s0 = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'sales', delta: -1 });
    s0 = reduce(s0, { type: 'SET_PENDING_HIRES', role: 'support', delta: -1 });
    const result = tickMany(s0, 10);
    expect(result.week).toBe(1);
  });
});

describe('weekly digest (wired into tick)', () => {
  const craterMorale = (state: GameState): GameState => {
    let s = reduce(state, { type: 'SET_PENDING_HIRES', role: 'devs', delta: -2 });
    s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: -1 });
    return reduce(s, { type: 'SET_PENDING_HIRES', role: 'support', delta: -1 });
  };

  it('appends kind:"digest" entries when a big layoff craters morale through every band', () => {
    const s0 = craterMorale(staffedGame(11));
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
    const s1 = tick(craterMorale(staffedGame(11)));
    expect(s1.morale).toBeLessThan(30);

    const s2 = tick(s1); // no further cuts queued; morale drifts up but stays under 30
    expect(s2.morale).toBeLessThan(30);
    const secondWeekDigest = s2.newsLog.filter((e) => e.kind === 'digest' && e.week === s2.week);
    expect(secondWeekDigest.some((e) => e.title.startsWith('Morale'))).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const runDigest = () => tick(craterMorale(staffedGame(11))).newsLog.filter((e) => e.kind === 'digest');
    expect(runDigest()).toEqual(runDigest());
  });

  it('every tick produces the underlying cash/revenue numbers the UI can summarize regardless of whether any threshold crossed', () => {
    // digest entries are opportunistic extras — the week-in-review sheet's
    // baseline content (cash delta, revenue vs burn) always comes from the
    // resulting state directly, never from newsLog.
    const s1 = tick(newGame('Acme', 3));
    expect(typeof s1.cash).toBe('number');
    expect(typeof s1.week).toBe('number');
  });
});

describe('hiring feedback loop', () => {
  it('having devs at all (vs. none) measurably grows the customer base within 3 ticks (quality gates conversion & churn)', () => {
    // Drain the deck so a decision card can't freeze one branch and not the
    // other, and give both branches generous cash so neither goes bankrupt
    // mid-comparison. Compares zero devs (quality stays pinned near zero, so
    // the quality-ratio curve sits at its conversion floor / churn ceiling)
    // against the starting headcount (quality quickly clears the rival
    // average) — a robust crossing regardless of exactly how fast quality
    // compounds beyond that.
    const base: GameState = {
      ...staffedGame(11),
      cash: 5_000_000,
      drawnEventIds: SCRAPPY_DECK.map((c) => c.id),
    };
    const noDevs: GameState = {
      ...base,
      headcount: { ...base.headcount, devs: 0 },
      pendingHeadcount: { ...base.pendingHeadcount, devs: 0 },
    };
    const withDevs = tickN(base, 3);
    const without = tickN(noDevs, 3);

    expect(withDevs.productQuality).toBeGreaterThan(without.productQuality);
    // Higher quality lifts conversion and dampens churn, so the with-devs
    // branch ends up with more installed customers — and therefore more revenue.
    expect(withDevs.customers).toBeGreaterThan(without.customers);
    expect(revenueFor(withDevs.customers)).toBeGreaterThan(revenueFor(without.customers));
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
    const a = tickN(newGame('Acme', 42), 50);
    const b = tickN(newGame('Acme', 42), 50);
    expect(a).toEqual(b);
  });
});

describe('eras', () => {
  // Auto-answers any decision card with choice 0 ("An Early Feeler"'s choice
  // 0 is decline-and-continue, not accept-and-end — see events/scrappy.ts)
  // so a long era-transition playthrough never stalls on a pending card.
  // Advances exactly one real week per call (answering inline, no second
  // tick) so a `while (s.week < target)` loop can never overshoot past an
  // exact target week.
  const tickAutoAnswer = (state: GameState): GameState => {
    let s = tick(state);
    if (s.pendingEvent) {
      s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    }
    return s;
  };

  it('rolls boomStartWeek/reckoningStartWeek once, deterministically per seed, within their tunable ranges', () => {
    const a = newGame('Acme', 50);
    const b = newGame('Acme', 50);
    expect(a.boomStartWeek).toBe(b.boomStartWeek);
    expect(a.reckoningStartWeek).toBe(b.reckoningStartWeek);
    expect(a.boomStartWeek).toBeGreaterThanOrEqual(BOOM_START_WEEK_MIN);
    expect(a.boomStartWeek).toBeLessThanOrEqual(BOOM_START_WEEK_MAX);
    expect(a.reckoningStartWeek).toBeGreaterThanOrEqual(RECKONING_START_WEEK_MIN);
    expect(a.reckoningStartWeek).toBeLessThanOrEqual(RECKONING_START_WEEK_MAX);
  });

  it('a different seed can roll a different transition week', () => {
    const weeks = new Set([newGame('Acme', 1).boomStartWeek, newGame('Acme', 2).boomStartWeek, newGame('Acme', 3).boomStartWeek]);
    expect(weeks.size).toBeGreaterThan(1);
  });

  it('starts scrappy and advances through boom into reckoning at exactly the seeded weeks, with a news entry each time', () => {
    // Ample cash isolates era-schedule mechanics from the bankruptcy fuse
    // over what can be a 70-week playthrough.
    let s: GameState = { ...newGame('Acme', 51), cash: 10_000_000 };
    expect(s.era).toBe('scrappy');
    const { boomStartWeek, reckoningStartWeek } = s;

    while (s.week < boomStartWeek) {
      s = tickAutoAnswer(s);
    }
    expect(s.era).toBe('boom');
    expect(s.week).toBe(boomStartWeek);
    // A same-week card draw (e.g. a flag-chained follow-up) can also prepend
    // a newsLog entry, so find the era entry rather than assume index 0.
    expect(s.newsLog.find((e) => e.kind === 'era')).toMatchObject({
      week: boomStartWeek,
      kind: 'era',
      title: 'The Boom Begins',
    });

    while (s.week < reckoningStartWeek) {
      s = tickAutoAnswer(s);
    }
    expect(s.era).toBe('reckoning');
    expect(s.week).toBe(reckoningStartWeek);
    expect(s.newsLog.find((e) => e.kind === 'era')).toMatchObject({
      week: reckoningStartWeek,
      kind: 'era',
      title: 'The Reckoning Arrives',
    });
  });
});

describe('era balance dials', () => {
  it('hype decays slower in Boom and faster in Reckoning than the Scrappy baseline', () => {
    const scrappyNext = hypeAfterTick(2.0, 'scrappy');
    const boomNext = hypeAfterTick(2.0, 'boom');
    const reckoningNext = hypeAfterTick(2.0, 'reckoning');
    // Slower decay from a hot hype level means staying further from the 1.0 baseline.
    expect(boomNext).toBeGreaterThan(scrappyNext);
    expect(reckoningNext).toBeLessThan(scrappyNext);
    expect(boomNext).toBeCloseTo(2.0 + (1.0 - 2.0) * HYPE_DECAY_RATE * ERA_HYPE_DECAY_MULTIPLIER.boom);
    expect(reckoningNext).toBeCloseTo(
      2.0 + (1.0 - 2.0) * HYPE_DECAY_RATE * ERA_HYPE_DECAY_MULTIPLIER.reckoning,
    );
  });

  it('valuation multiple is compressed in Reckoning, unchanged in Scrappy/Boom', () => {
    const scrappy = valuationFor(10_000, 1, 'scrappy');
    const boom = valuationFor(10_000, 1, 'boom');
    const reckoning = valuationFor(10_000, 1, 'reckoning');
    expect(boom).toBe(scrappy);
    expect(reckoning).toBeLessThan(scrappy);
    expect(reckoning).toBeCloseTo(scrappy * ERA_VALUATION_MULTIPLE_MULTIPLIER.reckoning);
  });

  it('round terms are cheaper (less dilution, more cash) in Boom and brutal in Reckoning', () => {
    const scrappy = roundTermsFor('seriesA', 5_000_000, 1, 20, 'scrappy');
    const boom = roundTermsFor('seriesA', 5_000_000, 1, 20, 'boom');
    const reckoning = roundTermsFor('seriesA', 5_000_000, 1, 20, 'reckoning');
    expect(boom.dilution).toBeLessThan(scrappy.dilution);
    expect(boom.amount).toBeGreaterThan(scrappy.amount);
    expect(reckoning.dilution).toBeGreaterThan(scrappy.dilution);
    expect(reckoning.amount).toBeLessThan(scrappy.amount);
    expect(boom.dilution).toBeCloseTo(scrappy.dilution * ERA_DILUTION_MULTIPLIER.boom);
    expect(boom.amount).toBeCloseTo(scrappy.amount * ERA_ROUND_CASH_MULTIPLIER.boom);
    expect(reckoning.dilution).toBeCloseTo(scrappy.dilution * ERA_DILUTION_MULTIPLIER.reckoning);
    expect(reckoning.amount).toBeCloseTo(scrappy.amount * ERA_ROUND_CASH_MULTIPLIER.reckoning);
  });

  it('rivals grow faster in Boom than in Scrappy/Reckoning at the same roundsRaised', () => {
    const scrappy = rivalGrowthMultiplier(1, 'scrappy');
    const boom = rivalGrowthMultiplier(1, 'boom');
    const reckoning = rivalGrowthMultiplier(1, 'reckoning');
    expect(boom).toBeGreaterThan(scrappy);
    expect(reckoning).toBe(scrappy);
  });

  it('morale baseline is lower in Reckoning, pulling morale down even with no layoffs', () => {
    const headcount = STARTING_HEADCOUNT;
    const scrappyMorale = moraleAfterTick(60, headcount, headcount, 'scrappy');
    const reckoningMorale = moraleAfterTick(60, headcount, headcount, 'reckoning');
    expect(reckoningMorale).toBeLessThan(scrappyMorale);
    expect(ERA_MORALE_BASELINE.reckoning).toBeLessThan(ERA_MORALE_BASELINE.scrappy);
  });

  it('IPO window is only open in Boom', () => {
    expect(ERA_IPO_WINDOW_OPEN.scrappy).toBe(false);
    expect(ERA_IPO_WINDOW_OPEN.boom).toBe(true);
    expect(ERA_IPO_WINDOW_OPEN.reckoning).toBe(false);
  });

  it('tick() flips ipoWindowOpen open exactly on the Boom transition and shut again on Reckoning', () => {
    let s: GameState = { ...newGame('Acme', 51), cash: 10_000_000 };
    expect(s.ipoWindowOpen).toBe(false);
    const { boomStartWeek, reckoningStartWeek } = s;

    while (s.week < boomStartWeek) s = tickAutoAnswerEras(s);
    expect(s.ipoWindowOpen).toBe(true);

    while (s.week < reckoningStartWeek) s = tickAutoAnswerEras(s);
    expect(s.ipoWindowOpen).toBe(false);
  });
});

// One real week per call, answering any pending decision inline (no second
// tick) so a `while (s.week < target)` loop can't overshoot an exact week.
function tickAutoAnswerEras(state: GameState): GameState {
  let s = tick(state);
  if (s.pendingEvent) {
    s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
  }
  return s;
}

describe('bankruptcy', () => {
  it('ends the run after 3 consecutive weeks of negative cash, even with rounds unraised, and then freezes', () => {
    const MAX_WEEKS = 500; // safety cap so a broken economy fails loudly, not by hanging

    // No rounds raised, and the event deck exhausted: no lifeline and no
    // decision cards to freeze the loop — isolates pure burn mechanics. The
    // fuse must still fire even though a round is technically raisable.
    let s: GameState = {
      ...newGame('Acme', 3),
      drawnEventIds: ALL_ERA_EVENT_IDS,
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
    let s: GameState = { ...newGame('Acme', 4), cash: -1_000_000 };
    s = tick(s);
    expect(s.gameOver).toBeNull();
    expect(s.weeksInTheRed).toBe(1);
  });
});

describe('REVIVE (bailout)', () => {
  it('un-ends a bankrupt run: restores cash, clears the fuse, and unfreezes the engine', () => {
    // Drive into bankruptcy the same way the fuse test does.
    const bankrupt: GameState = {
      ...newGame('Acme', 7),
      cash: -50_000,
      weeksInTheRed: BANKRUPTCY_FUSE_WEEKS,
      gameOver: 'bankruptcy',
      finalScore: 0,
    };

    const revived = reduce(bankrupt, { type: 'REVIVE', reason: 'Your uncle died and left you his fortune.' });

    expect(revived.gameOver).toBeNull();
    expect(revived.finalScore).toBeNull();
    expect(revived.weeksInTheRed).toBe(0);
    expect(revived.cash).toBe(REVIVE_CASH);
    // The reason is logged as flavor, never as cash.
    expect(revived.newsLog[0].flavor).toContain('uncle');

    // The engine is live again: a tick advances the week instead of freezing.
    const ticked = tick(revived);
    expect(ticked.week).toBe(revived.week + 1);
  });

  it('never reduces cash already above the grant', () => {
    const flush: GameState = { ...newGame('Acme', 8), cash: REVIVE_CASH * 3 };
    const revived = reduce(flush, { type: 'REVIVE', reason: 'anything' });
    expect(revived.cash).toBe(REVIVE_CASH * 3);
  });
});

describe('weeksInTheRed', () => {
  // Deck exhausted so a decision card can't freeze tick() partway through
  // and stall the fuse count — isolates pure cash mechanics.
  const noEvents = { drawnEventIds: SCRAPPY_DECK.map((c) => c.id) };

  it('increments each tick cash stays negative, and resets the moment cash recovers', () => {
    let s: GameState = { ...newGame('Acme', 5), ...noEvents, cash: -1_000_000 };
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
    let s: GameState = { ...newGame('Acme', 6), ...noEvents, cash: -1_000_000 };
    s = tick(s);
    expect(s.gameOver).toBeNull();
    s = tick(s);
    expect(s.gameOver).toBeNull();
    s = tick(s);
    expect(s.gameOver).toBe('bankruptcy');
  });
});

describe('GO_PUBLIC / IPO eligibility', () => {
  const eligible: Partial<GameState> = {
    stage: 'growth',
    ipoWindowOpen: true,
    weeksRevenueAboveIpoBar: IPO_SUSTAIN_WEEKS,
  };

  it('ends the run with gameOver "ipo" and a nonzero score when eligible', () => {
    let s: GameState = { ...newGame('Acme', 20), ...eligible, founderEquity: 0.4, productQuality: 1_000_000, customers: 100_000 };
    s = reduce(s, { type: 'GO_PUBLIC' });
    expect(s.gameOver).toBe('ipo');
    expect(s.finalScore).toBeGreaterThan(0);
  });

  it('is rejected before growth stage even with revenue sustained', () => {
    let s: GameState = { ...newGame('Acme', 21), ...eligible, stage: 'seriesA' };
    s = reduce(s, { type: 'GO_PUBLIC' });
    expect(s.gameOver).toBeNull();
    expect(s.finalScore).toBeNull();
  });

  it('is rejected when the sustain bar has not been held long enough', () => {
    let s: GameState = { ...newGame('Acme', 22), ...eligible, weeksRevenueAboveIpoBar: IPO_SUSTAIN_WEEKS - 1 };
    s = reduce(s, { type: 'GO_PUBLIC' });
    expect(s.gameOver).toBeNull();
  });

  it('is rejected while the IPO window is shut', () => {
    let s: GameState = { ...newGame('Acme', 23), ...eligible, ipoWindowOpen: false };
    s = reduce(s, { type: 'GO_PUBLIC' });
    expect(s.gameOver).toBeNull();
  });

  it('is rejected while a decision card is pending', () => {
    let s: GameState = { ...newGame('Acme', 24), ...eligible, pendingEvent: SCRAPPY_DECK.find((c) => c.kind === 'decision')! };
    s = reduce(s, { type: 'GO_PUBLIC' });
    expect(s.gameOver).toBeNull();
  });

  it('tracks weeksRevenueAboveIpoBar across ticks: resets the moment revenue dips below the bar', () => {
    let s: GameState = { ...newGame('Acme', 25), customers: 10_000 };
    s = tick(s);
    expect(s.weeksRevenueAboveIpoBar).toBeGreaterThan(0);

    s = { ...s, customers: 0 };
    s = tick(s);
    expect(s.weeksRevenueAboveIpoBar).toBe(0);
  });
});

describe('reduce', () => {
  it('routes TICK through tick()', () => {
    const s0 = newGame('Acme', 9);
    expect(reduce(s0, { type: 'TICK' })).toEqual(tick(s0));
  });

  it('NEW_GAME produces a fresh deterministic run', () => {
    const started = tickN(newGame('Acme', 5), 3);
    const reset = reduce(started, { type: 'NEW_GAME', seed: 5, companyName: 'Acme' });
    expect(reset).toEqual(newGame('Acme', 5));
  });
});

describe('moraleCrisisMultiplier', () => {
  it('penalizes only below the documented crisis threshold', () => {
    expect(moraleCrisisMultiplier(MORALE_CRISIS_THRESHOLD - 1)).toBe(MORALE_CRISIS_PRODUCTIVITY_MULTIPLIER);
    expect(moraleCrisisMultiplier(MORALE_CRISIS_THRESHOLD)).toBe(1);
    expect(moraleCrisisMultiplier(100)).toBe(1);
  });
});

describe('morale attrition and productivity penalties (forced low morale)', () => {
  const craterMorale = (state: GameState): GameState => {
    let s = reduce(state, { type: 'SET_PENDING_HIRES', role: 'devs', delta: -2 });
    s = reduce(s, { type: 'SET_PENDING_HIRES', role: 'sales', delta: -1 });
    return reduce(s, { type: 'SET_PENDING_HIRES', role: 'support', delta: -1 });
  };

  it('crashes morale below both documented thresholds', () => {
    const s1 = tick(craterMorale(staffedGame(11)));
    expect(s1.morale).toBeLessThan(MORALE_ATTRITION_THRESHOLD);
    expect(s1.morale).toBeLessThan(MORALE_CRISIS_THRESHOLD);
  });

  it('never fires attrition while morale stays at or above the threshold', () => {
    let s: GameState = newGame('Acme', 3); // starts at STARTING_MORALE (70), never touched
    const startingTotal = s.headcount.devs + s.headcount.sales + s.headcount.support;
    for (let i = 0; i < 30; i++) {
      s = tick(s);
      expect(s.morale).toBeGreaterThanOrEqual(MORALE_ATTRITION_THRESHOLD);
    }
    const endingTotal = s.headcount.devs + s.headcount.sales + s.headcount.support;
    expect(endingTotal).toBe(startingTotal);
  });

  it('eventually fires attrition (headcount loss + a news entry) across a spread of seeds once morale craters', () => {
    let sawAttrition = false;
    for (let seed = 1; seed <= 30 && !sawAttrition; seed++) {
      // Apply the deliberate layoff first — only *subsequent* headcount drops are attrition.
      let s = tick(craterMorale(staffedGame(seed)));
      for (let i = 0; i < 15; i++) {
        const before = s.headcount.devs + s.headcount.sales + s.headcount.support;
        s = tick(s);
        const after = s.headcount.devs + s.headcount.sales + s.headcount.support;
        if (after < before) {
          sawAttrition = true;
          expect(s.newsLog.some((e) => e.title === 'A burned-out hire quit')).toBe(true);
          break;
        }
      }
    }
    expect(sawAttrition).toBe(true);
  });
});

describe('morale lever', () => {
  it('SET_MORALE_LEVER toggles the flag', () => {
    const s0 = newGame('Acme', 4);
    const on = reduce(s0, { type: 'SET_MORALE_LEVER', active: true });
    expect(on.moraleLeverActive).toBe(true);
    const off = reduce(on, { type: 'SET_MORALE_LEVER', active: false });
    expect(off.moraleLeverActive).toBe(false);
  });

  it('costs cash and boosts morale on tick while active', () => {
    const s0 = newGame('Acme', 4);
    const withLever = reduce(s0, { type: 'SET_MORALE_LEVER', active: true });
    const s1 = tick(withLever);
    const s1Baseline = tick(s0);

    expect(s1.morale).toBeGreaterThan(s1Baseline.morale);

    // Isolate the lever's cost from the morale->productivity feedback loop (which also
    // nudges revenue and therefore cash) by comparing weeklyBurnFor directly.
    const burnWithLever = weeklyBurnFor(s0.headcount, { moraleLeverCost: MORALE_LEVER_WEEKLY_COST });
    const burnWithoutLever = weeklyBurnFor(s0.headcount);
    expect(burnWithLever - burnWithoutLever).toBe(MORALE_LEVER_WEEKLY_COST);
  });
});
