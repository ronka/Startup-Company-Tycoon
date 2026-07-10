/**
 * Client-agnostic shape for buying week packs. Task 2 ships `stub.ts` behind
 * this interface (hardcoded packs, instant success); Task 5 swaps in a
 * RevenueCat-backed implementation without touching call sites — the sheet
 * and `game-store.tsx` only ever depend on this file's types.
 */

export interface WeekPack {
  /** Store product id. */
  id: string;
  weeks: number;
  /** Localized, store-formatted price (e.g. "$1.99"). */
  priceLabel: string;
}

/** Why a purchase didn't complete. `cancelled` is not an error state in the UI. */
export type PurchaseErrorCode = 'cancelled' | 'unknown';

/**
 * What a completed purchase grants. Weeks top up the purchased-weeks pool
 * (`week-budget.ts`); a revive grants one bankruptcy-bailout token
 * (`revive.ts`). Both are consumable and delivered idempotently per
 * transaction ID.
 */
export type Reward = { kind: 'weeks'; weeks: number } | { kind: 'revive' };

export type PurchaseResult =
  | {
      status: 'success';
      reward: Reward;
      /**
       * A stable identifier for this purchase — a real store transaction ID
       * on the RC-backed client, a synthetic one on the stub. Lets the
       * caller credit the matching pool idempotently per transaction (the
       * crash-safety ledger), whether weeks or a revive token.
       */
      transactionId: string;
    }
  | { status: 'error'; code: PurchaseErrorCode };

export interface PurchasesClient {
  getPacks(): Promise<WeekPack[]>;
  purchasePack(packId: string): Promise<PurchaseResult>;
  /** Buy a single bankruptcy bailout (revive). One consumable product, one price. */
  purchaseRevive(): Promise<PurchaseResult>;
  /** Localized store price for the revive product, or null if it can't be loaded. */
  getRevivePrice(): Promise<string | null>;
}
