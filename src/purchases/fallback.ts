import type { ReconciliationResult } from './reconciliation';
import { stubPurchasesClient } from './stub';
import type { PurchasesClient } from './types';

/**
 * No-native-SDK path: web, vitest, and Expo Go (which can't load the
 * `react-native-purchases` native module). `index.native.ts` swaps this out
 * for the real RevenueCat-backed implementation on iOS native builds.
 */
export const purchasesClient: PurchasesClient = stubPurchasesClient;

export function configurePurchases(): void {}

export async function reconcileOnLaunch(_grantedTransactionIds: ReadonlySet<string>): Promise<ReconciliationResult> {
  return { newlyGranted: [] };
}

export async function syncPostHogAttribute(_distinctId: string): Promise<void> {}
