/**
 * How much a decision card puts on the line, read from its choices' effects
 * without saying which choice does what. Used by the week wall's stakes line
 * ("Cash, quality, and morale are on the line.") and by the chapter capstone
 * picker's "highest-stake card" rule. Pure data in, pure data out.
 */

import { EventCard, EventStat } from './types';

/**
 * One "unit of stake" per stat, so cards that move different stats can be
 * compared at all: $10K of cash, 5 points of morale, 0.05 of hype, 10 points
 * of quality, and one point (0.01) of market share each weigh 1.
 *
 * Tuned against the real decks so the stats a player would call "the big one"
 * win: Pricing Pressure is about share first and cash second, the Talent
 * Poaching War is about cash, and First Big Customer is about share and morale.
 */
export const STAKE_UNIT: Record<EventStat, number> = {
  cash: 10_000,
  morale: 5,
  hype: 0.05,
  productQuality: 10,
  marketShare: 0.01,
};

/** A timed multiplier's weight per week it runs, per 1.0 of multiplier swing. */
const TIMED_EFFECT_WEIGHT = 5;

/** Stable order for ties, so the line never depends on object-key order. */
const STAT_ORDER: readonly EventStat[] = ['marketShare', 'cash', 'productQuality', 'morale', 'hype'];

/** The biggest weighted swing each stat sees across every choice (absolute, so it never reveals the direction). */
export function stakeWeights(card: EventCard): Map<EventStat, number> {
  const weights = new Map<EventStat, number>();
  const bump = (stat: EventStat, weight: number) => {
    if (weight > (weights.get(stat) ?? 0)) weights.set(stat, weight);
  };
  const bundles = [...(card.choices ?? []).map((choice) => choice.effects), ...(card.effects ? [card.effects] : [])];
  for (const effects of bundles) {
    for (const delta of effects.deltas ?? []) bump(delta.stat, Math.abs(delta.amount) / STAKE_UNIT[delta.stat]);
    const timed = effects.timedEffect;
    if (timed) bump(timed.stat, Math.abs(1 - timed.multiplier) * timed.weeksLeft * TIMED_EFFECT_WEIGHT);
  }
  return weights;
}

/** A single number for "how much is riding on this card": the sum of its stats' biggest swings. */
export function stakeScore(card: EventCard): number {
  let total = 0;
  for (const weight of stakeWeights(card).values()) total += weight;
  return total;
}

/** Used when a card moves nothing measurable — still reads as a real hook. */
export const FALLBACK_STAKES_LINE = 'Cash, morale, or market share are on the line.';

/** At most this many stats are named; more reads like a spreadsheet. */
const MAX_STATS = 3;

/** A market-share swing at least this big is named as "an N-point slice of the market". */
const SHARE_SLICE_MIN = 0.005;

function statNoun(stat: EventStat, listLength: number): string {
  switch (stat) {
    case 'cash':
      return 'cash';
    case 'morale':
      // "the team's morale" reads better in a short line; in a list of three it's just "morale".
      return listLength <= 2 ? "the team's morale" : 'morale';
    case 'hype':
      return 'your buzz';
    case 'productQuality':
      return 'quality';
    case 'marketShare':
      return 'market share';
  }
}

/** Largest absolute market-share swing on any choice, in percentage points. */
function largestShareSwing(card: EventCard): number {
  let max = 0;
  for (const choice of card.choices ?? []) {
    for (const delta of choice.effects.deltas ?? []) {
      if (delta.stat === 'marketShare') max = Math.max(max, Math.abs(delta.amount));
    }
  }
  return max;
}

function formatPoints(share: number): string {
  const points = Math.round(share * 1000) / 10;
  return Number.isInteger(points) ? `${points}` : points.toFixed(1);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One short line naming what's on the line, built from the biggest swings
 * across all choices — never which choice causes them, and never a number
 * tied to a specific button. A market-share lead is named as a slice
 * ("A 2-point slice of the market, and the team's morale, are on the line.")
 * because "market share" alone undersells it.
 */
export function stakesLineFor(card: EventCard): string {
  const weights = stakeWeights(card);
  const stats = STAT_ORDER.filter((stat) => (weights.get(stat) ?? 0) > 0)
    .sort((a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b))
    .slice(0, MAX_STATS);
  if (stats.length === 0) return FALLBACK_STAKES_LINE;

  const share = largestShareSwing(card);
  if (stats[0] === 'marketShare' && share >= SHARE_SLICE_MIN) {
    const slice = `A ${formatPoints(share)}-point slice of the market`;
    const rest = stats.slice(1).map((stat) => statNoun(stat, stats.length));
    if (rest.length === 0) return `${slice} is on the line.`;
    if (rest.length === 1) return `${slice}, and ${rest[0]}, are on the line.`;
    return `${slice}, ${rest[0]}, and ${rest[1]} are on the line.`;
  }

  const nouns = stats.map((stat) => statNoun(stat, stats.length));
  if (nouns.length === 1) return `${capitalize(nouns[0])} is on the line.`;
  if (nouns.length === 2) return `${capitalize(nouns[0])} and ${nouns[1]} are on the line.`;
  return `${capitalize(nouns[0])}, ${nouns[1]}, and ${nouns[2]} are on the line.`;
}
