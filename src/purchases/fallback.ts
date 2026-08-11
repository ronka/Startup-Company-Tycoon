import type { LaunchReconciliation, RestoreResult } from './reconciliation';
import { stubPurchasesClient } from './stub';
import type { PaywallOutcome, PurchasesClient } from './types';

/**
 * No-native-SDK path: web, vitest, and Expo Go (which can't load the
 * `react-native-purchases` native module). `index.native.ts` swaps this out
 * for the real RevenueCat-backed implementation on iOS native builds.
 */
export const purchasesClient: PurchasesClient = stubPurchasesClient;

/**
 * Whether real in-app purchases can be made in this environment. False on the
 * no-native-SDK path (web/tests/Expo Go/Android) — the UI gates purchase
 * affordances on this, not on `Platform.OS`, so it never shows a live paywall
 * that the stub would "complete" for free. `index.native.ts` overrides it.
 */
export const purchasesAvailable = false;

export function configurePurchases(): void {}

/**
 * No RevenueCat paywall to present without the native SDK. `not_presented`
 * (rather than `error`) is the honest answer and the useful one: it routes the
 * caller to the in-app `BuyWeeksSheet`, which is the only thing that can work
 * on web, in tests, and in Expo Go anyway.
 */
export async function presentWeeksPaywall(): Promise<PaywallOutcome> {
  return 'not_presented';
}

export async function reconcileOnLaunch(
  _grantedWeekTransactionIds: ReadonlySet<string>,
  _grantedReviveTransactionIds: ReadonlySet<string>,
): Promise<LaunchReconciliation> {
  return { newlyGrantedWeeks: [], newlyGrantedRevives: [] };
}

/**
 * No store to talk to here, so a restore trivially succeeds owing nothing.
 * `ok` rather than `error`: the UI only ever offers restore where
 * `purchasesAvailable` is true, and a caller that reached this on the
 * no-native-SDK path has genuinely lost no purchase.
 */
export async function restorePurchases(
  _grantedWeekTransactionIds: ReadonlySet<string>,
  _grantedReviveTransactionIds: ReadonlySet<string>,
): Promise<RestoreResult> {
  return { status: 'ok', reconciliation: { newlyGrantedWeeks: [], newlyGrantedRevives: [] } };
}

export async function syncPostHogAttribute(_distinctId: string): Promise<void> {}
