/**
 * `granted` is derived from `purchase_transactions` (summed here), never
 * stored on `accounts` — so it can't drift from the ledger it's supposed to
 * summarize. `spent` is the one thing `accounts` does store, since it's a
 * `GREATEST`-merged counter rather than something derivable from a table of
 * individual transactions.
 */
import { getSql } from './db';

export interface ServerEntitlements {
  weeksGranted: number;
  weeksSpent: number;
  revivesGranted: number;
  revivesSpent: number;
  transactionIds: string[];
}

export async function loadEntitlements(accountId: string): Promise<ServerEntitlements> {
  const rows = await getSql()`
    select
      a.weeks_spent as weeks_spent,
      a.revives_spent as revives_spent,
      coalesce(sum(t.weeks), 0) as weeks_granted,
      coalesce(sum(t.revives), 0) as revives_granted,
      coalesce(array_agg(t.transaction_id) filter (where t.transaction_id is not null), array[]::text[]) as transaction_ids
    from accounts a
    left join purchase_transactions t on t.account_id = a.id
    where a.id = ${accountId}
    group by a.id
  `;
  const row = rows[0] as
    | {
        weeks_spent: number;
        revives_spent: number;
        weeks_granted: string | number;
        revives_granted: string | number;
        transaction_ids: string[];
      }
    | undefined;
  if (!row) {
    // Account row disappeared between `requireSession` resolving it and this
    // read (e.g. a concurrent `DELETE /api/account`) — treat as empty rather
    // than 500ing on a request that otherwise did nothing wrong.
    return { weeksGranted: 0, weeksSpent: 0, revivesGranted: 0, revivesSpent: 0, transactionIds: [] };
  }
  return {
    weeksGranted: Number(row.weeks_granted),
    weeksSpent: Number(row.weeks_spent),
    revivesGranted: Number(row.revives_granted),
    revivesSpent: Number(row.revives_spent),
    transactionIds: row.transaction_ids,
  };
}
