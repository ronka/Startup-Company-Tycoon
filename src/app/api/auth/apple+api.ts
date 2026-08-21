/**
 * Sign-in is one round trip: verify the Apple token, upsert the account,
 * mint a session, and hand back entitlements — so the client never needs a
 * follow-up fetch just to learn what it's signed into.
 */
import { getSql } from '@/server/entitlements-api/db';
import { InvalidAppleTokenError, verifyAppleIdentityToken } from '@/server/entitlements-api/apple';
import { loadEntitlements } from '@/server/entitlements-api/entitlements';
import { createSession } from '@/server/entitlements-api/session';

export async function POST(request: Request) {
  let body: { identityToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof body.identityToken !== 'string' || body.identityToken.length === 0) {
    return Response.json({ error: 'missing_identity_token' }, { status: 400 });
  }

  let appleUserId: string;
  try {
    ({ appleUserId } = await verifyAppleIdentityToken(body.identityToken));
  } catch (err) {
    if (err instanceof InvalidAppleTokenError) {
      return Response.json({ error: 'invalid_identity_token' }, { status: 401 });
    }
    throw err;
  }

  const rows = await getSql()`
    insert into accounts (apple_user_id)
    values (${appleUserId})
    on conflict (apple_user_id) do update set updated_at = now()
    returning id
  `;
  const accountId = rows[0].id as string;

  const sessionToken = await createSession(accountId);
  const entitlements = await loadEntitlements(accountId);

  return Response.json({ sessionToken, entitlements });
}
