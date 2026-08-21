import type { ServerEntitlements } from '@/purchases/entitlement-sync';

export type SignInWithAppleResult =
  | { status: 'signed-in'; appleUserId: string; entitlements: ServerEntitlements }
  | { status: 'cancelled' }
  | { status: 'error' };

export type SyncEntitlementsResult = { status: 'ok'; entitlements: ServerEntitlements } | { status: 'error' };

export type DeleteAccountResult = { status: 'ok' } | { status: 'error' };
