/**
 * C-level candidate generation. Pure data + a pure generator function driven
 * by the seeded RNG, so the same seed always offers the same three people.
 */

import { nextInt } from './rng';
import { CLevelCandidate, CLevelPerk, CLevelRole, RngState } from './types';

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

const PERK_TABLE: Record<CLevelRole, CLevelPerk[]> = {
  cto: [
    { id: 'cto-dev-boost-10', label: '+10% dev productivity', multiplier: 1.1 },
    { id: 'cto-dev-boost-15', label: '+15% dev productivity', multiplier: 1.15 },
    { id: 'cto-dev-boost-25', label: '+25% dev productivity', multiplier: 1.25 },
  ],
  cmo: [
    { id: 'cmo-hype-10', label: '+10% hype impact', multiplier: 1.1 },
    { id: 'cmo-hype-15', label: '+15% hype impact', multiplier: 1.15 },
    { id: 'cmo-hype-20', label: '+20% hype impact', multiplier: 1.2 },
  ],
  cfo: [
    { id: 'cfo-burn-cut-10', label: '−10% fixed burn', multiplier: 0.9 },
    { id: 'cfo-burn-cut-15', label: '−15% fixed burn', multiplier: 0.85 },
    { id: 'cfo-burn-cut-20', label: '−20% fixed burn', multiplier: 0.8 },
  ],
};

const SALARY_RANGE: Record<CLevelRole, [number, number]> = {
  cto: [6_000, 9_000],
  cmo: [5_000, 8_000],
  cfo: [5_500, 8_500],
};

const CANDIDATES_PER_OFFER = 3;

/** Draw a fresh standing offer of candidates for a C-level seat. */
export function generateCandidates(
  role: CLevelRole,
  rng: RngState,
): { candidates: CLevelCandidate[]; rng: RngState } {
  let r = rng;
  const candidates: CLevelCandidate[] = [];

  for (let i = 0; i < CANDIDATES_PER_OFFER; i++) {
    let firstIdx: number;
    let lastIdx: number;
    let personalityIdx: number;
    let perkIdx: number;
    let rawSalary: number;
    let idSeed: number;

    [firstIdx, r] = nextInt(r, 0, FIRST_NAMES.length - 1);
    [lastIdx, r] = nextInt(r, 0, LAST_NAMES.length - 1);
    [personalityIdx, r] = nextInt(r, 0, PERSONALITIES[role].length - 1);
    [perkIdx, r] = nextInt(r, 0, PERK_TABLE[role].length - 1);
    [rawSalary, r] = nextInt(r, SALARY_RANGE[role][0], SALARY_RANGE[role][1]);
    [idSeed, r] = nextInt(r, 0, 999_999);

    candidates.push({
      id: `${role}-${idSeed}-${r.counter}`,
      name: `${FIRST_NAMES[firstIdx]} ${LAST_NAMES[lastIdx]}`,
      personality: PERSONALITIES[role][personalityIdx],
      salary: Math.round(rawSalary / 100) * 100,
      perk: PERK_TABLE[role][perkIdx],
    });
  }

  return { candidates, rng: r };
}
