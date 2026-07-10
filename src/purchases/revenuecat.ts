/**
 * Real RevenueCat-backed implementation (Task 5). Only ever loaded from
 * `index.native.ts`, and only on iOS outside Expo Go — never imported
 * directly, so it's safe for this file to assume the native SDK exists.
 *
 * This module owns no persistence of its own for the granted-transaction
 * ledger — `game-store.tsx` does, as a field on the same `PurchasedWeeksPool`
 * object it already persists in one write. That's deliberate: crediting
 * weeks and marking a transaction granted must land in the same atomic
 * update (see `week-budget.ts`'s `creditTransaction`), or a crash between
 * two separate writes can silently lose a paid purchase. This file only
 * *computes* what's owed; the caller applies and persists it.
 */
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesError } from 'react-native-purchases';

import { REVENUECAT_IOS_API_KEY } from './config';
import { shortIdFromProductIdentifier, weeksForProduct } from './product-weeks';
import { reconcilePurchases, type ReconciliationResult } from './reconciliation';
import { WEEK_PACKS } from './stub';
import type { PurchaseResult, PurchasesClient, WeekPack } from './types';

/** Matches the `weeks` offering created in Task 3. */
const OFFERING_LOOKUP_KEY = 'weeks';

let configured = false;

export function configurePurchases(): void {
  if (configured || !REVENUECAT_IOS_API_KEY) return;
  // No `appUserID` — anonymous RC identity, per the design (reinstall loses
  // unspent weeks; accepted in the plan).
  Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
  configured = true;
}

/**
 * Diffs RC's transaction history against `grantedTransactionIds` (owned and
 * persisted by the caller) and reports what's still owed. Called on launch
 * and is the sole source of truth for "is this transaction credited yet" —
 * a purchase that completes but never gets credited (e.g. the app is killed
 * right after payment) self-heals here on the next launch.
 */
export async function reconcileOnLaunch(grantedTransactionIds: ReadonlySet<string>): Promise<ReconciliationResult> {
  if (!configured) return { newlyGranted: [] };
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return reconcilePurchases(customerInfo.nonSubscriptionTransactions, grantedTransactionIds, weeksForProduct);
  } catch (err) {
    console.warn('[purchases] launch reconciliation failed', err);
    return { newlyGranted: [] };
  }
}

export async function syncPostHogAttribute(distinctId: string): Promise<void> {
  if (!configured) return;
  try {
    // `$posthogUserId` is RevenueCat's reserved attribute key for the
    // PostHog integration (Task 6) — associates RC revenue events with the
    // matching PostHog person.
    await Purchases.setAttributes({ $posthogUserId: distinctId });
  } catch (err) {
    console.warn('[purchases] failed to sync PostHog attribute', err);
  }
}

function isUserCancelled(error: unknown): boolean {
  const err = error as Partial<PurchasesError> | undefined;
  return err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.userCancelled === true;
}

async function fetchWeeksOffering() {
  const offerings = await Purchases.getOfferings();
  return offerings.all[OFFERING_LOOKUP_KEY] ?? offerings.current;
}

export const purchasesClient: PurchasesClient = {
  async getPacks(): Promise<WeekPack[]> {
    try {
      const offering = await fetchWeeksOffering();
      if (!offering) return WEEK_PACKS;
      const packs: WeekPack[] = [];
      for (const pkg of offering.availablePackages) {
        const weeks = weeksForProduct(pkg.product.identifier);
        if (weeks === undefined) continue;
        packs.push({
          id: shortIdFromProductIdentifier(pkg.product.identifier),
          weeks,
          priceLabel: pkg.product.priceString,
        });
      }
      // Fall back to the hardcoded catalog if the live offering came back
      // empty/misconfigured — the sheet should never show nothing.
      return packs.length > 0 ? packs.sort((a, b) => a.weeks - b.weeks) : WEEK_PACKS;
    } catch (err) {
      console.warn('[purchases] failed to load offerings, falling back to hardcoded packs', err);
      return WEEK_PACKS;
    }
  },

  async purchasePack(packId: string): Promise<PurchaseResult> {
    try {
      const offering = await fetchWeeksOffering();
      const pkg = offering?.availablePackages.find(
        (p) => shortIdFromProductIdentifier(p.product.identifier) === packId,
      );
      if (!pkg) return { status: 'error', code: 'unknown' };

      const result = await Purchases.purchasePackage(pkg);
      const weeksGranted = weeksForProduct(result.productIdentifier) ?? 0;
      return { status: 'success', weeksGranted, transactionId: result.transaction.transactionIdentifier };
    } catch (error) {
      return { status: 'error', code: isUserCancelled(error) ? 'cancelled' : 'unknown' };
    }
  },
};
