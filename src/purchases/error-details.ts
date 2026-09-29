/**
 * Turns whatever a purchase path caught into analytics-safe detail.
 *
 * Every RevenueCat failure used to be reported as `error_code: "unknown"`,
 * which is what hid the Sep 2026 Nigeria/Nepal failure loops: 126
 * `purchase_failed` events and not one clue why. `error_code` stays as the
 * coarse bucket dashboards already filter on; these fields ride alongside it.
 *
 * Pure and SDK-free on purpose — it reads `PurchasesError`'s shape
 * structurally rather than importing `react-native-purchases`, so vitest can
 * cover it and the fallback path can share the type.
 */

/** Where in the flow the failure happened. `PAYWALL_RESULT.ERROR` carries no error object, so for that case this is the only signal. */
export type PurchaseErrorStage =
  | 'offerings'
  | 'no_package'
  | 'purchase'
  | 'wrong_product'
  | 'present'
  | 'paywall_result'
  | 'unexpected';

export interface PurchaseErrorDetails {
  stage: PurchaseErrorStage;
  /** RevenueCat's numeric `PURCHASES_ERROR_CODE`, as the string the SDK uses. */
  rcCode?: string;
  /** e.g. `STORE_PROBLEM`, `NETWORK_ERROR`, `PRODUCT_NOT_AVAILABLE_FOR_PURCHASE`. */
  readableErrorCode?: string;
  underlyingErrorMessage?: string;
  message?: string;
}

const MAX_MESSAGE_LENGTH = 200;

function str(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  return s.length > MAX_MESSAGE_LENGTH ? `${s.slice(0, MAX_MESSAGE_LENGTH)}…` : s;
}

export function purchaseErrorDetails(stage: PurchaseErrorStage, error?: unknown): PurchaseErrorDetails {
  if (error === undefined || error === null) return { stage };
  if (typeof error !== 'object') return { stage, message: str(error) };
  const err = error as {
    code?: unknown;
    message?: unknown;
    readableErrorCode?: unknown;
    userInfo?: { readableErrorCode?: unknown } | null;
    underlyingErrorMessage?: unknown;
  };
  return {
    stage,
    rcCode: str(err.code),
    readableErrorCode: str(err.userInfo?.readableErrorCode) ?? str(err.readableErrorCode),
    underlyingErrorMessage: str(err.underlyingErrorMessage),
    message: str(err.message),
  };
}

/** Flattened into `purchase_failed` / `paywall_not_presented` properties. Absent fields stay `undefined` and are dropped at ingest. */
export function purchaseErrorProps(details: PurchaseErrorDetails | undefined): Record<string, string | undefined> {
  if (!details) return {};
  return {
    error_stage: details.stage,
    rc_error_code: details.rcCode,
    rc_readable_error_code: details.readableErrorCode,
    rc_underlying_error_message: details.underlyingErrorMessage,
    error_message: details.message,
  };
}
