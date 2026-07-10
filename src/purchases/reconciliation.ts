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
