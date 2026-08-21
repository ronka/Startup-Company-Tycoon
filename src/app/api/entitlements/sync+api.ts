/**
 * Sync model: the client pushes cumulative totals, never deltas.
 * Transactions insert idempotently (`ON CONFLICT DO NOTHING`, keyed on the
 * primary key); spend counters merge via `GREATEST`. That combination is
 * retry-safe and offline-tolerant without a dedup table — see the plan's
 * "Sync model" section for why.
 *
 * The client is not trusted to price its own purchases: `weeks`/`revives`
 * are recomputed here from `productId` using the exact same mapping the
 * native purchase flow uses (`weeksForProduct` / `isReviveProduct`), and any
 * transaction whose product id isn't ours is dropped rather than trusted.
 */
import { weeksForProduct, isReviveProduct } from '@/purchases/product-weeks';

import { getSql } from '@/server/entitlements-api/db';
import { loadEntitlements } from '@/server/entitlements-api/entitlements';
import { requireSession, UnauthorizedError } from '@/server/entitlements-api/session';

interface SyncTransaction {
  transactionId: string;
  productId: string;
}

interface SyncRequestBody {
  transactions?: SyncTransaction[];
  weeksSpent?: number;
  revivesSpent?: number;
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function POST(request: Request) {
  let accountId: string;
  try {
    accountId = await requireSession(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) return new Response(null, { status: 401 });
    throw err;
  }

  let body: SyncRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const incoming = Array.isArray(body.transactions) ? body.transactions : [];
  const weeksSpent = nonNegativeInt(body.weeksSpent);
  const revivesSpent = nonNegativeInt(body.revivesSpent);

  const priced = incoming
    .filter((tx): tx is SyncTransaction => typeof tx?.transactionId === 'string' && typeof tx?.productId === 'string')
    .map((tx) => ({
      transactionId: tx.transactionId,
      productId: tx.productId,
      weeks: weeksForProduct(tx.productId) ?? 0,
      revives: isReviveProduct(tx.productId) ? 1 : 0,
    }))
    .filter((tx) => tx.weeks > 0 || tx.revives > 0);

  const sql = getSql();
  const insertQueries = priced.map(
    (tx) => sql`
      insert into purchase_transactions (account_id, transaction_id, product_id, weeks, revives)
      values (${accountId}, ${tx.transactionId}, ${tx.productId}, ${tx.weeks}, ${tx.revives})
      on conflict (account_id, transaction_id) do nothing
    `,
  );
  const updateQuery = sql`
    update accounts
    set weeks_spent = greatest(weeks_spent, ${weeksSpent}),
        revives_spent = greatest(revives_spent, ${revivesSpent}),
        updated_at = now()
    where id = ${accountId}
  `;
  await sql.transaction([...insertQueries, updateQuery]);

  const entitlements = await loadEntitlements(accountId);
  return Response.json(entitlements);
}
