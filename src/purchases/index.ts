/**
 * Universal entry point — resolved on web and under vitest (Node doesn't
 * understand Metro's `.native.ts` platform extension, so this is the only
 * file those environments ever see). `index.native.ts` overrides this on
 * iOS/Android native builds. Never import `./revenuecat` or
 * `react-native-purchases` from here.
 */
export {
  configurePurchases,
  presentWeeksPaywall,
  purchasesAvailable,
  purchasesClient,
  reconcileOnLaunch,
  restorePurchases,
  syncPostHogAttribute,
} from './fallback';
export { REVIVE_PRICE_LABEL, WEEK_PACKS } from './stub';
export type { LaunchReconciliation, RestoreResult } from './reconciliation';
export type {
  PaywallOutcome,
  PurchaseErrorCode,
  PurchaseResult,
  PurchasesClient,
  RestoreOutcome,
  Reward,
  WeekPack,
} from './types';
