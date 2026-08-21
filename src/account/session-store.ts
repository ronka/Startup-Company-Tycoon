/**
 * Persists the opaque bearer session token from `POST /api/auth/apple`.
 * `expo-secure-store`, not AsyncStorage — this is the one credential in the
 * app worth keeping out of plain storage.
 *
 * Key uses dots, not the plan's originally-specified slashes:
 * `expo-secure-store` validates keys against `/^[\w.-]+$/` and throws on
 * anything else, so `startup-tycoon/session/v1` would fail at runtime.
 */
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'startup-tycoon.session.v1';

export async function getSessionToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch (err) {
    console.warn('[account] failed to read session token', err);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, token);
  } catch (err) {
    console.warn('[account] failed to persist session token', err);
  }
}

export async function clearSessionToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch (err) {
    console.warn('[account] failed to clear session token', err);
  }
}
