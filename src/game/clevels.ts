/**
 * C-level candidate generation. Pure data + a pure generator function driven
 * by the seeded RNG, so the same seed always offers the same three people.
 */

import { nextInt } from './rng';
import { CLevelCandidate, CLevelPerk, CLevelPerkAxis, CLevelQuirk, CLevelRole, RngState } from './types';

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

/** Price band a perk tier sits in. Drives which ex-employer pool a candidate draws from. */
type PerkBand = 'scrappy' | 'mid' | 'elite';

/** Flavor backgrounds by band. Elite hires are the ex-BigTech names that justify the huge salaries. */
const EX_EMPLOYERS: Record<PerkBand, string[]> = {
  scrappy: [
    'ex-failed startup',
    'bootcamp grad',
    'self-taught',
    'ex-Uper',
    'ex-WeWerk',
    'ex-Yahooo',
    'ex-Twitterr',
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

/** Per-role, per-axis perk tiers. Salary ranges never overlap *within an axis*
 * (a higher tier's minimum always clears the lower tier's maximum, even after
 * the widest quirk adjustment), so no candidate can ever offer strictly
 * better perk power at equal-or-lower cost than a same-axis peer — the
 * dominance the property test in clevels.test.ts checks for. */
interface PerkTier {
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
  ],
  cmo: [
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
  ],
  cfo: [
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
  ],
};

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
const OFFER_BANDS: PerkBand[] = ['scrappy', 'scrappy', 'mid', 'mid', 'elite', 'elite'];

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

    const employerPool = EX_EMPLOYERS[band];
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
      salary,
      perk,
      quirk,
    });
  }

  return { candidates, rng: r };
}
