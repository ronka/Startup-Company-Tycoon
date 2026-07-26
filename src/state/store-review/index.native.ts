/**
 * Owns the App Store review ask on iOS/Android. Impure by design — AsyncStorage,
 * the OS review sheet and analytics are the entire job — and sits beside its pure
 * twin `review-ask.ts` the same way `notification-permission.ts` sits beside
 * `notification-content.ts` / `notification-schedule.ts`.
 *
 * Metro resolves this file over `index.ts` on native; web and vitest only ever see
 * the no-op one. That split exists because `game-store.tsx` imports this module and
 * is unit-tested in a plain Node env that cannot parse `react-native`.
 *
 * Every caller may fire freely: this module is the single place that decides
 * whether an ask is actually spent, so trigger sites stay simple "was this a good
 * moment?" checks and never track budget themselves.
 *
 * The hard constraint shaping all of it: `requestReview()` returns **no callback**.
 * We never learn whether the sheet appeared, whether the OS throttled it, or what
 * the player did. So the budget is deliberately smaller than the OS's own, and the
 * only real outcome signal is the ratings count in App Store Connect.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import {
  parseReviewAskRecord,
  recordReviewAsk,
  reviewAskBlockedBy,
  type ReviewSuppressedReason,
  type ReviewTrigger,
} from '@/state/review-ask';

const REVIEW_ASK_KEY = 'startup-tycoon/store-review/asks';

/**
 * `expo-store-review` is loaded lazily, and this is not a micro-optimization.
 * Its entry point calls `requireNativeModule('ExpoStoreReview')` at module scope,
 * which **throws at import time** on any binary that doesn't contain the native
 * module. A static import here would therefore be reachable from `game-store.tsx`
 * on app launch — so shipping this JS as an OTA update to the current production
 * build, which predates the module, would crash every install on open.
 *
 * Loading it inside the async paths instead means an un-rebuilt binary quietly
 * reports "review unavailable" rather than dying. The rebuild is still required for
 * the feature to work; this only decides how it fails until then.
 */
type StoreReviewModule = typeof import('expo-store-review');
let storeReviewModule: StoreReviewModule | null = null;
let storeReviewUnavailable = false;

async function loadStoreReview(): Promise<StoreReviewModule | null> {
  if (storeReviewModule) return storeReviewModule;
  if (storeReviewUnavailable) return null;
  try {
    storeReviewModule = await import('expo-store-review');
    return storeReviewModule;
  } catch {
    storeReviewUnavailable = true;
    return null;
  }
}

/**
 * Guards against two triggers racing within one launch. Checked before the first
 * `await` for the same reason as `notification-permission.ts`'s latch: the storage
 * read below is async, so a personal-best game-over landing in the same beat as a
 * funding round would have both callers read "eligible" and both fire.
 *
 * Never reset outside of `resetReviewGateForDev`.
 */
let reviewAskStarted = false;

/**
 * Reasons already reported this launch. `cap_reached` is the one that matters:
 * once an install is capped, the funding-round trigger would otherwise emit a
 * suppressed event on every Series A/B raise forever, drowning out the signal the
 * event exists to carry.
 */
const reportedReasons = new Set<ReviewSuppressedReason>();

/**
 * Set by `notePurchaseFailed`. A player whose payment just failed is the last one
 * to ask a favour of, and the failure outlives the sheet it happened in — they can
 * fail a week-pack purchase and raise a Series B ten minutes later. Launch-scoped
 * rather than persisted: the grudge should expire when the session does.
 */
let purchaseFailedThisLaunch = false;

/**
 * Record that a purchase failed, closing the review gate for the rest of the
 * launch. Called from the purchase-failure paths, which is why this module doesn't
 * try to observe them itself.
 */
export function notePurchaseFailed(): void {
  purchaseFailedThisLaunch = true;
}

function reportSuppressed(trigger: ReviewTrigger, reason: ReviewSuppressedReason): void {
  if (reportedReasons.has(reason)) return;
  reportedReasons.add(reason);
  track(EVENTS.REVIEW_PROMPT_SUPPRESSED, { trigger, reason });
}

/**
 * Report a trigger that a caller rejected on game-state grounds — a modal owning
 * the screen, or the notification dialog holding the same beat. Exported because
 * those conditions need state this module deliberately can't reach for.
 */
export function reportReviewSuppressed(trigger: ReviewTrigger, reason: ReviewSuppressedReason): void {
  reportSuppressed(trigger, reason);
}

/**
 * Ask for a review, if the budget allows. Safe to call from anywhere, any number of
 * times — everything after the first successful ask is a no-op until the cooldown
 * elapses, and everything after the second is a no-op forever.
 *
 * Callers own the "is this a good moment?" question; this owns "can we afford it?".
 */
export async function requestReviewOnce(trigger: ReviewTrigger): Promise<void> {
  if (reviewAskStarted) return;
  if (purchaseFailedThisLaunch) {
    reportSuppressed(trigger, 'purchase_failed');
    return;
  }
  reviewAskStarted = true;

  try {
    const StoreReview = await loadStoreReview();
    // `isAvailableAsync`, not `hasAction`: the latter also weighs the store URLs in
    // app config, and this ask must not quietly stop working if `ios.appStoreUrl`
    // is ever dropped. Returns false in TestFlight — expected, not a bug.
    if (!StoreReview || !(await StoreReview.isAvailableAsync())) {
      reviewAskStarted = false;
      reportSuppressed(trigger, 'unavailable');
      return;
    }

    const now = Date.now();
    const record = parseReviewAskRecord(await AsyncStorage.getItem(REVIEW_ASK_KEY));
    const blockedBy = reviewAskBlockedBy(record, now);
    if (blockedBy) {
      reviewAskStarted = false;
      reportSuppressed(trigger, blockedBy);
      return;
    }

    // Written *before* the sheet is requested: if the app is killed mid-flow,
    // over-counting one ask is far cheaper than asking the same player twice.
    const next = recordReviewAsk(record, now);
    await AsyncStorage.setItem(REVIEW_ASK_KEY, JSON.stringify(next));

    await StoreReview.requestReview();
    track(EVENTS.REVIEW_PROMPT_REQUESTED, { trigger, ask_number: next.askCount });
  } catch {
    // Best-effort, exactly like `track` — a rating prompt must never be able to
    // break a run. The latch stays set: something went wrong mid-ask, and retrying
    // inside the same launch is how you end up double-presenting.
  }
}

/**
 * Debug-menu escape hatch: clears the persisted budget and the in-launch latch so
 * the flow can be re-run.
 *
 * Reachable only through the triple-tap hidden menu in `settings.tsx` — which does
 * ship in production builds (that menu has no `__DEV__` guard, same as the
 * grant-weeks and grant-token entries beside it). The worst a player who finds it
 * can do is spend one of their own OS review asks.
 */
export async function resetReviewGateForDev(): Promise<void> {
  reviewAskStarted = false;
  reportedReasons.clear();
  await AsyncStorage.removeItem(REVIEW_ASK_KEY).catch(() => {});
}

/** Dev-menu escape hatch: present the sheet regardless of budget. */
export async function forceReviewForDev(): Promise<void> {
  const StoreReview = await loadStoreReview();
  await StoreReview?.requestReview().catch(() => {});
}

/**
 * The app's store listing URL from app config (`ios.appStoreUrl`), or null if it
 * isn't configured. Backs the Settings row, which opens the listing rather than
 * calling `requestReview()` — driving the native sheet from a button is against
 * Apple's guidance, and this is also the only rating path that works in TestFlight,
 * where `isAvailableAsync()` reports false.
 */
export function storeListingUrl(): string | null {
  // Read straight from app config rather than through `StoreReview.storeUrl()`,
  // which is the same lookup but reachable only by importing the module that throws
  // when the native side is missing (see `loadStoreReview`). This has to be
  // synchronous for render, and it must work on a binary that predates the module.
  const config = Constants.expoConfig;
  if (Platform.OS === 'ios') return config?.ios?.appStoreUrl ?? null;
  if (Platform.OS === 'android') return config?.android?.playStoreUrl ?? null;
  return null;
}
