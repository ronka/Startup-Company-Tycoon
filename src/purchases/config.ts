/**
 * RevenueCat connection config. The iOS key is a *public* client key (safe
 * to embed / commit), following the same pattern as `analytics/config.ts`.
 *
 * The hardcoded fallback is load-bearing, not a convenience: `eas update
 * --environment <env>` sets `EXPO_NO_DOTENV=1` and bundles only the EAS
 * server-side variables, so `.env` never reaches that bundle. OTA 1.0.4-21
 * shipped with this key undefined — `Purchases.configure()` silently never
 * ran, the hosted paywall reported `not_configured`, and every fallback-sheet
 * purchase failed with "There is no singleton instance".
 */
export const REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 'appl_aADTuKHSudKtuKXFkoYoROErLhg';
