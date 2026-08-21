import type { DeleteAccountResult, SignInWithAppleResult, SyncEntitlementsResult } from './types';

import type { SyncPayload } from '@/purchases/entitlement-sync';

/**
 * No-native-module path: web, vitest, Android, and Expo Go. Sign in with
 * Apple is iOS/tvOS only (see the plan) — `index.native.ts` swaps this out
 * for the real implementation on iOS native builds.
 */
export const accountAvailable = false;

export async function hasSessionToken(): Promise<boolean> {
  return false;
}

export async function signInWithApple(): Promise<SignInWithAppleResult> {
  return { status: 'error' };
}

export async function syncEntitlements(_payload: SyncPayload): Promise<SyncEntitlementsResult> {
  return { status: 'error' };
}

export async function deleteAccount(): Promise<DeleteAccountResult> {
  return { status: 'error' };
}

export async function signOut(): Promise<void> {}
