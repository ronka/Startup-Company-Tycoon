/**
 * The bankruptcy-bailout (revive) token pool. A purchased revive is delivered
 * in two decoupled steps for crash-safety: buying credits a durable *token*
 * here (idempotent per RevenueCat transaction, reconciled on launch), and the
 * game-over screen later *consumes* a token to dispatch the actual `REVIVE`
 * engine action. If the app dies between payment and redemption, the token
 * survives and the next launch's reconciliation re-credits it — so a paid
 * revive is never lost and never double-granted.
 *
 * This mirrors `PurchasedWeeksPool` in `week-budget.ts`: `grantedTransactionIds`
 * lives on the same object as `tokensRemaining`, so the credit and the ledger
 * update always persist in one write.
 */
export interface RevivePool {
  tokensRemaining: number;
  grantedTransactionIds: string[];
}

/** The pool before any revive has been bought. */
export function initialRevivePool(): RevivePool {
  return { tokensRemaining: 0, grantedTransactionIds: [] };
}

/** Grant one token with no transaction ledger (dev grant / debug menu). */
export function grantReviveToken(pool: RevivePool): RevivePool {
  return { ...pool, tokensRemaining: pool.tokensRemaining + 1 };
}

/**
 * Credit one revive token for a specific RevenueCat transaction and mark it
 * granted, in one update. Idempotent: a transaction already in the ledger is a
 * no-op, so an overlapping purchase-completion and launch-reconcile never
 * double-grant.
 */
export function creditReviveTransaction(pool: RevivePool, transactionId: string): RevivePool {
  if (pool.grantedTransactionIds.includes(transactionId)) return pool;
  return {
    tokensRemaining: pool.tokensRemaining + 1,
    grantedTransactionIds: [...pool.grantedTransactionIds, transactionId],
  };
}

/** Credit a batch of revive transactions in one pass (e.g. launch reconciliation). */
export function creditReviveTransactions(pool: RevivePool, transactionIds: readonly string[]): RevivePool {
  return transactionIds.reduce((acc, id) => creditReviveTransaction(acc, id), pool);
}

/** True when there's at least one token to redeem. */
export function canRedeemRevive(pool: RevivePool): boolean {
  return pool.tokensRemaining > 0;
}

/** Consume one token (redeemed into a `REVIVE` dispatch). Never goes below 0. */
export function consumeReviveToken(pool: RevivePool): RevivePool {
  return { ...pool, tokensRemaining: Math.max(0, pool.tokensRemaining - 1) };
}
