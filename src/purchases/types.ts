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

export type PurchaseResult =
  | {
      status: 'success';
      weeksGranted: number;
      /**
       * A stable identifier for this purchase — a real store transaction ID
       * on the RC-backed client, a synthetic one on the stub. Lets the
       * caller credit the pool via `week-budget.ts`'s `creditTransaction`,
       * which is idempotent per transaction (Task 5 crash-safety).
       */
      transactionId: string;
    }
  | { status: 'error'; code: PurchaseErrorCode };

export interface PurchasesClient {
  getPacks(): Promise<WeekPack[]>;
  purchasePack(packId: string): Promise<PurchaseResult>;
}
