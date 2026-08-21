import Constants from 'expo-constants';
import { Platform } from 'react-native';

import * as fallback from './fallback';
import type { DeleteAccountResult, SignInWithAppleResult, SyncEntitlementsResult } from './types';

import type { SyncPayload } from '@/purchases/entitlement-sync';

/**
 * `expo-apple-authentication` is a native module: absent from Expo Go, and
 * Sign in with Apple is iOS/tvOS only (see the plan). Same guard shape as
 * `purchases/index.native.ts`'s `canUseRevenueCat`, and the same reasoning
 * for `require` over a static import — so `./api` (and the native SDK it
 * pulls in) is never evaluated on paths where it isn't safe to load.
 */
const canUseAppleAuth = Platform.OS === 'ios' && Constants.appOwnership !== 'expo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl: typeof fallback = canUseAppleAuth ? require('./api') : fallback;

/** True only on genuine iOS custom builds (see `canUseAppleAuth`); the UI gates account affordances on this. */
export const accountAvailable = canUseAppleAuth;
export const hasSessionToken: () => Promise<boolean> = impl.hasSessionToken;
export const signInWithApple: () => Promise<SignInWithAppleResult> = impl.signInWithApple;
export const syncEntitlements: (payload: SyncPayload) => Promise<SyncEntitlementsResult> = impl.syncEntitlements;
export const deleteAccount: () => Promise<DeleteAccountResult> = impl.deleteAccount;
export const signOut: () => Promise<void> = impl.signOut;
export type { DeleteAccountResult, SignInWithAppleResult, SyncEntitlementsResult };
