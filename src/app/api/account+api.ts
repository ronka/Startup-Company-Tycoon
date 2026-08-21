/**
 * Guideline 5.1.1(v): once an app supports account creation, it must support
 * account deletion, and it must actually delete — not just deactivate. The
 * cascade on `accounts` (see the schema) takes `purchase_transactions` and
 * `sessions` with it in the same statement.
 */
import { getSql } from '@/server/entitlements-api/db';
import { requireSession, UnauthorizedError } from '@/server/entitlements-api/session';

export async function DELETE(request: Request) {
  let accountId: string;
  try {
    accountId = await requireSession(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) return new Response(null, { status: 401 });
    throw err;
  }

  await getSql()`delete from accounts where id = ${accountId}`;
  return new Response(null, { status: 204 });
}
