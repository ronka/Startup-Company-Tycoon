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
 * How the RevenueCat-hosted paywall closed. Deliberately *not* a
 * `PurchaseResult`: `presentPaywall()` reports only how the screen ended and
 * never hands back a transaction, so the caller can't credit anything from
 * this alone — it must re-run the same `getCustomerInfo()` reconciliation the
 * launch pass uses (see `reconcileOnLaunch`). That's a feature, not a
 * workaround: it keeps a single crediting path with a single ledger.
 *
 * `not_presented` is the case that matters for the UI. It means the paywall
 * never appeared at all — offerings failed to load, or the offering has no
 * paywall attached — and the caller is expected to fall back to the in-app
 * `BuyWeeksSheet` rather than leave the player staring at a dead button.
 */
export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'not_presented' | 'error';

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

/**
 * What a player-initiated restore actually gave back, summarised for the UI.
 * `nothing` is a success, not a failure — consumables usually leave nothing to
 * recover (see `revenuecat.ts`'s `restorePurchases`), and telling a player
 * their restore "failed" when the store answered fine is both wrong and the
 * kind of thing that reads as a broken purchase flow in App Review.
 */
export type RestoreOutcome =
  | { status: 'restored'; weeks: number; revives: number }
  | { status: 'nothing' }
  | { status: 'error' };

export interface PurchasesClient {
  getPacks(): Promise<WeekPack[]>;
  purchasePack(packId: string): Promise<PurchaseResult>;
  /** Buy a single bankruptcy bailout (revive). One consumable product, one price. */
  purchaseRevive(): Promise<PurchaseResult>;
  /** Localized store price for the revive product, or null if it can't be loaded. */
  getRevivePrice(): Promise<string | null>;
}
