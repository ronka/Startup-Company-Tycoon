/**
 * Crash-safe, idempotent purchase delivery (Task 5): diffs a customer's
 * store transactions against the set of transaction IDs already credited
 * and reports what's still owed. Pure — no RC SDK, no AsyncStorage — so the
 * on-launch and post-purchase reconciliation passes in `revenuecat.ts` can
 * share this one code path and it's fully unit-testable on its own.
 *
 * Returns per-transaction weeks (not a single total) so the caller can fold
 * each one into `week-budget.ts`'s `creditTransaction`/`creditTransactions`
 * — the pool and its granted-tx ledger update together in one write, so a
 * transaction can never end up marked granted without its weeks landing too.
 */

export interface PurchaseTransaction {
  transactionIdentifier: string;
  productIdentifier: string;
}

export interface GrantedTransaction {
  transactionId: string;
  weeks: number;
}

export interface ReconciliationResult {
  newlyGranted: GrantedTransaction[];
}

export function reconcilePurchases(
  transactions: readonly PurchaseTransaction[],
  grantedTransactionIds: ReadonlySet<string>,
  weeksForProduct: (productIdentifier: string) => number | undefined,
): ReconciliationResult {
  const newlyGranted: GrantedTransaction[] = [];
  for (const tx of transactions) {
    if (grantedTransactionIds.has(tx.transactionIdentifier)) continue;
    const weeks = weeksForProduct(tx.productIdentifier);
    if (weeks === undefined) continue;
    newlyGranted.push({ transactionId: tx.transactionIdentifier, weeks });
  }
  return { newlyGranted };
}

export interface ReviveReconciliationResult {
  /** Transaction IDs of revive purchases not yet credited to the revive-token pool. */
  newlyGranted: string[];
}

/**
 * The revive counterpart to `reconcilePurchases`: a bailout grants one token
 * rather than a week count, so it only needs the transaction ID (no per-tx
 * payload). Same idempotency contract — skips anything already in the revive
 * ledger — and the revive pool keeps its own granted-tx ledger, distinct from
 * the weeks pool's, so the two never interfere (a transaction is for exactly
 * one product).
 */
export function reconcileRevivePurchases(
  transactions: readonly PurchaseTransaction[],
  grantedTransactionIds: ReadonlySet<string>,
  isReviveProduct: (productIdentifier: string) => boolean,
): ReviveReconciliationResult {
  const newlyGranted: string[] = [];
  for (const tx of transactions) {
    if (grantedTransactionIds.has(tx.transactionIdentifier)) continue;
    if (!isReviveProduct(tx.productIdentifier)) continue;
    newlyGranted.push(tx.transactionIdentifier);
  }
  return { newlyGranted };
}

/**
 * The combined result of one launch reconciliation pass over a customer's
 * store history: weeks owed (per-transaction) and revive tokens owed (by
 * transaction ID). `revenuecat.ts` fetches `customerInfo` once and fans it
 * out into both buckets so the store can fold each into its own pool.
 */
export interface LaunchReconciliation {
  newlyGrantedWeeks: GrantedTransaction[];
  newlyGrantedRevives: string[];
}

/**
 * The result of an explicit, player-initiated "Restore Purchases" pass — the
 * control App Review looks for on any screen that sells something (Guideline
 * 3.1.1). Same reconciliation the launch pass runs, but the outcome has to
 * distinguish a store round-trip that *failed* from one that succeeded owing
 * nothing: the UI says very different things ("couldn't reach the App Store,
 * try again" vs "nothing to restore"), and an empty `LaunchReconciliation`
 * alone can't tell those apart.
 */
export type RestoreResult =
  | { status: 'ok'; reconciliation: LaunchReconciliation }
  | { status: 'error' };
