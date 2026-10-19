import { describe, expect, it } from 'vitest';

import {
  BRIDGE_RUNWAY_THRESHOLD_WEEKS,
  ROUND_BASE_DILUTION,
  ROUND_COOLDOWN_WEEKS,
  ROUND_MIN_AMOUNT,
  applyDilution,
  canRaiseRound,
  founderStakeFor,
  roundOpenAt,
  roundTermsFor,
  STAGE_AFTER_ROUND,
  weeklyStatsFor,
} from '../balance';
import { newGame, normalizeSave, reduce, tick } from '../engine';
import {
  INVESTORS,
  INVESTOR_FLAGS,
  MAX_OPEN_OFFERS,
  OPENING_OFFER_COUNT,
  acceptedDilutionFor,
  dealFundingOffers,
  investorById,
} from '../investors';
import { GameState, ROUND_ORDER } from '../types';

// A valuation comfortably above every round's floor, so amount-vs-floor
// interactions don't obscure the scaling assertions below.
const HIGH_VALUATION = 50_000_000;
const AMPLE_RUNWAY = BRIDGE_RUNWAY_THRESHOLD_WEEKS + 10;

describe('roundTermsFor', () => {
  it('amount scales up with valuation', () => {
    const low = roundTermsFor('seed', HIGH_VALUATION, 1, AMPLE_RUNWAY);
    const high = roundTermsFor('seed', HIGH_VALUATION * 2, 1, AMPLE_RUNWAY);
    expect(high.amount).toBeGreaterThan(low.amount);
  });

  it('amount scales up with hype', () => {
    const low = roundTermsFor('seed', HIGH_VALUATION, 1, AMPLE_RUNWAY);
    const high = roundTermsFor('seed', HIGH_VALUATION, 2, AMPLE_RUNWAY);
    expect(high.amount).toBeGreaterThan(low.amount);
  });

  it('never offers less than the per-round floor at low valuation', () => {
    const terms = roundTermsFor('seed', 100, 1, AMPLE_RUNWAY);
    expect(terms.isBridge).toBe(false);
    expect(terms.amount).toBeGreaterThanOrEqual(ROUND_MIN_AMOUNT.seed);
  });

  it('triggers bridge terms exactly under the runway threshold', () => {
    const justAbove = roundTermsFor('seed', HIGH_VALUATION, 1, BRIDGE_RUNWAY_THRESHOLD_WEEKS);
    const justBelow = roundTermsFor(
      'seed',
      HIGH_VALUATION,
      1,
      BRIDGE_RUNWAY_THRESHOLD_WEEKS - 0.01,
    );
    expect(justAbove.isBridge).toBe(false);
    expect(justBelow.isBridge).toBe(true);
  });

  it('bridge terms are worse: more dilution, less cash, for the same round', () => {
    const normal = roundTermsFor('seed', HIGH_VALUATION, 1, AMPLE_RUNWAY);
    const bridge = roundTermsFor('seed', HIGH_VALUATION, 1, 1);
    expect(bridge.dilution).toBeGreaterThan(normal.dilution);
    expect(bridge.amount).toBeLessThan(normal.amount);
  });
});

describe('founderStakeFor', () => {
  it('multiplies equity by valuation', () => {
    expect(founderStakeFor(0.38, 1_300_000)).toBeCloseTo(494_000);
  });

  it('drops after dilution at a fixed valuation', () => {
    const before = founderStakeFor(1, 1_000_000);
    const after = founderStakeFor(applyDilution(1, 0.2), 1_000_000);
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(800_000);
  });

  it('is zero at zero equity', () => {
    expect(founderStakeFor(0, 1_000_000)).toBe(0);
  });
});

describe('applyDilution', () => {
  it('multiplies equity down and never below 0', () => {
    expect(applyDilution(1, 0.2)).toBeCloseTo(0.8);
    expect(applyDilution(0.8, 0.2)).toBeCloseTo(0.64);
    expect(applyDilution(0.1, 0.99)).toBeGreaterThanOrEqual(0);
    expect(applyDilution(0, 0.5)).toBe(0);
  });
});

// Bumps state.week past the raise cooldown without running a real tick (which
// would touch cash/morale/events) and re-deals the table for the new week —
// isolates the cooldown gate and dealing from the economy.
const skipCooldown = (s: GameState): GameState => {
  const later = { ...s, week: s.week + ROUND_COOLDOWN_WEEKS };
  return { ...later, fundingOffers: dealFundingOffers(later) };
};

const offers = (s: GameState) => s.fundingOffers ?? [];
const firstOffer = (s: GameState) => offers(s)[0];
const accept = (s: GameState, offerId = firstOffer(s).id) => reduce(s, { type: 'ACCEPT_FUNDING_OFFER', offerId });

/** A run rich enough that every late round's valuation bar is cleared. */
function wealthy(seed: number): GameState {
  const s: GameState = { ...newGame('Acme', seed), cash: 1_000_000, customers: 1_000_000, marketCustomers: 2_000_000 };
  return { ...s, fundingOffers: dealFundingOffers(s) };
}

describe('dealing offers', () => {
  it('a new game opens Seed with term sheets on the table, one of them from people who know you', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = newGame('Acme', seed);
      expect(offers(s).length).toBe(OPENING_OFFER_COUNT);
      expect(offers(s).every((o) => o.round === 'seed')).toBe(true);
      const kinds = offers(s).map((o) => investorById(o.investorId)?.kind);
      expect(kinds.some((k) => k === 'family' || k === 'crowd' || k === 'angel')).toBe(true);
    }
  });

  it('never puts the same investor on the table twice, and never more than the cap', () => {
    let s = newGame('Acme', 11);
    for (let i = 0; i < 40 && !s.gameOver; i++) {
      s = tick({ ...s, cash: 1_000_000 });
      if (s.pendingEvent) s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
      const ids = offers(s).map((o) => o.investorId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(MAX_OPEN_OFFERS);
    }
  });

  it('drops offers once they expire', () => {
    const s = newGame('Acme', 12);
    const lastWeek = Math.max(...offers(s).map((o) => o.expiresWeek));
    const later = { ...s, week: lastWeek + 1 };
    const dealt = dealFundingOffers(later);
    expect(dealt.every((o) => o.arrivedWeek === later.week)).toBe(true);
  });

  it('refills an empty table, so an open round is never stuck waiting on luck', () => {
    const s = { ...newGame('Acme', 13), fundingOffers: [] };
    expect(dealFundingOffers(s).length).toBe(OPENING_OFFER_COUNT);
  });

  it('deals nothing while the round is cooling down or once every round is raised', () => {
    const s = newGame('Acme', 14);
    expect(dealFundingOffers({ ...s, lastRoundRaisedWeek: s.week })).toEqual([]);
    expect(dealFundingOffers({ ...s, roundsRaised: ROUND_ORDER.length })).toEqual([]);
  });

  it('keeps late rounds shut until valuation clears the bar', () => {
    const s: GameState = { ...newGame('Acme', 15), roundsRaised: 3, stage: 'growth', fundingOffers: [] };
    expect(roundOpenAt('seriesC', weeklyStatsFor(s).valuation)).toBe(false);
    expect(dealFundingOffers(s)).toEqual([]);
  });

  it('prices every negotiated offer as a bridge when runway is short, and brings the vultures', () => {
    let sawVulture = false;
    for (const seed of [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
      const broke: GameState = { ...newGame('Acme', seed), cash: 1_000, fundingOffers: [] };
      const dealt = dealFundingOffers(broke);
      expect(dealt.length).toBeGreaterThan(0);
      const negotiated = dealt.filter((o) => {
        const inv = investorById(o.investorId)!;
        return inv.fixedDilution === undefined && inv.flatAmount === undefined;
      });
      expect(negotiated.every((o) => o.isBridge)).toBe(true);
      sawVulture ||= dealt.some((o) => o.investorId === 'vulture-partners');
    }
    expect(sawVulture).toBe(true);
  });

  it('standard deals (family, accelerators) are never priced or labelled as a bridge', () => {
    for (const seed of [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
      const broke: GameState = { ...newGame('Acme', seed), cash: 1_000, fundingOffers: [] };
      for (const offer of dealFundingOffers(broke)) {
        const investor = investorById(offer.investorId)!;
        if (investor.fixedDilution !== undefined || investor.flatAmount !== undefined) {
          expect(offer.isBridge).toBe(false);
        }
      }
    }
  });

  it('a big-name seed check is more cash for more equity than an accelerator, not both', () => {
    const a16z = investorById('a16zz')!;
    const yc = investorById('ycombinatorr')!;
    expect(a16z.amountMultiplier!).toBeGreaterThan(yc.amountMultiplier!);
    expect(ROUND_BASE_DILUTION.seed * a16z.dilutionMultiplier!).toBeGreaterThan(yc.fixedDilution!);
  });

  it('a revived run gets term sheets back at once', () => {
    const bankrupt: GameState = { ...newGame('Acme', 33), gameOver: 'bankruptcy', finalScore: 0, fundingOffers: [] };
    const revived = reduce(bankrupt, { type: 'REVIVE', reason: 'test' });
    expect(offers(revived).length).toBe(OPENING_OFFER_COUNT);
  });

  it('is deterministic for a seed and leaves the main RNG stream alone', () => {
    const a = newGame('Acme', 31);
    const b = newGame('Acme', 31);
    expect(a.fundingOffers).toEqual(b.fundingOffers);
    const { fundingOffers: _ignored, ...rest } = a;
    expect(dealFundingOffers({ ...rest } as GameState)).toEqual(a.fundingOffers);
    expect(a.rng).toEqual(b.rng);
  });

  it('a save from before offers existed gets a table on load', () => {
    const { fundingOffers: _ignored, ...old } = newGame('Acme', 32);
    const loaded = normalizeSave(old as GameState);
    expect(offers(loaded).length).toBe(OPENING_OFFER_COUNT);
  });

  it('every investor id is unique and every round has someone to offer', () => {
    expect(new Set(INVESTORS.map((i) => i.id)).size).toBe(INVESTORS.length);
    for (const round of ROUND_ORDER) {
      expect(INVESTORS.some((i) => i.rounds.includes(round) && !i.onlyWhenBridge && !i.eras)).toBe(true);
    }
  });
});

describe('ACCEPT_FUNDING_OFFER', () => {
  it('advances stage once per round through Series G, then the table stays empty', () => {
    let s = wealthy(1);
    expect(s.stage).toBe('garage');
    for (let i = 0; i < ROUND_ORDER.length; i++) {
      expect(firstOffer(s)?.round).toBe(ROUND_ORDER[i]);
      s = accept(s);
      expect(s.roundsRaised).toBe(i + 1);
      expect(s.stage).toBe(STAGE_AFTER_ROUND[ROUND_ORDER[i]]);
      expect(offers(s)).toEqual([]);
      if (i < ROUND_ORDER.length - 1) s = skipCooldown(s);
    }
    expect(s.stage).toBe('growth');
    expect(dealFundingOffers(skipCooldown(s))).toEqual([]);
  });

  it('pays the offer amount and dilutes by its terms', () => {
    const s0 = { ...newGame('Acme', 5), cash: 10_000 };
    const offer = offers(s0).find((o) => o.dilution > 0)!;
    const s1 = accept(s0, offer.id);
    expect(s1.cash).toBeCloseTo(s0.cash + offer.amount);
    expect(s1.founderEquity).toBeCloseTo(applyDilution(s0.founderEquity, offer.dilution));
  });

  it("Grandma's money costs no equity but still closes the Seed round", () => {
    const s0 = { ...newGame('Acme', 40), fundingOffers: [] };
    const grandma = investorById('grandma')!;
    const offer = {
      id: 'grandma-seed-w0',
      investorId: grandma.id,
      round: 'seed' as const,
      amount: grandma.flatAmount!,
      dilution: 0,
      isBridge: false,
      arrivedWeek: 0,
      expiresWeek: 5,
    };
    const s1 = accept({ ...s0, fundingOffers: [offer] }, offer.id);
    expect(s1.founderEquity).toBe(s0.founderEquity);
    expect(s1.roundsRaised).toBe(1);
    expect(s1.stage).toBe('seed');
    expect(s1.morale).toBeGreaterThan(s0.morale);
  });

  it("applies the investor's strings: hype, morale and story flags", () => {
    const s0 = newGame('Acme', 41);
    const a16z = investorById('a16zz')!;
    const offer = { ...firstOffer(s0), id: 'a16zz-seed-w0', investorId: a16z.id, dilution: 0.2 };
    const s1 = accept({ ...s0, fundingOffers: [offer] }, offer.id);
    expect(s1.hype).toBeCloseTo(s0.hype + a16z.strings!.hype!);
    expect(s1.morale).toBeLessThan(s0.morale);

    const marty = { ...offer, id: 'uncle-marty-seed-w0', investorId: 'uncle-marty' };
    const s2 = accept({ ...s0, fundingOffers: [marty] }, marty.id);
    expect(s2.storyFlags).toContain(INVESTOR_FLAGS.uncleMarty);
  });

  it("a CFO's round-terms perk applies at signing, not when the offer arrived", () => {
    const s0 = newGame('Acme', 42);
    const offer = offers(s0).find((o) => o.dilution > 0)!;
    const cfo = {
      id: 'cfo-1',
      name: 'Pat',
      personality: '',
      exEmployer: '',
      tier: 'mid' as const,
      salary: 1,
      perk: { id: 'p', label: 'p', axis: 'cfo-roundTerms' as const, multiplier: 0.5 },
      quirk: null,
    };
    const withCfo = { ...s0, cLevels: { ...s0.cLevels, cfo: { hired: cfo, offer: null } } };
    expect(acceptedDilutionFor(withCfo, offer)).toBeCloseTo(offer.dilution * 0.5);
    expect(accept(withCfo, offer.id).founderEquity).toBeCloseTo(applyDilution(1, offer.dilution * 0.5));
  });

  it('ignores unknown, stale and expired offers, and anything during the cooldown', () => {
    const s0 = newGame('Acme', 6);
    expect(reduce(s0, { type: 'ACCEPT_FUNDING_OFFER', offerId: 'nope' })).toBe(s0);

    const offer = firstOffer(s0);
    const s1 = accept(s0, offer.id);
    // Same offer again: it's gone, and the round is cooling down anyway.
    expect(reduce({ ...s1, fundingOffers: [offer] }, { type: 'ACCEPT_FUNDING_OFFER', offerId: offer.id })).toEqual({
      ...s1,
      fundingOffers: [offer],
    });

    const expired = { ...s0, week: offer.expiresWeek + 1 };
    expect(reduce(expired, { type: 'ACCEPT_FUNDING_OFFER', offerId: offer.id })).toBe(expired);
  });

  it('rejects the next round before the cooldown elapses, allows it once elapsed', () => {
    const s1 = accept(newGame('Acme', 7));
    expect(dealFundingOffers({ ...s1, week: s1.week + ROUND_COOLDOWN_WEEKS - 1 })).toEqual([]);
    const s2 = accept(skipCooldown(s1));
    expect(s2.roundsRaised).toBe(2);
  });

  it('canRaiseRound matches the reducer gate exactly', () => {
    expect(canRaiseRound(10, null)).toBe(true);
    expect(canRaiseRound(10, 10)).toBe(false);
    expect(canRaiseRound(3 + ROUND_COOLDOWN_WEEKS - 1, 3)).toBe(false); // one week short
    expect(canRaiseRound(3 + ROUND_COOLDOWN_WEEKS, 3)).toBe(true); // exactly the cooldown, inclusive
  });
});

describe('DECLINE_FUNDING_OFFER', () => {
  it('removes only that offer', () => {
    const s0 = newGame('Acme', 8);
    const [first, ...rest] = offers(s0);
    const s1 = reduce(s0, { type: 'DECLINE_FUNDING_OFFER', offerId: first.id });
    expect(offers(s1)).toEqual(rest);
    expect(s1.roundsRaised).toBe(0);
    expect(reduce(s1, { type: 'DECLINE_FUNDING_OFFER', offerId: first.id })).toBe(s1);
  });
});

describe('sim evidence: raising early beats always bridging', () => {
  /**
   * Neither bot ever touches headcount, so productQuality/revenue/burn follow
   * an identical path for both until the first raise. `earlyRaiser` takes the
   * best-value offer the moment one is on the table; `alwaysBridge` waits
   * until runway is critically low every time, so every offer it sees is
   * priced as a bridge.
   */
  function runFundingBot(seed: number, alwaysBridge: boolean): GameState {
    let s = newGame('Acme', seed);
    for (let i = 0; i < 300 && s.roundsRaised < 3 && !s.gameOver; i++) {
      const table = offers(s);
      if (table.length > 0) {
        const { runway } = weeklyStatsFor(s);
        const shouldRaiseNow = alwaysBridge ? runway < BRIDGE_RUNWAY_THRESHOLD_WEEKS : true;
        if (shouldRaiseNow) {
          const best = table.reduce((a, b) => (b.amount * (1 - b.dilution) > a.amount * (1 - a.dilution) ? b : a));
          s = accept(s, best.id);
        }
      }
      s = tick(s);
      if (s.pendingEvent) s = reduce(s, { type: 'ANSWER_EVENT', choiceIndex: 0 });
    }
    return s;
  }

  it('an early-raising bot ends with meaningfully more founder equity than an always-bridging one', () => {
    const earlyRaiser = runFundingBot(1, false);
    const alwaysBridge = runFundingBot(1, true);

    // Both actually finished raising Seed, A and B — otherwise the comparison is moot.
    expect(earlyRaiser.roundsRaised).toBe(3);
    expect(alwaysBridge.roundsRaised).toBe(3);

    expect(earlyRaiser.founderEquity).toBeGreaterThan(alwaysBridge.founderEquity * 1.1);
  });
});
