/**
 * Universal entry point — resolved on web and under vitest. `index.native.ts`
 * overrides this on iOS/Android native builds. Never import `./api` or
 * `expo-apple-authentication` from here.
 */
export { accountAvailable, deleteAccount, hasSessionToken, signInWithApple, signOut, syncEntitlements } from './fallback';
export type { DeleteAccountResult, SignInWithAppleResult, SyncEntitlementsResult } from './types';
