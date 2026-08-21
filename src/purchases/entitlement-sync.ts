/**
 * Pure sync logic for the Neon-backed entitlement ledger (the Sign in with
 * Apple purchase-recovery feature). Mirrors how `reconciliation.ts` is
 * structured and tested: pure, no SDK, no AsyncStorage, no fetch, so the
 * account module can drive it and it's independently unit-testable.
 *
 * Sync model: the client pushes cumulative totals, never deltas. See the
 * plan's "Sync model" section for the full rationale — in short, this is
 * what makes syncing idempotent, retry-safe and offline-tolerant without a
 * dedup table.
 */
import { isReviveProduct, weeksForProduct } from './product-weeks';
import type { PurchaseTransaction } from './reconciliation';

import type { PurchasedWeeksPool } from '@/state/week-budget';
import type { RevivePool } from '@/state/revive';

export interface ServerEntitlements {
  weeksGranted: number;
  weeksSpent: number;
  revivesGranted: number;
  revivesSpent: number;
  /**
   * Every transaction id the server knows about for this account — weeks
   * and revive purchases mixed together, not split by kind. That's fine:
   * `mergeEntitlements` unions this into *both* local ledgers, and the
   * per-kind filter (`weeksForProduct` / `isReviveProduct`) that actually
   * gates crediting during reconciliation makes an id sitting in the wrong
   * pool's ledger a harmless no-op rather than a bug.
   */
  transactionIds: string[];
}

export interface SyncPayload {
  transactions: { transactionId: string; productId: string; weeks: number; revives: number }[];
  weeksSpent: number;
  revivesSpent: number;
}

/**
 * What this device pushes: cumulative totals, never deltas. `storeTransactions`
 * comes from `Purchases.getCustomerInfo().nonSubscriptionTransactions` (RC
 * keeps that history server-side per customer) rather than the local granted
 * ledger, because the local ledger stores only transaction *ids* — no
 * product, no week count — so it can't price itself. `weeks`/`revives` here
 * are computed for completeness; the server never trusts them and recomputes
 * from `productId` itself.
 */
export function buildSyncPayload(
  purchased: PurchasedWeeksPool,
  revives: RevivePool,
  storeTransactions: readonly PurchaseTransaction[],
): SyncPayload {
  return {
    transactions: storeTransactions.map((tx) => ({
      transactionId: tx.transactionIdentifier,
      productId: tx.productIdentifier,
      weeks: weeksForProduct(tx.productIdentifier) ?? 0,
      revives: isReviveProduct(tx.productIdentifier) ? 1 : 0,
    })),
    weeksSpent: purchased.weeksSpent ?? 0,
    revivesSpent: revives.tokensSpent ?? 0,
  };
}

/**
 * Server response -> the two local pools.
 *
 * - `remaining = max(0, granted − spent)`, from the server's counters.
 * - `weeksSpent` / `tokensSpent` <- the server's (already `GREATEST`-merged)
 *   counters directly, not merged again locally.
 * - `grantedTransactionIds` <- the *union* of local and server, never a
 *   replace. Seeding from the server is what stops double-granting on a
 *   fresh device — the next `reconcileOnLaunch` skips transactions the
 *   server already knows. But replacing would drop a transaction this
 *   device credited locally and hasn't managed to push yet (offline,
 *   timeout, app killed mid-sync); `reconcileOnLaunch` would then stop
 *   seeing it as granted and credit it a second time. That partly
 *   self-heals on the next pull, but if the player spends the phantom
 *   weeks first, their cumulative `weeksSpent` inflates and they
 *   permanently lose real weeks. Union, always.
 * - `firstLink: true` -> take `max(serverRemaining, localRemaining)`. A
 *   device linking for the first time must never *lose* balance to a
 *   server that hasn't heard of one of its transactions. On an
 *   already-linked device the server value is taken plainly, so a spend on
 *   another device actually lands.
 */
export function mergeEntitlements(
  purchased: PurchasedWeeksPool,
  revives: RevivePool,
  server: ServerEntitlements,
  opts: { firstLink: boolean },
): { purchased: PurchasedWeeksPool; revives: RevivePool } {
  const serverWeeksRemaining = Math.max(0, server.weeksGranted - server.weeksSpent);
  const serverRevivesRemaining = Math.max(0, server.revivesGranted - server.revivesSpent);

  const weeksRemaining = opts.firstLink
    ? Math.max(serverWeeksRemaining, purchased.weeksRemaining)
    : serverWeeksRemaining;
  const tokensRemaining = opts.firstLink
    ? Math.max(serverRevivesRemaining, revives.tokensRemaining)
    : serverRevivesRemaining;

  const mergedTransactionIds = [...new Set([...purchased.grantedTransactionIds, ...server.transactionIds])];
  const mergedReviveTransactionIds = [...new Set([...revives.grantedTransactionIds, ...server.transactionIds])];

  return {
    purchased: {
      weeksRemaining,
      weeksSpent: server.weeksSpent,
      grantedTransactionIds: mergedTransactionIds,
    },
    revives: {
      tokensRemaining,
      tokensSpent: server.revivesSpent,
      grantedTransactionIds: mergedReviveTransactionIds,
    },
  };
}
