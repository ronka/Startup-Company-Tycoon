/**
 * Universal entry point for the App Store review ask — resolved on web and under
 * vitest (Node doesn't understand Metro's `.native.ts` platform extension, so this
 * is the only file those environments ever see). `index.native.ts` overrides it on
 * iOS/Android. Same split, and the same reason, as `src/purchases/index.ts`:
 * `game-store.tsx` reaches this module and is unit-tested in a plain Node env, so
 * nothing here may pull in `react-native` or `expo-store-review`.
 *
 * There is no store to review on web, so every export is a no-op. The pure budget
 * logic lives in `../review-ask.ts` and is tested directly.
 */

import type { ReviewSuppressedReason, ReviewTrigger } from '@/state/review-ask';

export async function requestReviewOnce(_trigger: ReviewTrigger): Promise<void> {}

export function reportReviewSuppressed(_trigger: ReviewTrigger, _reason: ReviewSuppressedReason): void {}

export function notePurchaseFailed(): void {}

export async function resetReviewGateForDev(): Promise<void> {}

export async function forceReviewForDev(): Promise<void> {}

/** Web has no store listing to open, so the Settings row hides itself. */
export function storeListingUrl(): string | null {
  return null;
}
