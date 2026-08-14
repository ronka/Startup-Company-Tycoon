import { describe, expect, it } from 'vitest';

import {
  C_LEVEL_DEPARTURE_MORALE_HIT,
  cLevelPerkMultiplierFor,
  cLevelPerkTradeoffFor,
  qualityAfterTick,
  weeklyBurnFor,
} from '../balance';
import {
  allDrawPeople,
  allDraws,
  drawSource,
  drawsFor,
  membersFor,
  MIN_MEMBERS_PER_ROLE,
  TIER_BAND,
} from '../clevel-draws';
import {
  CANDIDATES_PER_ROLL,
  generateCandidates,
  IS_COMPANY_TIER,
  isDominated,
  LEGEND_LABEL,
  legendsFor,
  perkPower,
  perkTiersFor,
  roll,
  rollTier,
  STAGE_WEIGHTS,
} from '../clevels';
import { newGame, normalizeSave, reduce, tick } from '../engine';
import { createRng } from '../rng';
import {
  CLevelCandidate,
  CLevelOffer,
  CLevelPerkAxis,
  CLevelRole,
  GameState,
  PerkBand,
  PERK_BANDS,
  Stage,
} from '../types';

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

describe('the tier ladder', () => {
  it('covers every axis of every role at every band', () => {
    for (const role of ROLES) {
      const axes = new Set(perkTiersFor(role).map((t) => t.axis));
      for (const band of PERK_BANDS) {
        const atBand = perkTiersFor(role, band);
        expect(new Set(atBand.map((t) => t.axis))).toEqual(axes);
      }
    }
  });

  it('never repeats a tier id', () => {
    const ids = ROLES.flatMap((role) => perkTiersFor(role).map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('raises perk power monotonically with band, on every axis', () => {
    for (const role of ROLES) {
      const axes = new Set(perkTiersFor(role).map((t) => t.axis));
      for (const axis of axes) {
        const ladder = PERK_BANDS.map(
          (band) => perkTiersFor(role, band).find((t) => t.axis === axis)!,
        );
        for (let i = 1; i < ladder.length; i++) {
          expect(perkPower(ladder[i])).toBeGreaterThan(perkPower(ladder[i - 1]));
        }
      }
    }
  });

  it('never overlaps two bands’ salary ranges within a role', () => {
    // Raw ranges, not quirk-adjusted: a quirk is +/-4% and the existing
    // scrappy/mid bands sit close enough that adjusted extremes touch. The
    // guarantee the source banner leans on is about the bands themselves.
    for (const role of ROLES) {
      const spans = PERK_BANDS.map((band) => {
        const tiers = perkTiersFor(role, band);
        return {
          band,
          min: Math.min(...tiers.map((t) => t.salaryRange[0])),
          max: Math.max(...tiers.map((t) => t.salaryRange[1])),
        };
      });
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].min).toBeGreaterThan(spans[i - 1].max);
      }
    }
  });

  it('never overlaps two bands’ salary ranges within an axis', () => {
    for (const role of ROLES) {
      const axes = new Set(perkTiersFor(role).map((t) => t.axis));
      for (const axis of axes) {
        const ladder = PERK_BANDS.map(
          (band) => perkTiersFor(role, band).find((t) => t.axis === axis)!,
        );
        for (let i = 1; i < ladder.length; i++) {
          expect(ladder[i].salaryRange[0]).toBeGreaterThan(ladder[i - 1].salaryRange[1]);
        }
      }
    }
  });

  it('offers at least two legends per role, all distinct, none sharing a candidate name', () => {
    for (const role of ROLES) {
      const legends = legendsFor(role);
      expect(legends.length).toBeGreaterThanOrEqual(2);
      expect(new Set(legends.map((l) => l.name)).size).toBe(legends.length);
      // Disjoint from the ordinary name pool, so a legend is never a face you
      // could also have met at $1,800/wk.
      const ordinary = new Set(
        Array.from({ length: 40 }, (_, i) => generateCandidates(role, createRng(i + 1)).candidates)
          .flat()
          .map((c) => c.name),
      );
      for (const legend of legends) expect(ordinary.has(legend.name)).toBe(false);
    }
  });
});

describe('rollTier', () => {
  const STAGES: Stage[] = ['garage', 'seed', 'seriesA', 'growth'];
  const SAMPLES = 40_000;
  /**
   * Absolute percentage points, not relative. Legend at garage is 0.5%, where
   * a relative tolerance would be tighter than the sampling noise of 40k
   * draws — and the whole point of the table is the shape, not the decimals.
   */
  const TOLERANCE_POINTS = 0.8;

  it('matches the published odds at every stage', () => {
    for (const stage of STAGES) {
      const counts = Object.fromEntries(PERK_BANDS.map((b) => [b, 0])) as Record<PerkBand, number>;
      // One rng chain, not a reseed per iteration — reseeding would sample the
      // generator's first draw over and over instead of its distribution.
      let rng = createRng(stage.length * 7919);
      for (let i = 0; i < SAMPLES; i++) {
        const [band, next] = rollTier(rng, stage);
        counts[band]++;
        rng = next;
      }

      const weights = STAGE_WEIGHTS[stage];
      const total = PERK_BANDS.reduce((sum, b) => sum + weights[b], 0);
      for (const band of PERK_BANDS) {
        const observed = (counts[band] / SAMPLES) * 100;
        const expected = (weights[band] / total) * 100;
        expect(Math.abs(observed - expected)).toBeLessThan(TOLERANCE_POINTS);
      }
    }
  });

  it('keeps a legend reachable at every stage, garage included', () => {
    for (const stage of STAGES) {
      expect(STAGE_WEIGHTS[stage].legend).toBeGreaterThan(0);
    }
  });

  it('shifts weight up the ladder as the company grows', () => {
    // Not a distribution test — a monotonicity one. The whole "bigger company
    // draws from better sources" rule is that these two columns move opposite.
    for (let i = 1; i < STAGES.length; i++) {
      const prev = STAGE_WEIGHTS[STAGES[i - 1]];
      const curr = STAGE_WEIGHTS[STAGES[i]];
      expect(curr.legend).toBeGreaterThan(prev.legend);
      expect(curr.elite).toBeGreaterThan(prev.elite);
      expect(curr.desperate).toBeLessThan(prev.desperate);
    }
  });
});

describe('roll', () => {
  const ROLL_SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
  const STAGES: Stage[] = ['garage', 'seed', 'seriesA', 'growth'];

  function everyRoll(fn: (offer: CLevelOffer, role: CLevelRole) => void) {
    for (const seed of ROLL_SEEDS) {
      for (const role of ROLES) {
        for (const stage of STAGES) {
          fn(roll(createRng(seed), role, stage).offer, role);
        }
      }
    }
  }

  it('is deterministic per seed', () => {
    const a = roll(createRng(11), 'cto', 'seed');
    const b = roll(createRng(11), 'cto', 'seed');
    expect(a).toEqual(b);
  });

  it('advances the rng so a second spin differs', () => {
    const first = roll(createRng(11), 'cto', 'seed');
    const second = roll(first.rng, 'cto', 'seed');
    expect(second.offer).not.toEqual(first.offer);
  });

  it('always offers two candidates on two different perk axes', () => {
    everyRoll((offer) => {
      expect(offer.candidates).toHaveLength(CANDIDATES_PER_ROLL);
      const axes = offer.candidates.map((c) => c.perk.axis);
      expect(new Set(axes).size).toBe(CANDIDATES_PER_ROLL);
    });
  });

  it('draws both candidates from the band the wheel landed on', () => {
    everyRoll((offer) => {
      for (const candidate of offer.candidates) expect(candidate.tier).toBe(offer.tier);
    });
  });

  it('never repeats a name or an id inside one roll', () => {
    everyRoll((offer) => {
      expect(new Set(offer.candidates.map((c) => c.name)).size).toBe(CANDIDATES_PER_ROLL);
      expect(new Set(offer.candidates.map((c) => c.id)).size).toBe(CANDIDATES_PER_ROLL);
    });
  });

  it('gives both candidates the same employer on a company tier', () => {
    everyRoll((offer) => {
      if (!IS_COMPANY_TIER[offer.tier]) return;
      for (const candidate of offer.candidates) expect(candidate.exEmployer).toBe(offer.source);
    });
  });

  it('gives each candidate their own relation on a cluster tier', () => {
    everyRoll((offer) => {
      if (offer.tier !== 'desperate' && offer.tier !== 'personal') return;
      const froms = offer.candidates.map((c) => c.exEmployer);
      expect(new Set(froms).size).toBe(CANDIDATES_PER_ROLL);
      // The banner names the cluster; the candidates name the connection.
      expect(offer.source).not.toBe(froms[0]);
    });
  });

  it('offers two different legends, each with their own company', () => {
    let sawLegend = false;
    everyRoll((offer, role) => {
      if (offer.tier !== 'legend') return;
      sawLegend = true;
      expect(offer.source).toBe(LEGEND_LABEL);
      const names = offer.candidates.map((c) => c.name);
      expect(new Set(names).size).toBe(CANDIDATES_PER_ROLL);
      const legendNames = new Set(legendsFor(role).map((l) => l.name));
      for (const candidate of offer.candidates) {
        expect(legendNames.has(candidate.name)).toBe(true);
        expect(candidate.exEmployer).not.toBe(LEGEND_LABEL);
      }
      expect(new Set(offer.candidates.map((c) => c.exEmployer)).size).toBe(CANDIDATES_PER_ROLL);
    });
    expect(sawLegend).toBe(true); // the sample has to actually reach one
  });

  it('prices the stronger-looking of the pair higher', () => {
    everyRoll((offer) => {
      const [a, b] = offer.candidates;
      const strength = (c: CLevelCandidate) => Math.abs(1 - c.perk.multiplier);
      if (strength(a) === strength(b)) return; // incomparable; either order is honest
      const stronger = strength(a) > strength(b) ? a : b;
      const weaker = stronger === a ? b : a;
      expect(stronger.salary).toBeGreaterThanOrEqual(weaker.salary);
    });
  });

  it('keeps both salaries inside the band the wheel landed on', () => {
    everyRoll((offer, role) => {
      const tiers = perkTiersFor(role, offer.tier);
      const floor = Math.min(...tiers.map((t) => t.salaryRange[0]));
      const ceiling = Math.max(...tiers.map((t) => t.salaryRange[1]));
      for (const candidate of offer.candidates) {
        // The widest quirk is +/-4%, then rounded to the nearest $100.
        expect(candidate.salary).toBeGreaterThanOrEqual(Math.round((floor * 0.96) / 100) * 100);
        expect(candidate.salary).toBeLessThanOrEqual(Math.round((ceiling * 1.04) / 100) * 100);
      }
    });
  });

  it('never offers a dominated candidate', () => {
    everyRoll((offer) => {
      for (const candidate of offer.candidates) {
        expect(isDominated(candidate, offer.candidates)).toBe(false);
      }
    });
  });
});

describe('themed draws', () => {
  const COMPANY_BANDS: PerkBand[] = PERK_BANDS.filter((b) => IS_COMPANY_TIER[b]);

  it('never repeats a draw id', () => {
    const ids = allDraws().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never repeats a person', () => {
    const names = allDrawPeople().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every person at least one seat', () => {
    for (const person of allDrawPeople()) {
      expect(person.roles.length).toBeGreaterThan(0);
    }
  });

  it('resolves every member name against the registry', () => {
    const known = new Set(allDrawPeople().map((p) => p.name));
    const dangling = allDraws().flatMap((d) => d.members.filter((m) => !known.has(m)).map((m) => `${d.id}: ${m}`));
    expect(dangling).toEqual([]);
  });

  it('never lists the same person twice in one draw', () => {
    for (const draw of allDraws()) {
      expect(new Set(draw.members).size).toBe(draw.members.length);
    }
  });

  it('lets every draw field a pair for at least one seat', () => {
    // A draw nobody can be hired out of is dead data, not a thin roster.
    const unusable = allDraws()
      .filter((d) => !ROLES.some((role) => membersFor(d, role).length >= MIN_MEMBERS_PER_ROLE))
      .map((d) => d.id);
    expect(unusable).toEqual([]);
  });

  it('covers every seat at every company band', () => {
    // If a (band, role) pair had no eligible draw the roll would silently fall
    // back to the plain ex-employer pools forever, and the tier would look empty.
    for (const band of COMPANY_BANDS) {
      for (const role of ROLES) {
        expect(drawsFor(role, band).length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the eligibility floor equal to what a roll actually needs', () => {
    expect(MIN_MEMBERS_PER_ROLE).toBe(CANDIDATES_PER_ROLL);
  });

  it('only ever sits at a company band', () => {
    // desperate/personal keep their cluster relations and legend keeps its
    // hand-written legends; a draw landing there would break those rules.
    for (const tier of Object.keys(TIER_BAND) as (keyof typeof TIER_BAND)[]) {
      expect(IS_COMPANY_TIER[TIER_BAND[tier]]).toBe(true);
    }
  });

  it('folds the era into the banner and leaves it out when there is none', () => {
    const withEra = allDraws().find((d) => d.era !== null)!;
    const withoutEra = allDraws().find((d) => d.era === null)!;
    expect(drawSource(withEra)).toBe(`${withEra.label} · ${withEra.era}`);
    expect(drawSource(withoutEra)).toBe(withoutEra.label);
  });

  it('draws both faces from the roster the banner names', () => {
    // The banner is a claim about who walked in; this is the claim being true.
    const banners = new Map(allDraws().map((d) => [drawSource(d), d]));
    let sawThemed = false;
    for (const seed of Array.from({ length: 400 }, (_, i) => i + 1)) {
      for (const role of ROLES) {
        for (const stage of ['garage', 'seed', 'seriesA', 'growth'] as Stage[]) {
          const { offer } = roll(createRng(seed), role, stage);
          const drawn = banners.get(offer.source);
          if (!drawn) continue;
          sawThemed = true;
          const roster = new Set(membersFor(drawn, role).map((p) => p.name));
          for (const candidate of offer.candidates) {
            expect(roster.has(candidate.name)).toBe(true);
            expect(candidate.exEmployer).toBe(offer.source);
          }
        }
      }
    }
    expect(sawThemed).toBe(true); // the sample has to actually reach one
  });

  it('leaves the plain ex-employer pools in circulation', () => {
    // THEMED_DRAW_CHANCE_PERCENT is deliberately below 100 so the original
    // parody names do not go dead.
    const banners = new Set(allDraws().map((d) => drawSource(d)));
    let sawPlain = false;
    for (const seed of Array.from({ length: 400 }, (_, i) => i + 1)) {
      const { offer } = roll(createRng(seed), 'cto', 'growth');
      if (IS_COMPANY_TIER[offer.tier] && !banners.has(offer.source)) sawPlain = true;
    }
    expect(sawPlain).toBe(true);
  });
});

/** A seat's standing offer built around one hand-made candidate. */
function offerOf(candidate: CLevelCandidate): CLevelOffer {
  return { tier: candidate.tier, source: candidate.exEmployer, candidates: [candidate] };
}

function makeCandidate(overrides: Partial<CLevelCandidate>): CLevelCandidate {
  return {
    id: 'test-candidate',
    name: 'Test Candidate',
    personality: 'Flavor text.',
    exEmployer: 'ex-Foogle',
    tier: 'elite',
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
    s0.cLevels.cto.offer = offerOf(candidate);
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
    s0.cLevels.cto.offer = offerOf(candidate);
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
    s0.cLevels.cto.offer = offerOf(candidate);
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
    s0.cLevels.cfo.offer = offerOf(burnCutCandidate);
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
    s0b.cLevels.cfo.offer = offerOf(roundTermsCandidate);
    const hiredRoundTerms = reduce(s0b, {
      type: 'HIRE_CLEVEL',
      role: 'cfo',
      candidateId: roundTermsCandidate.id,
    });
    expect(cLevelPerkMultiplierFor(hiredRoundTerms.cLevels, 'cfo', 'cfo-burnCut')).toBe(1); // no burn cut from this axis
  });

  it('charges the departure morale hit when hiring over a filled seat', () => {
    const s0 = reduce(newGame('Acme', 21), { type: 'ROLL_CANDIDATES', role: 'cto' });
    const [first, second] = s0.cLevels.cto.offer!.candidates;
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cto', candidateId: first.id });
    expect(hired.morale).toBe(s0.morale); // filling an empty seat is free

    const swapped = reduce(hired, { type: 'HIRE_CLEVEL', role: 'cto', candidateId: second.id });
    expect(swapped.cLevels.cto.hired).toEqual(second);
    // Swapping costs exactly what firing then hiring would — otherwise the
    // roll is a free way around FIRE_CLEVEL's price.
    expect(swapped.morale).toBe(hired.morale - C_LEVEL_DEPARTURE_MORALE_HIT);
    const viaFiring = reduce(reduce(hired, { type: 'FIRE_CLEVEL', role: 'cto' }), {
      type: 'HIRE_CLEVEL',
      role: 'cto',
      candidateId: second.id,
    });
    expect(viaFiring.morale).toBe(swapped.morale);
  });

  it('ignores an unknown candidateId', () => {
    const s0 = newGame('Acme', 9);
    const s1 = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cmo', candidateId: 'does-not-exist' });
    expect(s1).toEqual(s0);
  });
});

describe('ROLL_CANDIDATES', () => {
  it('fills an empty seat with a fresh offer', () => {
    const s0 = newGame('Acme', 11);
    expect(s0.cLevels.cto.offer).toBeNull();
    const rolled = reduce(s0, { type: 'ROLL_CANDIDATES', role: 'cto' });
    expect(rolled.cLevels.cto.offer?.candidates).toHaveLength(CANDIDATES_PER_ROLL);
    expect(rolled.cLevels.cto.offer?.source).toBeTruthy();
  });

  it('is deterministic for a fixed seed', () => {
    const s0 = newGame('Acme', 11);
    const a = reduce(s0, { type: 'ROLL_CANDIDATES', role: 'cto' });
    const b = reduce(s0, { type: 'ROLL_CANDIDATES', role: 'cto' });
    expect(a).toEqual(b);
  });

  it('leaves the other two seats alone', () => {
    const s0 = newGame('Acme', 11);
    const rolled = reduce(s0, { type: 'ROLL_CANDIDATES', role: 'cto' });
    expect(rolled.cLevels.cmo).toEqual(s0.cLevels.cmo);
    expect(rolled.cLevels.cfo).toEqual(s0.cLevels.cfo);
  });

  it('replaces the previous offer rather than accumulating one', () => {
    const s0 = newGame('Acme', 11);
    const once = reduce(s0, { type: 'ROLL_CANDIDATES', role: 'cto' });
    const twice = reduce(once, { type: 'ROLL_CANDIDATES', role: 'cto' });
    expect(twice.cLevels.cto.offer?.candidates).toHaveLength(CANDIDATES_PER_ROLL);
    expect(twice.cLevels.cto.offer).not.toEqual(once.cLevels.cto.offer);
  });

  it('draws from the stage the company is actually at', () => {
    // Garage and growth read the same rng differently, because the wheel is
    // weighted per stage — that lookup is the whole "bigger company, better
    // sources" rule, so it has to be wired to `state.stage` and nothing else.
    const garage: GameState = { ...newGame('Acme', 11), stage: 'garage' };
    const growth: GameState = { ...newGame('Acme', 11), stage: 'growth' };
    const fromGarage = reduce(garage, { type: 'ROLL_CANDIDATES', role: 'cto' });
    const fromGrowth = reduce(growth, { type: 'ROLL_CANDIDATES', role: 'cto' });
    expect(fromGrowth.cLevels.cto.offer?.tier).not.toBe(fromGarage.cLevels.cto.offer?.tier);
  });
});

describe('FIRE_CLEVEL', () => {
  it('applies the departure morale hit and clears the seat', () => {
    const s0 = reduce(newGame('Acme', 11), { type: 'ROLL_CANDIDATES', role: 'cmo' });
    const candidate = s0.cLevels.cmo.offer!.candidates[0];
    const hired = reduce(s0, { type: 'HIRE_CLEVEL', role: 'cmo', candidateId: candidate.id });
    const fired = reduce(hired, { type: 'FIRE_CLEVEL', role: 'cmo' });

    expect(fired.cLevels.cmo.hired).toBeNull();
    expect(fired.morale).toBeLessThan(hired.morale);
    // No fresh offer: regenerating one here was the free-reroll loop. Refilling
    // the seat now costs a roll, which is what makes firing a real decision.
    expect(fired.cLevels.cmo.offer).toBeNull();
    expect(fired.rng).toEqual(hired.rng);
  });

  it('is a no-op on an empty seat', () => {
    const s0 = newGame('Acme', 12);
    const s1 = reduce(s0, { type: 'FIRE_CLEVEL', role: 'cfo' });
    expect(s1).toEqual(s0);
  });
});

describe('C-level offers persist across ticks', () => {
  it('does not reroll a standing offer just from ticking', () => {
    let s: GameState = reduce(newGame('Acme', 13), { type: 'ROLL_CANDIDATES', role: 'cto' });
    const before = s.cLevels.cto.offer;
    for (let i = 0; i < 5; i++) s = tick(s);
    // The whole mitigation for the second daily wall: an empty roll budget
    // still leaves the last result sitting there, hireable.
    expect(s.cLevels.cto.offer).toEqual(before);
  });
});

describe('normalizeSave', () => {
  it('drops a pre-roll six-candidate offer but keeps whoever was hired', () => {
    const hired = makeCandidate({ id: 'kept' });
    const legacy = {
      ...newGame('Acme', 14),
      cLevels: {
        cto: { hired, candidates: [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' })] },
        cmo: { hired: null, candidates: [makeCandidate({ id: 'c' })] },
        cfo: { hired: null, candidates: [] },
      },
    } as unknown as GameState;

    const fixed = normalizeSave(legacy);
    expect(fixed.cLevels.cto.hired).toEqual(hired);
    expect(fixed.cLevels.cto.offer).toBeNull();
    expect(fixed.cLevels.cmo.offer).toBeNull();
    expect('candidates' in fixed.cLevels.cmo).toBe(false);
  });

  it('defaults a missing rollGrantsEarned to zero', () => {
    const legacy = { ...newGame('Acme', 14) } as Partial<GameState>;
    delete legacy.rollGrantsEarned;
    expect(normalizeSave(legacy as GameState).rollGrantsEarned).toBe(0);
  });

  it('leaves an already-current save untouched, so it is safe on every hydrate', () => {
    const current = reduce(newGame('Acme', 15), { type: 'ROLL_CANDIDATES', role: 'cto' });
    expect(normalizeSave(current)).toEqual(current);
    expect(normalizeSave(normalizeSave(current))).toEqual(normalizeSave(current));
  });
});
