/**
 * Which RevenueCat offering a weeks paywall presents, and the price teaser the
 * cliffhanger button shows for it. Pure (no SDK import) so vitest can cover
 * the fallback rules; `revenuecat.ts` feeds it the live `getOfferings()` result.
 */

/** The weeks offering every paywall has always used. */
export const WEEKS_OFFERING_KEY = 'weeks';
/**
 * An optional offering for the cliffhanger moment ("Find out now"), so it can
 * carry its own paywall and packages. Absent in RevenueCat, everything behaves
 * exactly as before.
 */
export const CLIFFHANGER_OFFERING_KEY = 'weeks_cliffhanger';

/** The trigger that prefers `CLIFFHANGER_OFFERING_KEY`. Matches `BuyWeeksTrigger`'s `'cliffhanger'`. */
const CLIFFHANGER_TRIGGER = 'cliffhanger';

/** The slice of RevenueCat's `PurchasesOfferings` this needs. */
export interface OfferingsLike<T> {
  all: Record<string, T | undefined>;
  current: T | null;
}

/**
 * `weeks_cliffhanger` for the cliffhanger trigger when it exists; otherwise —
 * and for every other trigger — today's lookup: the `weeks` offering, then
 * the current one.
 */
export function selectWeeksOffering<T>(offerings: OfferingsLike<T>, trigger?: string): T | null {
  if (trigger === CLIFFHANGER_TRIGGER) {
    const cliffhanger = offerings.all[CLIFFHANGER_OFFERING_KEY];
    if (cliffhanger) return cliffhanger;
  }
  return offerings.all[WEEKS_OFFERING_KEY] ?? offerings.current ?? null;
}

/** What the cliffhanger button quotes: the smallest pack's weeks and its store price. */
export interface PriceTeaser {
  weeks: number;
  priceLabel: string;
}

/**
 * The cheapest entry point among live packages, or null when none is
 * recognisable. Only ever fed live store data — never the hardcoded fallback
 * catalog, whose USD prices would be wrong for most of the world.
 */
export function cheapestPriceTeaser(packs: readonly { weeks: number | undefined; priceLabel: string }[]): PriceTeaser | null {
  let best: PriceTeaser | null = null;
  for (const pack of packs) {
    if (pack.weeks === undefined || !pack.priceLabel) continue;
    if (best === null || pack.weeks < best.weeks) best = { weeks: pack.weeks, priceLabel: pack.priceLabel };
  }
  return best;
}
