/**
 * C-level candidate generation. Pure data + a pure generator function driven
 * by the seeded RNG, so the same seed always offers the same three people.
 */

import { nextInt } from './rng';
import { CLevelCandidate, CLevelPerk, CLevelPerkAxis, CLevelQuirk, CLevelRole, RngState } from './types';

const FIRST_NAMES = [
  'Priya',
  'Marcus',
  'Elena',
  'Jamal',
  'Yuki',
  'Sofia',
  'Dmitri',
  'Aisha',
  'Liam',
  'Noor',
  'Carlos',
  'Mei',
];

const LAST_NAMES = [
  'Okafor',
  'Nakamura',
  'Silva',
  'Petrov',
  'Kaur',
  'Bianchi',
  'Chen',
  'Adeyemi',
  'Novak',
  'Reyes',
  'Larsen',
  'Haddad',
];

const PERSONALITIES: Record<CLevelRole, string[]> = {
  cto: [
    'Ships at 2am, apologizes never.',
    'Rewrites everything in Rust given the chance.',
    'Believes in tests. Believes harder in demos.',
  ],
  cmo: [
    'Thinks every problem is a brand problem.',
    'Once got a startup trending for the wrong reasons.',
    'Speaks fluent buzzword.',
  ],
  cfo: [
    'Has never met a budget they didn’t want to cut.',
    'Reads the cap table for fun.',
    'Distrusts optimism, especially their own.',
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
      multiplier: 1.1,
      salaryRange: [6_000, 6_600],
    },
    {
      id: 'cto-productivity-2',
      label: '+20% dev productivity',
      axis: 'cto-productivity',
      multiplier: 1.2,
      salaryRange: [7_400, 8_000],
    },
    {
      id: 'cto-techdebt-1',
      label: '−15% tech-debt drag',
      axis: 'cto-techDebt',
      multiplier: 0.85,
      salaryRange: [6_200, 6_800],
    },
    {
      id: 'cto-techdebt-2',
      label: '−25% tech-debt drag',
      axis: 'cto-techDebt',
      multiplier: 0.75,
      salaryRange: [7_600, 8_200],
    },
    {
      id: 'cto-shortcut-1',
      label: '+25% dev productivity, +20% tech-debt drag',
      axis: 'cto-shortcut',
      multiplier: 1.25,
      tradeoffMultiplier: 1.2,
      salaryRange: [6_000, 6_600],
    },
    {
      id: 'cto-shortcut-2',
      label: '+40% dev productivity, +35% tech-debt drag',
      axis: 'cto-shortcut',
      multiplier: 1.4,
      tradeoffMultiplier: 1.35,
      salaryRange: [7_400, 8_000],
    },
  ],
  cmo: [
    {
      id: 'cmo-hypegain-1',
      label: '+10% hype impact',
      axis: 'cmo-hypeGain',
      multiplier: 1.1,
      salaryRange: [5_000, 5_600],
    },
    {
      id: 'cmo-hypegain-2',
      label: '+20% hype impact',
      axis: 'cmo-hypeGain',
      multiplier: 1.2,
      salaryRange: [6_400, 7_000],
    },
    {
      id: 'cmo-hypedecay-1',
      label: '−20% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      multiplier: 0.8,
      salaryRange: [5_200, 5_800],
    },
    {
      id: 'cmo-hypedecay-2',
      label: '−35% hype decay (hype lingers)',
      axis: 'cmo-hypeDecay',
      multiplier: 0.65,
      salaryRange: [6_600, 7_200],
    },
  ],
  cfo: [
    {
      id: 'cfo-burncut-1',
      label: '−10% fixed burn',
      axis: 'cfo-burnCut',
      multiplier: 0.9,
      salaryRange: [5_500, 6_100],
    },
    {
      id: 'cfo-burncut-2',
      label: '−20% fixed burn',
      axis: 'cfo-burnCut',
      multiplier: 0.8,
      salaryRange: [6_900, 7_500],
    },
    {
      id: 'cfo-roundterms-1',
      label: '−10% dilution on next round',
      axis: 'cfo-roundTerms',
      multiplier: 0.9,
      salaryRange: [5_700, 6_300],
    },
    {
      id: 'cfo-roundterms-2',
      label: '−20% dilution on next round',
      axis: 'cfo-roundTerms',
      multiplier: 0.8,
      salaryRange: [7_100, 7_700],
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

const CANDIDATES_PER_OFFER = 3;

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

  // Shuffle (Fisher-Yates, seeded) so the offer never repeats a personality line.
  const personalities = [...PERSONALITIES[role]];
  for (let i = personalities.length - 1; i > 0; i--) {
    let j: number;
    [j, r] = nextInt(r, 0, i);
    [personalities[i], personalities[j]] = [personalities[j], personalities[i]];
  }

  for (let i = 0; i < CANDIDATES_PER_OFFER; i++) {
    let firstIdx: number;
    let lastIdx: number;
    let fullName: string;
    do {
      [firstIdx, r] = nextInt(r, 0, FIRST_NAMES.length - 1);
      [lastIdx, r] = nextInt(r, 0, LAST_NAMES.length - 1);
      fullName = `${FIRST_NAMES[firstIdx]} ${LAST_NAMES[lastIdx]}`;
    } while (usedNames.has(fullName));
    usedNames.add(fullName);

    let tierIdx: number;
    [tierIdx, r] = nextInt(r, 0, PERK_TABLE[role].length - 1);
    const tier = PERK_TABLE[role][tierIdx];

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

    candidates.push({
      id: `${role}-${idSeed}-${r.counter}`,
      name: fullName,
      personality: personalities[i],
      salary,
      perk,
      quirk,
    });
  }

  return { candidates, rng: r };
}
