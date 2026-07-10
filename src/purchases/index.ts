/**
 * Universal entry point — resolved on web and under vitest (Node doesn't
 * understand Metro's `.native.ts` platform extension, so this is the only
 * file those environments ever see). `index.native.ts` overrides this on
 * iOS/Android native builds. Never import `./revenuecat` or
 * `react-native-purchases` from here.
 */
export {
  configurePurchases,
  purchasesAvailable,
  purchasesClient,
  reconcileOnLaunch,
  syncPostHogAttribute,
} from './fallback';
export { REVIVE_PRICE_LABEL, WEEK_PACKS } from './stub';
export type { PurchaseErrorCode, PurchaseResult, PurchasesClient, Reward, WeekPack } from './types';
