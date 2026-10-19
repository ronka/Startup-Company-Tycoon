/**
 * Investors and their term sheets — fundraising as a choice between offers.
 *
 * Each round (Seed, Series A–G) is no longer a single computed raise: named
 * investors put term sheets on the table over the weeks the round is open,
 * each trading cash against equity and carrying its own strings. Offers
 * expire, the player can pass on any of them, and taking one closes the round.
 *
 * NAMING follows clevels.ts: lightly altered parody names ('Foogle Ventures',
 * 'Andreessen Horrowitz'), nobody with a criminal conviction, and existing
 * spellings reused so 'Foogle' is the same company everywhere in the game.
 *
 * DETERMINISM: offers are dealt from their own RNG stream, seeded from the
 * run's seed, the week and the round (`offerSeedFor`), never from
 * `GameState.rng`. Same seed and same actions still deal the same offers,
 * and the main stream every other system draws from is left untouched.
 */

import {
  CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER,
  MAX_DILUTION_PER_ROUND,
  canRaiseRound,
  cLevelPerkMultiplierFor,
  nextRound,
  roundOpenAt,
  roundTermsFor,
  weeklyStatsFor,
} from './balance';
import { CLEAN_RAISE_TERMS_FLAG } from './events/standup';
import { INVESTOR_FLAGS } from './investor-flags';
import { Era } from './events/types';
import { createRng, nextFloat, nextInt, nextRange } from './rng';
import { FundingOffer, GameState, RngState, RoundType } from './types';

/** Display names for each round. */
export const ROUND_LABEL: Record<RoundType, string> = {
  seed: 'Seed',
  seriesA: 'Series A',
  seriesB: 'Series B',
  seriesC: 'Series C',
  seriesD: 'Series D',
  seriesE: 'Series E',
  seriesF: 'Series F',
  seriesG: 'Series G',
};

export type InvestorKind = 'family' | 'crowd' | 'angel' | 'accelerator' | 'vc' | 'tier1' | 'corporate' | 'megafund' | 'vulture';

/** What taking this investor's money does besides the cash and the dilution. */
export interface InvestorStrings {
  /** Short chip text on the offer, e.g. 'Board seat'. */
  label: string;
  hype?: number;
  morale?: number;
  /** Story flag set on accept; gates a follow-up card later in the run. */
  flag?: string;
}

export interface Investor {
  id: string;
  name: string;
  kind: InvestorKind;
  /** One line of flavour, same voice as the C-level pitches. */
  pitch: string;
  rounds: readonly RoundType[];
  /** Relative odds of showing up among the investors eligible this week. */
  weight: number;
  /** × the round's base amount. Ignored when `flatAmount` is set. */
  amountMultiplier?: number;
  /** A fixed check regardless of valuation or climate (Grandma). */
  flatAmount?: number;
  /** × the round's base dilution. Ignored when `fixedDilution` is set. */
  dilutionMultiplier?: number;
  /**
   * A fixed stake regardless of round or climate (accelerators, family). These
   * are standard deals, not negotiated ones: they're never priced as a bridge,
   * so a short runway doesn't touch their cash either.
   */
  fixedDilution?: number;
  minValuation?: number;
  minHype?: number;
  /** Only shows up in these eras. Absent means every era. */
  eras?: readonly Era[];
  /** Only shows up when runway is under the bridge threshold. */
  onlyWhenBridge?: boolean;
  /** How long the offer stays on the table, in weeks (inclusive range). */
  expiryWeeks?: readonly [number, number];
  strings?: InvestorStrings;
}

const EARLY: readonly RoundType[] = ['seed'];
const LATE: readonly RoundType[] = ['seriesC', 'seriesD', 'seriesE', 'seriesF', 'seriesG'];
const ALL_ROUNDS: readonly RoundType[] = [
  'seed',
  'seriesA',
  'seriesB',
  'seriesC',
  'seriesD',
  'seriesE',
  'seriesF',
  'seriesG',
];

export { INVESTOR_FLAGS };

export const INVESTORS: readonly Investor[] = [
  // ── Seed: the people who believe in you, and the people who believe in returns
  {
    id: 'grandma',
    name: "Grandma's Savings Jar",
    kind: 'family',
    pitch: "She's been saving since 1971. She doesn't know what an app is, and she doesn't care.",
    rounds: EARLY,
    weight: 3,
    flatAmount: 40_000,
    fixedDilution: 0,
    expiryWeeks: [4, 6],
    strings: { label: 'No equity · +morale', morale: 3 },
  },
  {
    id: 'uncle-marty',
    name: 'Uncle Marty',
    kind: 'family',
    pitch: 'Made his money in carpet. Has some ideas about your product.',
    rounds: EARLY,
    weight: 2,
    amountMultiplier: 0.45,
    fixedDilution: 0.05,
    expiryWeeks: [3, 5],
    strings: { label: 'Will have opinions', flag: INVESTOR_FLAGS.uncleMarty },
  },
  {
    id: 'kickstartr',
    name: 'Kickstartr campaign',
    kind: 'crowd',
    pitch: '2,000 backers, one promise: it ships by Christmas.',
    rounds: EARLY,
    weight: 2,
    amountMultiplier: 0.6,
    fixedDilution: 0,
    minHype: 1.1,
    expiryWeeks: [2, 3],
    strings: { label: 'No equity · +hype', hype: 0.05 },
  },
  {
    id: 'naval',
    name: 'Naval Ravikantt',
    kind: 'angel',
    pitch: 'Tweets in aphorisms. Invests in founders, not decks.',
    rounds: EARLY,
    weight: 2,
    amountMultiplier: 0.5,
    dilutionMultiplier: 0.55,
    strings: { label: 'Small hype bump', hype: 0.02 },
  },
  {
    id: 'ycombinatorr',
    name: 'Y Combinatorr',
    kind: 'accelerator',
    pitch: "Three months, one demo day, and 'YC W27' in your bio forever.",
    rounds: EARLY,
    weight: 2,
    amountMultiplier: 0.6,
    fixedDilution: 0.07,
    strings: { label: 'Demo day hype', hype: 0.05 },
  },
  {
    id: 'techstarz',
    name: 'Techstarz',
    kind: 'accelerator',
    pitch: 'Mentors. So many mentors.',
    rounds: EARLY,
    weight: 2,
    amountMultiplier: 0.4,
    fixedDilution: 0.06,
  },
  {
    id: 'first-round',
    name: 'First Round Capitol',
    kind: 'vc',
    pitch: "Writes the first check. Wants your cell number.",
    rounds: EARLY,
    weight: 3,
    amountMultiplier: 1,
    dilutionMultiplier: 1,
  },
  {
    id: 'a16zz',
    name: 'Andreessen Horrowitz',
    kind: 'tier1',
    pitch: 'Will publish a 4,000-word essay about your category the day the wire lands.',
    rounds: ['seed', 'seriesA', 'seriesB'],
    weight: 1,
    amountMultiplier: 1.8,
    dilutionMultiplier: 1.35,
    strings: { label: 'Big hype · board seat', hype: 0.1, morale: -2 },
  },

  // ── Series A / B: institutional money
  {
    id: 'sequoya',
    name: 'Sequoya Capital',
    kind: 'tier1',
    pitch: "They've backed every company you've heard of. They will mention this.",
    rounds: ['seriesA', 'seriesB', 'seriesC'],
    weight: 1,
    amountMultiplier: 1.4,
    dilutionMultiplier: 1,
    minValuation: 50_000,
    strings: { label: 'Brand-name hype', hype: 0.06 },
  },
  {
    id: 'benchmarc',
    name: 'Benchmarc',
    kind: 'vc',
    pitch: 'Five partners, no associates, no nonsense.',
    rounds: ['seriesA', 'seriesB'],
    weight: 2,
    amountMultiplier: 1,
    dilutionMultiplier: 0.8,
  },
  {
    id: 'accell',
    name: 'Accell',
    kind: 'vc',
    pitch: 'Solid, quiet, lives in spreadsheets.',
    rounds: ['seriesA', 'seriesB'],
    weight: 3,
    amountMultiplier: 1,
    dilutionMultiplier: 1,
  },
  {
    id: 'lightspeedd',
    name: 'Lightspeedd',
    kind: 'vc',
    pitch: 'Moves fast. Expects you to move faster.',
    rounds: ['seriesA', 'seriesB', 'seriesC'],
    weight: 3,
    amountMultiplier: 1.1,
    dilutionMultiplier: 1.05,
  },
  {
    id: 'index-venturez',
    name: 'Index Venturez',
    kind: 'vc',
    pitch: 'Half the partners are in London. The other half are on a plane.',
    rounds: ['seriesA', 'seriesB'],
    weight: 3,
    amountMultiplier: 0.95,
    dilutionMultiplier: 0.95,
  },
  {
    id: 'foogle-ventures',
    name: 'Foogle Ventures',
    kind: 'corporate',
    pitch: "Foogle's venture arm. Very interested in your roadmap. Very.",
    rounds: ['seriesA', 'seriesB', 'seriesC'],
    weight: 1,
    amountMultiplier: 1,
    dilutionMultiplier: 0.8,
    strings: { label: 'Foogle is watching', flag: INVESTOR_FLAGS.foogle },
  },
  {
    id: 'tiger-globall',
    name: 'Tiger Globall',
    kind: 'megafund',
    pitch: 'Diligence is one Zoom call. The wire lands Friday.',
    rounds: ['seriesA', 'seriesB', 'seriesC', 'seriesD'],
    weight: 2,
    amountMultiplier: 1.6,
    dilutionMultiplier: 1.3,
    eras: ['scrappy', 'boom'],
    expiryWeeks: [1, 1],
    strings: { label: 'Fast money · 1 week' },
  },
  {
    id: 'founders-fundd',
    name: 'Founders Fundd',
    kind: 'tier1',
    pitch: 'They wanted flying cars. They will settle for you.',
    rounds: ['seriesB', 'seriesC', 'seriesD'],
    weight: 1,
    amountMultiplier: 1,
    dilutionMultiplier: 0.85,
    minHype: 1.2,
    strings: { label: 'Founder-friendly' },
  },
  {
    id: 'thrive-capitol',
    name: 'Thrive Capitol',
    kind: 'vc',
    pitch: 'Concentrated bets, long holds, nice sweaters.',
    rounds: ['seriesB', 'seriesC', 'seriesD', 'seriesE'],
    weight: 2,
    amountMultiplier: 1.2,
    dilutionMultiplier: 1,
  },
  {
    id: 'softbanc',
    name: 'SoftBanc Vision Fund',
    kind: 'megafund',
    pitch: 'Wants you to be the biggest company in the world by Tuesday.',
    rounds: ['seriesB', 'seriesC', 'seriesD', 'seriesE'],
    weight: 2,
    amountMultiplier: 2.5,
    dilutionMultiplier: 1.6,
    eras: ['boom'],
    strings: { label: 'Huge check · blitzscale or else', hype: 0.12, morale: -5, flag: INVESTOR_FLAGS.softbanc },
  },

  // ── Series C–G: late-stage and crossover money
  {
    id: 'general-atlantik',
    name: 'General Atlantik',
    kind: 'vc',
    pitch: 'Growth equity. Asks about your EBITDA in the first meeting.',
    rounds: LATE,
    weight: 3,
    amountMultiplier: 1.1,
    dilutionMultiplier: 0.95,
  },
  {
    id: 'insight-partnerz',
    name: 'Insight Partnerz',
    kind: 'vc',
    pitch: 'Sends a 90-slide operating playbook before the term sheet.',
    rounds: ['seriesC', 'seriesD', 'seriesE'],
    weight: 3,
    amountMultiplier: 1,
    dilutionMultiplier: 1,
  },
  {
    id: 'koatue',
    name: 'Koatue',
    kind: 'megafund',
    pitch: 'Half hedge fund, half VC, all dashboards.',
    rounds: ['seriesD', 'seriesE', 'seriesF', 'seriesG'],
    weight: 2,
    amountMultiplier: 1.3,
    dilutionMultiplier: 1.1,
  },
  {
    id: 'fidellity',
    name: 'Fidellity',
    kind: 'tier1',
    pitch: 'Crossover money. They plan to buy your stock again at the IPO.',
    rounds: ['seriesE', 'seriesF', 'seriesG'],
    weight: 2,
    amountMultiplier: 1,
    dilutionMultiplier: 0.85,
    strings: { label: 'Pre-IPO credibility', hype: 0.05 },
  },
  {
    id: 'blackrokk',
    name: 'BlackRokk',
    kind: 'tier1',
    pitch: 'Manages more money than most countries. You are a rounding error. A nice one.',
    rounds: ['seriesF', 'seriesG'],
    weight: 2,
    amountMultiplier: 1.2,
    dilutionMultiplier: 0.9,
  },

  // ── Any round, when you're nearly out of road
  {
    id: 'vulture-partners',
    name: 'Vulture Partners LLC',
    kind: 'vulture',
    pitch: 'They heard you might need money. They always hear.',
    rounds: ALL_ROUNDS,
    weight: 6,
    amountMultiplier: 0.8,
    dilutionMultiplier: 1.25,
    onlyWhenBridge: true,
    expiryWeeks: [1, 2],
    strings: { label: 'Predatory terms', morale: -3 },
  },
];

const INVESTOR_BY_ID: ReadonlyMap<string, Investor> = new Map(INVESTORS.map((i) => [i.id, i]));

export function investorById(id: string): Investor | undefined {
  return INVESTOR_BY_ID.get(id);
}

// ── Dealing ──────────────────────────────────────────────────────────────
/** Offers dealt when a round's table is empty — so it's never empty for long. */
export const OPENING_OFFER_COUNT = 2;
/** No more than this many term sheets on the table at once. */
export const MAX_OPEN_OFFERS = 3;
/** Weekly chance one more investor shows up, by era: Boom money is everywhere, Reckoning money hides. */
export const OFFER_ARRIVAL_CHANCE: Record<Era, number> = {
  scrappy: 0.35,
  boom: 0.55,
  reckoning: 0.2,
};
/** Default weeks an offer stays on the table (inclusive range) unless the investor says otherwise. */
export const DEFAULT_OFFER_EXPIRY_WEEKS: readonly [number, number] = [2, 4];
/** Each offer's numbers wobble by up to this much either way, so two Accell offers aren't identical. */
export const OFFER_TERMS_JITTER = 0.1;
/** Kinds that count as "people who know you" for the Seed opening guarantee. */
const GRASSROOTS_KINDS: readonly InvestorKind[] = ['family', 'crowd', 'angel'];

/** A 32-bit seed for this week's dealing, independent of `GameState.rng`. */
function offerSeedFor(state: GameState): number {
  return (
    (state.createdWithSeed | 0) ^
    Math.imul(state.week + 1, 0x9e3779b1) ^
    Math.imul(state.roundsRaised + 1, 0x85ebca6b) ^
    0x5bd1e995
  );
}

interface DealContext {
  round: RoundType;
  era: Era;
  valuation: number;
  hype: number;
  runway: number;
  isBridge: boolean;
}

function eligible(investor: Investor, ctx: DealContext): boolean {
  if (!investor.rounds.includes(ctx.round)) return false;
  if (investor.eras && !investor.eras.includes(ctx.era)) return false;
  if (investor.minValuation !== undefined && ctx.valuation < investor.minValuation) return false;
  if (investor.minHype !== undefined && ctx.hype < investor.minHype) return false;
  if (investor.onlyWhenBridge && !ctx.isBridge) return false;
  return true;
}

/** Weighted pick; tier-1 funds come calling more often when hype is high. */
function pickInvestor(pool: Investor[], ctx: DealContext, rng: RngState): [Investor | null, RngState] {
  if (pool.length === 0) return [null, rng];
  const weights = pool.map((i) => (i.kind === 'tier1' ? i.weight * Math.min(2, Math.max(0.5, ctx.hype)) : i.weight));
  const total = weights.reduce((a, b) => a + b, 0);
  const [roll, next] = nextFloat(rng);
  let cursor = roll * total;
  for (let i = 0; i < pool.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) return [pool[i], next];
  }
  return [pool[pool.length - 1], next];
}

/** Rounds money to something a term sheet would print: nearest $5k. */
function roundAmount(amount: number): number {
  return Math.max(5_000, Math.round(amount / 5_000) * 5_000);
}

/** Rounds dilution to the nearest half percent. */
function roundDilution(dilution: number): number {
  return Math.round(dilution * 200) / 200;
}

/** Standard-deal investors (fixed stake or a flat check) whose terms ignore runway. */
function hasStandardTerms(investor: Investor): boolean {
  return investor.fixedDilution !== undefined || investor.flatAmount !== undefined;
}

function termsFor(investor: Investor, ctx: DealContext, rng: RngState): [{ amount: number; dilution: number }, RngState] {
  const runway = hasStandardTerms(investor) ? Number.POSITIVE_INFINITY : ctx.runway;
  const base = roundTermsFor(ctx.round, ctx.valuation, ctx.hype, runway, ctx.era);
  const [amountJitter, r1] = nextRange(rng, 1 - OFFER_TERMS_JITTER, 1 + OFFER_TERMS_JITTER);
  const [dilutionJitter, r2] = nextRange(r1, 1 - OFFER_TERMS_JITTER, 1 + OFFER_TERMS_JITTER);
  const amount =
    investor.flatAmount !== undefined
      ? investor.flatAmount
      : base.amount * (investor.amountMultiplier ?? 1) * amountJitter;
  const dilution =
    investor.fixedDilution !== undefined
      ? investor.fixedDilution
      : Math.min(MAX_DILUTION_PER_ROUND, base.dilution * (investor.dilutionMultiplier ?? 1) * dilutionJitter);
  return [{ amount: roundAmount(amount), dilution: roundDilution(dilution) }, r2];
}

function dealOne(
  investor: Investor,
  ctx: DealContext,
  week: number,
  rng: RngState,
): [FundingOffer, RngState] {
  const [terms, r1] = termsFor(investor, ctx, rng);
  const [minWeeks, maxWeeks] = investor.expiryWeeks ?? DEFAULT_OFFER_EXPIRY_WEEKS;
  const [expiresIn, r2] = nextInt(r1, minWeeks, maxWeeks);
  return [
    {
      id: `${investor.id}-${ctx.round}-w${week}`,
      investorId: investor.id,
      round: ctx.round,
      amount: terms.amount,
      dilution: terms.dilution,
      isBridge: ctx.isBridge && !hasStandardTerms(investor),
      arrivedWeek: week,
      expiresWeek: week + expiresIn,
    },
    r2,
  ];
}

/**
 * The term sheets on the table this week. Called at the end of every tick,
 * on a new game, and on hydrate for saves from before offers existed.
 *
 * - No round left, or the round is still cooling down: an empty table.
 * - Expired offers fall off.
 * - Late rounds need traction (`roundOpenAt`): below the bar nothing new is
 *   dealt, though offers already signed onto the table stay until they expire.
 * - An empty table deals `OPENING_OFFER_COUNT` at once, so a player waiting
 *   on money is never stuck waiting on luck. For Seed, one of them is always
 *   from family, a crowd or an angel, so the zero-equity option is visible.
 * - Otherwise one more may arrive (`OFFER_ARRIVAL_CHANCE`), up to `MAX_OPEN_OFFERS`.
 * - With runway under the bridge threshold, every new offer is priced as a
 *   bridge and Vulture Partners joins the pool.
 */
export function dealFundingOffers(state: GameState): FundingOffer[] {
  const round = nextRound(state.roundsRaised);
  if (state.gameOver || !round || !canRaiseRound(state.week, state.lastRoundRaisedWeek)) return [];

  const live = (state.fundingOffers ?? []).filter((o) => o.round === round && o.expiresWeek >= state.week);
  const { valuation, runway } = weeklyStatsFor(state);
  if (!roundOpenAt(round, valuation)) return live;

  const ctx: DealContext = {
    round,
    era: state.era,
    valuation,
    hype: state.hype,
    runway,
    isBridge: roundTermsFor(round, valuation, state.hype, runway, state.era).isBridge,
  };

  let rng = createRng(offerSeedFor(state));
  let toDeal = 0;
  if (live.length === 0) {
    toDeal = OPENING_OFFER_COUNT;
  } else if (live.length < MAX_OPEN_OFFERS) {
    const [roll, next] = nextFloat(rng);
    rng = next;
    if (roll < OFFER_ARRIVAL_CHANCE[state.era]) toDeal = 1;
  }

  const offers = [...live];
  for (let i = 0; i < toDeal; i++) {
    const onTable = new Set(offers.map((o) => o.investorId));
    let pool = INVESTORS.filter((inv) => !onTable.has(inv.id) && eligible(inv, ctx));
    // Seed's opening hand always shows the "people who know you" option.
    if (live.length === 0 && i === 0 && round === 'seed') {
      const grassroots = pool.filter((inv) => GRASSROOTS_KINDS.includes(inv.kind));
      if (grassroots.length > 0) pool = grassroots;
    }
    const [investor, afterPick] = pickInvestor(pool, ctx, rng);
    rng = afterPick;
    if (!investor) break;
    const [offer, afterDeal] = dealOne(investor, ctx, state.week, rng);
    rng = afterDeal;
    offers.push(offer);
  }
  return offers;
}

/** The offers on the table, oldest first. Undefined (an old save) reads as none. */
export function fundingOffersOf(state: GameState): FundingOffer[] {
  return state.fundingOffers ?? [];
}

/**
 * The dilution actually paid if this offer is taken now: the locked terms,
 * less the CFO's round-terms perk and the Morning Standup's one-time clean
 * terms. A 0% offer stays 0%, and doesn't spend the clean-terms reward.
 */
export function acceptedDilutionFor(state: GameState, offer: FundingOffer): number {
  if (offer.dilution <= 0) return 0;
  const cfo = cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-roundTerms');
  const clean = state.storyFlags.includes(CLEAN_RAISE_TERMS_FLAG) ? CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER : 1;
  return Math.min(MAX_DILUTION_PER_ROUND, offer.dilution * cfo * clean);
}

/** Weeks left to sign: 0 means this is the last week. */
export function weeksToExpiry(state: GameState, offer: FundingOffer): number {
  return Math.max(0, offer.expiresWeek - state.week);
}
