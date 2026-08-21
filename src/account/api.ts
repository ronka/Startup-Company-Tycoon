/**
 * The real, native-backed implementation. Only ever loaded from
 * `index.native.ts`, and only where `expo-apple-authentication` is actually
 * linked — never imported directly (mirrors `purchases/revenuecat.ts`).
 *
 * `fetch` against the `expo-router` plugin's configured `origin`
 * (`config.extra.router.origin` — how the plugin actually stores the
 * `origin` option; see its `withRouter.js`) rather than a hardcoded URL or a
 * new `EXPO_PUBLIC_` env var (the plan deliberately avoids adding one — see
 * its "Secrets boundary" section).
 *
 * A failed sync is never surfaced to the player as an error — it just
 * retries on the next trigger (a pool change, a restore, the next launch).
 * Offline play must never degrade because of this feature.
 */
import Constants from 'expo-constants';

import { signInAsync } from './apple-auth.native';
import { clearSessionToken, getSessionToken, setSessionToken } from './session-store';
import type { DeleteAccountResult, SignInWithAppleResult, SyncEntitlementsResult } from './types';

import type { ServerEntitlements, SyncPayload } from '@/purchases/entitlement-sync';

const REQUEST_TIMEOUT_MS = 8000;

function apiOrigin(): string | null {
  const origin = Constants.expoConfig?.extra?.router?.origin;
  return typeof origin === 'string' && origin.length > 0 ? origin : null;
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const origin = apiOrigin();
  if (!origin) throw new Error('no API origin configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${origin}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function hasSessionToken(): Promise<boolean> {
  return (await getSessionToken()) !== null;
}

/** Native Apple sign-in, then `POST /api/auth/apple`, then persists the returned session token. */
export async function signInWithApple(): Promise<SignInWithAppleResult> {
  const outcome = await signInAsync();
  if (outcome.status !== 'success') return outcome;

  try {
    const response = await apiFetch('/api/auth/apple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken: outcome.signIn.identityToken }),
    });
    if (!response.ok) {
      console.warn('[account] sign-in rejected', response.status, await response.text());
      return { status: 'error' };
    }

    const body = (await response.json()) as { sessionToken: string; entitlements: ServerEntitlements };
    await setSessionToken(body.sessionToken);
    return { status: 'signed-in', appleUserId: outcome.signIn.appleUserId, entitlements: body.entitlements };
  } catch (err) {
    console.warn('[account] sign-in request failed', err);
    return { status: 'error' };
  }
}

/** No-op-shaped failure (not thrown) when there's no session — callers only invoke this while signed in. */
export async function syncEntitlements(payload: SyncPayload): Promise<SyncEntitlementsResult> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) return { status: 'error' };

  try {
    const response = await apiFetch('/api/entitlements/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return { status: 'error' };
    const entitlements = (await response.json()) as ServerEntitlements;
    return { status: 'ok', entitlements };
  } catch (err) {
    console.warn('[account] entitlements sync failed', err);
    return { status: 'error' };
  }
}

/** Deletes the server account. Does not clear the local session token — callers pair this with `signOut()`. */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) return { status: 'error' };

  try {
    const response = await apiFetch('/api/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    return response.ok ? { status: 'ok' } : { status: 'error' };
  } catch (err) {
    console.warn('[account] delete account failed', err);
    return { status: 'error' };
  }
}

/** Clears the local session token and local `account` state only — the server account survives (see the plan). */
export async function signOut(): Promise<void> {
  await clearSessionToken();
}
