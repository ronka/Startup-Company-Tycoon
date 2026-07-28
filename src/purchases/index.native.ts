import Constants from 'expo-constants';
import { Platform } from 'react-native';

import * as fallback from './fallback';
import type { LaunchReconciliation, RestoreResult } from './reconciliation';
import { REVIVE_PRICE_LABEL, WEEK_PACKS } from './stub';
import type {
  PurchaseErrorCode,
  PurchaseResult,
  PurchasesClient,
  RestoreOutcome,
  Reward,
  WeekPack,
} from './types';

/**
 * `react-native-purchases` is a native module: absent from Expo Go (only
 * the app's own custom dev/production builds link it) and out of scope for
 * Android in v1. `Constants.appOwnership === 'expo'` is deprecated but is
 * the only signal that actually isolates "true Expo Go" — the suggested
 * replacement, `executionEnvironment`, reports `storeClient` for both Expo
 * Go *and* our own custom dev client, which does have the native module.
 *
 * `require` (not a static import) so `./revenuecat` — and the native SDK it
 * pulls in — is never evaluated on paths where it isn't safe to load.
 */
const canUseRevenueCat = Platform.OS === 'ios' && Constants.appOwnership !== 'expo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl: typeof fallback = canUseRevenueCat ? require('./revenuecat') : fallback;

export const purchasesClient: PurchasesClient = impl.purchasesClient;
/** True only on genuine iOS custom builds (see `canUseRevenueCat`); the UI gates paywalls on this. */
export const purchasesAvailable = canUseRevenueCat;
export const configurePurchases: () => void = impl.configurePurchases;
export const reconcileOnLaunch: (
  grantedWeekTransactionIds: ReadonlySet<string>,
  grantedReviveTransactionIds: ReadonlySet<string>,
) => Promise<LaunchReconciliation> = impl.reconcileOnLaunch;
export const restorePurchases: (
  grantedWeekTransactionIds: ReadonlySet<string>,
  grantedReviveTransactionIds: ReadonlySet<string>,
) => Promise<RestoreResult> = impl.restorePurchases;
export const syncPostHogAttribute: (distinctId: string) => Promise<void> = impl.syncPostHogAttribute;
export { REVIVE_PRICE_LABEL, WEEK_PACKS };
export type { LaunchReconciliation, RestoreResult };
export type { PurchaseErrorCode, PurchaseResult, PurchasesClient, RestoreOutcome, Reward, WeekPack };
