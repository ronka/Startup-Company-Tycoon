/**
 * Thin wrapper over `expo-apple-authentication`. `.native.ts` suffixed (unlike
 * the rest of this folder) so Metro excludes it from the web bundle even if
 * something ever imports it by mistake — it's a native module, absent on web
 * and Android, and this repo's IAP is iOS-only anyway (see the plan).
 */
import * as AppleAuthentication from 'expo-apple-authentication';

export interface AppleSignIn {
  appleUserId: string;
  identityToken: string;
}

export type AppleSignInOutcome =
  | { status: 'success'; signIn: AppleSignIn }
  | { status: 'cancelled' }
  | { status: 'error' };

export async function isAvailableAsync(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (err) {
    console.warn('[account] AppleAuthentication.isAvailableAsync failed', err);
    return false;
  }
}

/**
 * No `requestedScopes` (see the plan: no name/email requested, no Contact
 * Info privacy label needed) — the stable `user` id and `identityToken` are
 * all `/api/auth/apple` needs.
 */
export async function signInAsync(): Promise<AppleSignInOutcome> {
  try {
    const credential = await AppleAuthentication.signInAsync();
    if (!credential.identityToken) return { status: 'error' };
    return { status: 'success', signIn: { appleUserId: credential.user, identityToken: credential.identityToken } };
  } catch (err) {
    if (isCancelledError(err)) return { status: 'cancelled' };
    console.warn('[account] Apple sign-in failed', err);
    return { status: 'error' };
  }
}

function isCancelledError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}
