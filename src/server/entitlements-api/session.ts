/**
 * Our own opaque bearer session, not Apple's `identityToken` — that token
 * lives ~10 minutes and can't be silently refreshed, so it's used once at
 * sign-in (`auth/apple+api.ts`) to mint one of these instead. Only the
 * token's SHA-256 hash is ever persisted, so a leaked `sessions` row can't
 * be turned back into a usable token.
 */
import { getSql } from './db';

export class UnauthorizedError extends Error {}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

export async function createSession(accountId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await getSql()`insert into sessions (token_hash, account_id) values (${tokenHash}, ${accountId})`;
  return token;
}

/** Reads `Authorization: Bearer …`, resolves it to an account id, and bumps `last_seen_at`. Throws `UnauthorizedError` otherwise. */
export async function requireSession(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw new UnauthorizedError('missing bearer token');

  const tokenHash = await sha256Hex(match[1]);
  const rows = await getSql()`
    update sessions set last_seen_at = now()
    where token_hash = ${tokenHash}
    returning account_id
  `;
  if (rows.length === 0) throw new UnauthorizedError('unknown session token');
  return rows[0].account_id as string;
}
