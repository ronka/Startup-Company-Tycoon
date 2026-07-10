import type { PurchasesClient, WeekPack } from './types';

/**
 * Hardcoded until Task 3's RevenueCat offering exists; Task 5 fetches these
 * live and falls back to this same shape if offerings fail to load.
 */
export const WEEK_PACKS: WeekPack[] = [
  { id: 'weeks20', weeks: 20, priceLabel: '$1.99' },
  { id: 'weeks60', weeks: 60, priceLabel: '$4.99' },
];

/** Fallback price for the revive product when the live RC offering can't be read (matches App Store Connect). */
export const REVIVE_PRICE_LABEL = '$2.99';

/** Dev/test stand-in: no store round-trip, every purchase "completes" instantly. */
export const stubPurchasesClient: PurchasesClient = {
  async getPacks() {
    return WEEK_PACKS;
  },
  async purchasePack(packId) {
    const pack = WEEK_PACKS.find((p) => p.id === packId);
    if (!pack) return { status: 'error', code: 'unknown' };
    return {
      status: 'success',
      reward: { kind: 'weeks', weeks: pack.weeks },
      transactionId: `stub-${packId}-${Date.now()}`,
    };
  },
  async purchaseRevive() {
    return { status: 'success', reward: { kind: 'revive' }, transactionId: `stub-revive-${Date.now()}` };
  },
  async getRevivePrice() {
    return REVIVE_PRICE_LABEL;
  },
};
