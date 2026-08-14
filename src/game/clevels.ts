/**
 * C-level candidate generation. Pure data + a pure generator function driven
 * by the seeded RNG, so the same seed always offers the same three people.
 */

import { nextFloat, nextInt } from './rng';
import {
  CLevelCandidate,
  CLevelOffer,
  CLevelPerk,
  CLevelPerkAxis,
  CLevelQuirk,
  CLevelRole,
  PerkBand,
  PERK_BANDS,
  RngState,
  Stage,
} from './types';

/** Role-specific pools of lightly-altered real tech figures. Each offer draws
 * distinct names, so every pool must hold at least CANDIDATES_PER_OFFER entries. */
const NAMES: Record<CLevelRole, string[]> = {
  cto: [
    'Linus Torvold',
    'John Carmackk',
    'Jeff Deane',
    'Grace Hoppr',
    'Margaret Hamiltton',
    'Jensen Wong',
    'Kenn Thompsen',
    'Ada Lovelacce',
    'Guido van Rossom',
    'Andrej Karpathi',
    'Ilya Sutskeverr',
    'Fei-Fei Lee',
  ],
  cmo: [
    'Seth Godinn',
    'Gary Vaynerchukk',
    'Sheryl Sandbergg',
    'Ann Handleyy',
    'Neil Patell',
    'Scott Galowayy',
    'Emily Weisss',
    'Alex Hormozii',
    'Rand Fishkinn',
    'David Ogilvvy',
    'Ryan Reynoldds',
    'Kylie Jennerr',
  ],
  cfo: [
    'Ruth Poratt',
    'Luca Maestrii',
    'Amy Hoodd',
    'Warren Buffet',
    'Susan Wagnerr',
    'David Wehnerr',
    'Brian Olsavskyy',
    'Vasant Prabhuu',
    'Christine Lagardde',
    'Janet Yellenn',
    'Jamie Dimonn',
    'Zane Rowee',
  ],
};

const PERSONALITIES: Record<CLevelRole, string[]> = {
  cto: [
    'Ships at 2am, apologizes never.',
    'Rewrites everything in Rust given the chance.',
    'Believes in tests. Believes harder in demos.',
    'Has strong opinions about tabs. And everything else.',
    'Would rather refactor than sleep.',
    'Treats every outage as a personal insult.',
  ],
  cmo: [
    'Thinks every problem is a brand problem.',
    'Once got a startup trending for the wrong reasons.',
    'Speaks fluent buzzword.',
    'Has a growth hack for that.',
    'Measures everything, including your handshake.',
    'Never met a launch they couldn’t hype.',
  ],
  cfo: [
    'Has never met a budget they didn’t want to cut.',
    'Reads the cap table for fun.',
    'Distrusts optimism, especially their own.',
    'Keeps a spreadsheet for their spreadsheets.',
    'Can smell a bad term sheet from across the room.',
    'Thinks runway is a state of mind. A short one.',
  ],
};

/**
 * Which bands are drawn from a *company*. On these the wheel lands on one
 * employer and both candidates in a roll share it; on the cluster bands
 * (`desperate` / `personal`) each candidate draws its own relation, so one
 * roll never shows the same connection twice. `legend` is deliberately
 * neither: a legend brings the company they are famous for, so the source is
 * the person, not the employer.
 */
export const IS_COMPANY_TIER: Record<PerkBand, boolean> = {
  desperate: false,
  personal: false,
  scrappy: true,
  mid: true,
  elite: true,
  legend: false,
};

type CompanyBand = 'scrappy' | 'mid' | 'elite';

/** Flavor backgrounds by band. Elite hires are the ex-BigTech names that justify the huge salaries. */
const COMPANIES: Record<CompanyBand, string[]> = {
  scrappy: [
    'ex-failed startup',
    'bootcamp grad',
    'self-taught',
    'ex-Uper',
    'ex-WeWerk',
    'ex-Yahooo',
    'ex-Twitterr',
    'ex-Groupoon',
  ],
  mid: ['ex-Netflex', 'ex-Tesler', 'ex-Palantear', 'ex-Airbrb', 'ex-Stripee', 'ex-Snapp', 'ex-Dropboxx'],
  elite: [
    'ex-Foogle',
    'ex-ClosedAI',
    'ex-Macrosoft',
    'ex-Metta',
    'ex-Nvidiaa',
    'ex-Amazoom',
    'ex-Applle',
    'ex-Anthroppic',
  ],
};

/**
 * How a cluster-tier candidate knows you. Drawn per candidate rather than per
 * roll, so a `personal` roll reads as two different people from two different
 * corners of your life.
 */
const RELATIONS: Record<'desperate' | 'personal', string[]> = {
  desperate: [
    'a friend of your mom',
    'your cousin who "does computers"',
    'a guy from your gym',
    "your landlord's nephew",
    'answered the flyer',
    'your old roommate, allegedly',
  ],
  personal: [
    'someone from your last job',
    'you studied together',
    'from your bootcamp cohort',
    'the intern who got good',
    'you met at a meetup',
    'your first ever manager',
  ],
};

/** The banner shown above a cluster-tier roll, in place of a company name. */
export const CLUSTER_LABELS: Record<'desperate' | 'personal', string> = {
  desperate: 'Whoever you can get',
  personal: 'Your own network',
};

/** A name everyone in the industry knows. Legend rolls draw two of these. */
export interface Legend {
  name: string;
  /** The company they are famous for — a legend brings their own source. */
  from: string;
  flavour: string;
}

/**
 * Four per role, deliberately disjoint from `NAMES` so a legend never shares a
 * name with an ordinary candidate. Parody names only, and nobody with a
 * criminal conviction — same convention as the rest of the pools.
 */
const LEGENDS: Record<CLevelRole, Legend[]> = {
  cto: [
    { name: 'Steve Jobbz', from: 'ex-Applle', flavour: 'Will tell you the demo is not good enough. It is not.' },
    { name: 'Bill Gatess', from: 'ex-Macrosoft', flavour: 'Read the whole codebase on one flight. Has notes.' },
    { name: 'Sundar Pichaii', from: 'ex-Foogle', flavour: 'Ships calmly, at a scale you cannot picture.' },
    { name: 'Elon Muskk', from: 'ex-Tesler', flavour: 'Sleeps on the factory floor. Your factory floor now.' },
  ],
  cmo: [
    { name: 'Oprah Winfrei', from: 'ex-Harpoo', flavour: 'You get a launch. You get a launch.' },
    { name: 'Richard Bransonn', from: 'ex-Virgen', flavour: 'Will do the stunt personally. Already booked it.' },
    { name: 'Phil Knightt', from: 'ex-Nikee', flavour: 'Believes the swoosh is worth more than the shoe.' },
    { name: 'Steve Balmerr', from: 'ex-Macrosoft', flavour: 'Developers. Developers. Developers.' },
  ],
  cfo: [
    { name: 'Charlie Mungerr', from: 'ex-Berkshyre', flavour: 'Will explain why your idea is stupid. Briefly.' },
    { name: 'Ray Daliio', from: 'ex-Bridgewatter', flavour: 'Has a principle for this. And for that. And that.' },
    { name: 'Peter Lynchh', from: 'ex-Fidellity', flavour: 'Only invests in what he understands. Still deciding.' },
    { name: 'Larry Finkk', from: 'ex-BlackRokk', flavour: 'Writes one letter a year. Everyone reads it.' },
  ],
};

/** The legend pool for a role, for callers that need to size or seed a roll. */
export function legendsFor(role: CLevelRole): readonly Legend[] {
  return LEGENDS[role];
}

/** Per-role, per-axis perk tiers. Salary ranges never overlap *within an axis*
 * (a higher tier's minimum always clears the lower tier's maximum, even after
 * the widest quirk adjustment), so no candidate can ever offer strictly
 * better perk power at equal-or-lower cost than a same-axis peer — the
 * dominance the property test in clevels.test.ts checks for.
 *
 * They also never overlap *within a role across bands*, which is what lets a
 * roll's source banner double as a price signal. Note they do overlap across
 * *roles* — a cmo `mid` sits inside the cto `scrappy` range — which has always
 * been true and is fine, because you never compare a CMO to a CTO.
 *
 * Perk strength rises monotonically with band on every axis. Where an axis's
 * `scrappy` rung is already modest (+10%), `desperate` and `personal` land
 * below it rather than at the design doc's headline 4–18% — the ladder has to
 * stay monotonic, and the existing three bands are balance-checked. */
export interface PerkTier {
  id: string;
  label: string;
  axis: CLevelPerkAxis;
  band: PerkBand;
  multiplier: number;
  tradeoffMultiplier?: number;
  salaryRange: [number, number];
}

const PERK_TABLE: Record<CLevelRole, PerkTier[]> = {
  cto: [
    {
      id: 'cto-productivity-desperate',
      label: '+4% dev productivity',
      axis: 'cto-productivity',
      band: 'desperate',
      multiplier: 1.04,
      salaryRange: [1_800, 2_000],
    },
    {
      id: 'cto-techdebt-desperate',
      label: '−6% tech-debt drag',
      axis: 'cto-techDebt',
      band: 'desperate',
      multiplier: 0.94,
      salaryRange: [2_200, 2_400],
    },
    {
      id: 'cto-shortcut-desperate',
      label: '+8% dev productivity, +6% tech-debt drag',
      axis: 'cto-shortcut',
      band: 'desperate',
      multiplier: 1.08,
      tradeoffMultiplier: 1.06,
      salaryRange: [2_600, 2_800],
    },
    {
      id: 'cto-productivity-personal',
      label: '+7% dev productivity',
      axis: 'cto-productivity',
      band: 'personal',
      multiplier: 1.07,
      salaryRange: [3_200, 3_500],
    },
    {
      id: 'cto-techdebt-personal',
      label: '−10% tech-debt drag',
      axis: 'cto-techDebt',
      band: 'personal',
      multiplier: 0.9,
      salaryRange: [3_700, 4_000],
    },
    {
      id: 'cto-shortcut-personal',
      label: '+15% dev productivity, +12% tech-debt drag',
      axis: 'cto-shortcut',
      band: 'personal',
      multiplier: 1.15,
      tradeoffMultiplier: 1.12,
      salaryRange: [4_100, 4_400],
    },
    {
      id: 'cto-productivity-1',
      label: '+10% dev productivity',
      axis: 'cto-productivity',
      band: 'scrappy',
      multiplier: 1.1,
      salaryRange: [6_000, 6_600],
    },
    {
      id: 'cto-productivity-2',
      label: '+20% dev productivity',
      axis: 'cto-productivity',
      band: 'mid',
      multiplier: 1.2,
      salaryRange: [7_400, 8_000],
    },
    {
      id: 'cto-productivity-3',
      label: '+35% dev productivity',
      axis: 'cto-productivity',
      band: 'elite',
      multiplier: 1.35,
      salaryRange: [26_000, 30_000],
    },
    {
      id: 'cto-techdebt-1',
      label: '−15% tech-debt drag',
      axis: 'cto-techDebt',
      band: 'scrappy',
      multiplier: 0.85,
      salaryRange: [6_200, 6_800],
    },
    {
      id: 'cto-techdebt-2',
      label: '−25% tech-debt drag',
      axis: 'cto-techDebt',
      band: 'mid',
      multiplier: 0.75,
      salaryRange: [7_600, 8_200],
    },
    {
      id: 'cto-techdebt-3',
      label: '−40% tech-debt drag',
      axis: 'cto-techDebt',
      band: 'elite',
      multiplier: 0.6,
      salaryRange: [27_000, 31_000],
    },
    {
      id: 'cto-shortcut-1',
      label: '+25% dev productivity, +20% tech-debt drag',
      axis: 'cto-shortcut',
      band: 'scrappy',
      multiplier: 1.25,
      tradeoffMultiplier: 1.2,
      salaryRange: [6_000, 6_600],
    },
    {
      id: 'cto-shortcut-2',
      label: '+40% dev productivity, +35% tech-debt drag',
      axis: 'cto-shortcut',
      band: 'mid',
      multiplier: 1.4,
      tradeoffMultiplier: 1.35,
      salaryRange: [7_400, 8_000],
    },
    {
      id: 'cto-shortcut-3',
      label: '+60% dev productivity, +50% tech-debt drag',
      axis: 'cto-shortcut',
      band: 'elite',
      multiplier: 1.6,
      tradeoffMultiplier: 1.5,
      salaryRange: [26_000, 30_000],
    },
    {
      id: 'cto-productivity-legend',
      label: '+60% dev productivity',
      axis: 'cto-productivity',
      band: 'legend',
      multiplier: 1.6,
      salaryRange: [52_000, 58_000],
    },
    {
      id: 'cto-techdebt-legend',
      label: '−65% tech-debt drag',
      axis: 'cto-techDebt',
      band: 'legend',
      multiplier: 0.35,
      salaryRange: [61_000, 67_000],
    },
    {
      id: 'cto-shortcut-legend',
      label: '+90% dev productivity, +70% tech-debt drag',
      axis: 'cto-shortcut',
      band: 'legend',
      multiplier: 1.9,
      tradeoffMultiplier: 1.7,
      salaryRange: [72_000, 78_000],
    },
  ],
  cmo: [
    {
      id: 'cmo-hypegain-desperate',
      label: '+4% hype impact',
      axis: 'cmo-hypeGain',
      band: 'desperate',
      multiplier: 1.04,
      salaryRange: [1_800, 2_200],
    },
    {
      id: 'cmo-hypedecay-desperate',
      label: '−8% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      band: 'desperate',
      multiplier: 0.92,
      salaryRange: [2_400, 2_800],
    },
    {
      id: 'cmo-hypegain-personal',
      label: '+7% hype impact',
      axis: 'cmo-hypeGain',
      band: 'personal',
      multiplier: 1.07,
      salaryRange: [3_200, 3_700],
    },
    {
      id: 'cmo-hypedecay-personal',
      label: '−14% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      band: 'personal',
      multiplier: 0.86,
      salaryRange: [3_900, 4_400],
    },
    {
      id: 'cmo-hypegain-1',
      label: '+10% hype impact',
      axis: 'cmo-hypeGain',
      band: 'scrappy',
      multiplier: 1.1,
      salaryRange: [5_000, 5_600],
    },
    {
      id: 'cmo-hypegain-2',
      label: '+20% hype impact',
      axis: 'cmo-hypeGain',
      band: 'mid',
      multiplier: 1.2,
      salaryRange: [6_400, 7_000],
    },
    {
      id: 'cmo-hypegain-3',
      label: '+35% hype impact',
      axis: 'cmo-hypeGain',
      band: 'elite',
      multiplier: 1.35,
      salaryRange: [24_000, 28_000],
    },
    {
      id: 'cmo-hypedecay-1',
      label: '−20% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      band: 'scrappy',
      multiplier: 0.8,
      salaryRange: [5_200, 5_800],
    },
    {
      id: 'cmo-hypedecay-2',
      label: '−35% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      band: 'mid',
      multiplier: 0.65,
      salaryRange: [6_600, 7_200],
    },
    {
      id: 'cmo-hypedecay-3',
      label: '−55% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      band: 'elite',
      multiplier: 0.45,
      salaryRange: [25_000, 29_000],
    },
    {
      id: 'cmo-hypegain-legend',
      label: '+60% hype impact',
      axis: 'cmo-hypeGain',
      band: 'legend',
      multiplier: 1.6,
      salaryRange: [52_000, 60_000],
    },
    {
      id: 'cmo-hypedecay-legend',
      label: '−80% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      band: 'legend',
      multiplier: 0.2,
      salaryRange: [66_000, 78_000],
    },
  ],
  cfo: [
    {
      id: 'cfo-burncut-desperate',
      label: '−4% fixed burn',
      axis: 'cfo-burnCut',
      band: 'desperate',
      multiplier: 0.96,
      salaryRange: [1_800, 2_800],
    },
    {
      id: 'cfo-roundterms-desperate',
      label: '−4% dilution on next round',
      axis: 'cfo-roundTerms',
      band: 'desperate',
      multiplier: 0.96,
      salaryRange: [1_800, 2_800],
    },
    {
      id: 'cfo-burncut-personal',
      label: '−7% fixed burn',
      axis: 'cfo-burnCut',
      band: 'personal',
      multiplier: 0.93,
      salaryRange: [3_200, 4_400],
    },
    {
      id: 'cfo-roundterms-personal',
      label: '−7% dilution on next round',
      axis: 'cfo-roundTerms',
      band: 'personal',
      multiplier: 0.93,
      salaryRange: [3_200, 4_400],
    },
    {
      id: 'cfo-burncut-1',
      label: '−10% fixed burn',
      axis: 'cfo-burnCut',
      band: 'scrappy',
      multiplier: 0.9,
      salaryRange: [5_500, 6_100],
    },
    {
      id: 'cfo-burncut-2',
      label: '−20% fixed burn',
      axis: 'cfo-burnCut',
      band: 'mid',
      multiplier: 0.8,
      salaryRange: [6_900, 7_500],
    },
    {
      id: 'cfo-burncut-3',
      label: '−35% fixed burn',
      axis: 'cfo-burnCut',
      band: 'elite',
      multiplier: 0.65,
      salaryRange: [24_000, 28_000],
    },
    {
      id: 'cfo-roundterms-1',
      label: '−10% dilution on next round',
      axis: 'cfo-roundTerms',
      band: 'scrappy',
      multiplier: 0.9,
      salaryRange: [5_700, 6_300],
    },
    {
      id: 'cfo-roundterms-2',
      label: '−20% dilution on next round',
      axis: 'cfo-roundTerms',
      band: 'mid',
      multiplier: 0.8,
      salaryRange: [7_100, 7_700],
    },
    {
      id: 'cfo-roundterms-3',
      label: '−35% dilution on next round',
      axis: 'cfo-roundTerms',
      band: 'elite',
      multiplier: 0.65,
      salaryRange: [25_000, 29_000],
    },
    {
      id: 'cfo-burncut-legend',
      label: '−60% fixed burn',
      axis: 'cfo-burnCut',
      band: 'legend',
      multiplier: 0.4,
      salaryRange: [52_000, 78_000],
    },
    {
      id: 'cfo-roundterms-legend',
      label: '−60% dilution on next round',
      axis: 'cfo-roundTerms',
      band: 'legend',
      multiplier: 0.4,
      salaryRange: [52_000, 78_000],
    },
  ],
};

/** Read-only view of the tier table — the roll and the balance property tests both walk it. */
export function perkTiersFor(role: CLevelRole, band?: PerkBand): readonly PerkTier[] {
  return band === undefined ? PERK_TABLE[role] : PERK_TABLE[role].filter((t) => t.band === band);
}

const QUIRKS: Record<CLevelRole, CLevelQuirk[]> = {
  cto: [
    { label: 'Negotiates hard.', salaryDeltaFraction: 0.04 },
    { label: 'Just happy to be building something.', salaryDeltaFraction: -0.04 },
  ],
  cmo: [
    { label: 'Negotiates hard.', salaryDeltaFraction: 0.04 },
    { label: 'Took the job for the mission, not the money.', salaryDeltaFraction: -0.04 },
  ],
  cfo: [
    { label: 'Negotiates hard.', salaryDeltaFraction: 0.04 },
    { label: 'Underpriced themselves at their last three jobs.', salaryDeltaFraction: -0.04 },
  ],
};

/** Chance (0–99) any given candidate is generated with a quirk. */
const QUIRK_CHANCE_PERCENT = 40;

const CANDIDATES_PER_OFFER = 6;

/** Band for each slot in an offer, so every offer spans cheap → prestige rather
 * than rolling all-cheap or all-elite. Length must equal CANDIDATES_PER_OFFER. */
const OFFER_BANDS: CompanyBand[] = ['scrappy', 'scrappy', 'mid', 'mid', 'elite', 'elite'];

/** Whether higher `multiplier` is mechanically better on this axis (used only to rank same-axis perks for the dominance check). */
const HIGHER_IS_BETTER: Record<CLevelPerkAxis, boolean> = {
  'cto-productivity': true,
  'cto-techDebt': false,
  'cto-shortcut': true,
  'cmo-hypeGain': true,
  'cmo-hypeDecay': false,
  'cfo-burnCut': false,
  'cfo-roundTerms': false,
};

/** A single comparable scalar for a perk's mechanical strength — higher is always better. Only meaningful between perks on the *same* axis. */
export function perkPower(perk: CLevelPerk): number {
  return HIGHER_IS_BETTER[perk.axis] ? perk.multiplier : -perk.multiplier;
}

/**
 * True if some other candidate in the same pool offers strictly greater perk
 * power on the same axis at equal-or-lower salary — i.e. `candidate` is a
 * strictly worse deal than an available alternative.
 */
export function isDominated(candidate: CLevelCandidate, pool: CLevelCandidate[]): boolean {
  return pool.some(
    (other) =>
      other.id !== candidate.id &&
      other.perk.axis === candidate.perk.axis &&
      perkPower(other.perk) > perkPower(candidate.perk) &&
      other.salary <= candidate.salary,
  );
}

/** Draw a fresh standing offer of candidates for a C-level seat. */
export function generateCandidates(
  role: CLevelRole,
  rng: RngState,
): { candidates: CLevelCandidate[]; rng: RngState } {
  let r = rng;
  const candidates: CLevelCandidate[] = [];
  const usedNames = new Set<string>();
  const namePool = NAMES[role];

  // Shuffle (Fisher-Yates, seeded) so the offer never repeats a personality line.
  const personalities = [...PERSONALITIES[role]];
  for (let i = personalities.length - 1; i > 0; i--) {
    let j: number;
    [j, r] = nextInt(r, 0, i);
    [personalities[i], personalities[j]] = [personalities[j], personalities[i]];
  }

  for (let i = 0; i < CANDIDATES_PER_OFFER; i++) {
    let name: string;
    do {
      let nameIdx: number;
      [nameIdx, r] = nextInt(r, 0, namePool.length - 1);
      name = namePool[nameIdx];
    } while (usedNames.has(name));
    usedNames.add(name);

    // Each slot is pinned to a price band so the offer always spans cheap → prestige.
    const band = OFFER_BANDS[i];
    const bandTiers = PERK_TABLE[role].filter((t) => t.band === band);
    let tierIdx: number;
    [tierIdx, r] = nextInt(r, 0, bandTiers.length - 1);
    const tier = bandTiers[tierIdx];

    let rawSalary: number;
    [rawSalary, r] = nextInt(r, tier.salaryRange[0], tier.salaryRange[1]);

    let quirkRoll: number;
    [quirkRoll, r] = nextInt(r, 0, 99);
    let quirk: CLevelQuirk | null = null;
    if (quirkRoll < QUIRK_CHANCE_PERCENT) {
      let quirkIdx: number;
      [quirkIdx, r] = nextInt(r, 0, QUIRKS[role].length - 1);
      quirk = QUIRKS[role][quirkIdx];
    }
    const salary = Math.round((rawSalary * (1 + (quirk?.salaryDeltaFraction ?? 0))) / 100) * 100;

    const employerPool = COMPANIES[band];
    let employerIdx: number;
    [employerIdx, r] = nextInt(r, 0, employerPool.length - 1);
    const exEmployer = employerPool[employerIdx];

    let idSeed: number;
    [idSeed, r] = nextInt(r, 0, 999_999);

    const perk: CLevelPerk = {
      id: tier.id,
      label: tier.label,
      axis: tier.axis,
      multiplier: tier.multiplier,
      ...(tier.tradeoffMultiplier !== undefined ? { tradeoffMultiplier: tier.tradeoffMultiplier } : {}),
    };

    candidates.push({
      id: `${role}-${idSeed}-${r.counter}`,
      name,
      personality: personalities[i],
      exEmployer,
      tier: band,
      salary,
      perk,
      quirk,
    });
  }

  return { candidates, rng: r };
}

// ---------------------------------------------------------------------------
// The hire roll
// ---------------------------------------------------------------------------

/** Candidates handed over by one spin. Always on different perk axes. */
export const CANDIDATES_PER_ROLL = 2;

/** The banner a legend roll shows in place of a company or cluster name. */
export const LEGEND_LABEL = 'A legend walked in';

/**
 * Relative odds of each band per company stage — the whole of the
 * "bigger company draws from better sources" rule, as one lookup on
 * `state.stage`. Weights, not percentages: `rollTier` normalises by their sum,
 * so they can be read as a shape rather than kept summing to 100.
 *
 * Legend stays reachable at every stage, garage included. That 0.5 is the
 * point of the whole table: it is what makes a garage spin worth pressing.
 */
export const STAGE_WEIGHTS: Record<Stage, Record<PerkBand, number>> = {
  garage: { desperate: 40, personal: 32, scrappy: 20, mid: 6, elite: 1.5, legend: 0.5 },
  seed: { desperate: 20, personal: 30, scrappy: 28, mid: 15, elite: 5, legend: 2 },
  seriesA: { desperate: 8, personal: 20, scrappy: 27, mid: 25, elite: 15, legend: 5 },
  growth: { desperate: 2, personal: 10, scrappy: 20, mid: 28, elite: 30, legend: 10 },
};

/** Spin the wheel for a source band. Pure; the caller threads the returned rng. */
export function rollTier(rng: RngState, stage: Stage): [PerkBand, RngState] {
  const weights = STAGE_WEIGHTS[stage];
  const total = PERK_BANDS.reduce((sum, band) => sum + weights[band], 0);
  const [roll, next] = nextFloat(rng);
  let cursor = roll * total;
  for (const band of PERK_BANDS) {
    cursor -= weights[band];
    if (cursor < 0) return [band, next];
  }
  // Unreachable while every weight is finite and positive; float drift only.
  return [PERK_BANDS[PERK_BANDS.length - 1], next];
}

/**
 * How big a perk's headline number is, ignoring which axis it sits on. Only
 * comparable *within one band* — across bands the ladder already guarantees
 * ordering, and across roles the axes are not the same currency. Used purely
 * to make the pricier of a roll's two candidates also the stronger-looking
 * one, so a pair never reads as "the cheap one is obviously better".
 */
function headlineStrength(tier: PerkTier): number {
  return Math.abs(1 - tier.multiplier);
}

/** Fisher-Yates over a copy, seeded. */
function shuffled<T>(items: readonly T[], rng: RngState): [T[], RngState] {
  const out = [...items];
  let r = rng;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, r] = nextInt(r, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, r];
}

/**
 * One spin of the hire roll: land on a source, then draw
 * {@link CANDIDATES_PER_ROLL} people from it.
 *
 * The rules the feel depends on, all enforced here rather than left to the
 * data: the two candidates always sit on **different perk axes** (so the
 * choice is a real tradeoff, never "same perk, one is bigger"); a company tier
 * gives both candidates the **same** employer while a cluster tier gives each
 * their **own** relation; a legend roll offers **two different** legends; and
 * within the pair the stronger-looking perk always carries the higher salary.
 */
export function roll(
  rng: RngState,
  role: CLevelRole,
  stage: Stage,
): { offer: CLevelOffer; rng: RngState } {
  let r = rng;
  let band: PerkBand;
  [band, r] = rollTier(r, stage);

  // Different axes is the invariant; shuffling the axis list is how it is met.
  const bandTiers = perkTiersFor(role, band);
  let tiers: PerkTier[];
  [tiers, r] = shuffled(bandTiers, r);
  tiers = tiers.slice(0, CANDIDATES_PER_ROLL);

  // Who they are. Legends bring their own name, company and flavour line;
  // everyone else draws from the role pools.
  let people: { name: string; personality: string; from: string | null }[];
  if (band === 'legend') {
    let picked: Legend[];
    [picked, r] = shuffled(LEGENDS[role], r);
    people = picked
      .slice(0, CANDIDATES_PER_ROLL)
      .map((l) => ({ name: l.name, personality: l.flavour, from: l.from }));
  } else {
    let names: string[];
    [names, r] = shuffled(NAMES[role], r);
    let personalities: string[];
    [personalities, r] = shuffled(PERSONALITIES[role], r);
    people = names
      .slice(0, CANDIDATES_PER_ROLL)
      .map((name, i) => ({ name, personality: personalities[i], from: null }));
  }

  // Where they came from, and what the banner says.
  let source: string;
  let relations: string[] = [];
  if (band === 'legend') {
    source = LEGEND_LABEL;
  } else if (IS_COMPANY_TIER[band]) {
    const pool = COMPANIES[band as CompanyBand];
    let companyIdx: number;
    [companyIdx, r] = nextInt(r, 0, pool.length - 1);
    source = pool[companyIdx];
  } else {
    const cluster = band as 'desperate' | 'personal';
    source = CLUSTER_LABELS[cluster];
    [relations, r] = shuffled(RELATIONS[cluster], r);
  }

  const candidates: CLevelCandidate[] = tiers.map((tier, i) => {
    let rawSalary: number;
    [rawSalary, r] = nextInt(r, tier.salaryRange[0], tier.salaryRange[1]);

    let quirkRoll: number;
    [quirkRoll, r] = nextInt(r, 0, 99);
    let quirk: CLevelQuirk | null = null;
    if (quirkRoll < QUIRK_CHANCE_PERCENT) {
      let quirkIdx: number;
      [quirkIdx, r] = nextInt(r, 0, QUIRKS[role].length - 1);
      quirk = QUIRKS[role][quirkIdx];
    }
    const salary = Math.round((rawSalary * (1 + (quirk?.salaryDeltaFraction ?? 0))) / 100) * 100;

    let idSeed: number;
    [idSeed, r] = nextInt(r, 0, 999_999);

    const perk: CLevelPerk = {
      id: tier.id,
      label: tier.label,
      axis: tier.axis,
      multiplier: tier.multiplier,
      ...(tier.tradeoffMultiplier !== undefined ? { tradeoffMultiplier: tier.tradeoffMultiplier } : {}),
    };

    return {
      id: `${role}-${idSeed}-${r.counter}`,
      name: people[i].name,
      personality: people[i].personality,
      exEmployer: people[i].from ?? (IS_COMPANY_TIER[band] ? source : relations[i]),
      tier: band,
      salary,
      perk,
      quirk,
    };
  });

  // Both candidates sit in the same band, so trading their price tags keeps
  // each inside the band's span while guaranteeing the stronger-looking perk
  // is the dearer of the two. The quirk travels with the salary it explains.
  const [a, b] = candidates;
  if (headlineStrength(tiers[0]) > headlineStrength(tiers[1]) && a.salary < b.salary) {
    [a.salary, b.salary] = [b.salary, a.salary];
    [a.quirk, b.quirk] = [b.quirk, a.quirk];
  } else if (headlineStrength(tiers[1]) > headlineStrength(tiers[0]) && b.salary < a.salary) {
    [a.salary, b.salary] = [b.salary, a.salary];
    [a.quirk, b.quirk] = [b.quirk, a.quirk];
  }

  return { offer: { tier: band, source, candidates }, rng: r };
}
