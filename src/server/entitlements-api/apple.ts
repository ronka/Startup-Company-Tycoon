/**
 * Verifies a Sign in with Apple `identityToken` against Apple's published
 * keys. `jose` (Web Crypto based) rather than `jsonwebtoken` — the latter
 * needs Node's `crypto` module, unavailable on EAS Hosting's worker runtime.
 *
 * `jwtVerify` itself checks `exp` (rejects an expired token) and, given
 * `issuer`/`audience`, checks `iss`/`aud` — so a bad token fails inside this
 * call rather than needing separate manual checks after the fact.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export class InvalidAppleTokenError extends Error {}

/**
 * Returns Apple's stable per-app user identifier (`sub`). No scopes are
 * requested at sign-in (see the plan), so this token carries no name/email —
 * `sub` is all this endpoint needs.
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<{ appleUserId: string }> {
  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: process.env.APPLE_BUNDLE_ID,
    }));
  } catch (err) {
    throw new InvalidAppleTokenError(err instanceof Error ? err.message : 'invalid identity token');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new InvalidAppleTokenError('identity token missing sub');
  }
  return { appleUserId: payload.sub };
}
