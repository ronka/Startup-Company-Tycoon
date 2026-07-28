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
import { isReviveProduct, shortIdFromProductIdentifier, weeksForProduct } from './product-weeks';
import {
  reconcilePurchases,
  reconcileRevivePurchases,
  type LaunchReconciliation,
  type RestoreResult,
} from './reconciliation';
import { WEEK_PACKS } from './stub';
import type { PurchaseResult, PurchasesClient, WeekPack } from './types';

/** Matches the `weeks` offering created in Task 3. */
const OFFERING_LOOKUP_KEY = 'weeks';
/** Matches the `revive` offering — one package, the single bailout consumable. */
const OFFERING_LOOKUP_KEY_REVIVE = 'revive';

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
export async function reconcileOnLaunch(
  grantedWeekTransactionIds: ReadonlySet<string>,
  grantedReviveTransactionIds: ReadonlySet<string>,
): Promise<LaunchReconciliation> {
  if (!configured) return { newlyGrantedWeeks: [], newlyGrantedRevives: [] };
  try {
    // One SDK round-trip, fanned out into both reward buckets. Each pool
    // owns its own granted-tx ledger, so the two reconcile independently.
    const customerInfo = await Purchases.getCustomerInfo();
    const txns = customerInfo.nonSubscriptionTransactions;
    return {
      newlyGrantedWeeks: reconcilePurchases(txns, grantedWeekTransactionIds, weeksForProduct).newlyGranted,
      newlyGrantedRevives: reconcileRevivePurchases(txns, grantedReviveTransactionIds, isReviveProduct).newlyGranted,
    };
  } catch (err) {
    console.warn('[purchases] launch reconciliation failed', err);
    return { newlyGrantedWeeks: [], newlyGrantedRevives: [] };
  }
}

/**
 * The player-initiated restore behind the "Restore Purchases" control that
 * App Review expects wherever an app sells something (Guideline 3.1.1).
 *
 * `Purchases.restorePurchases()` — not `getCustomerInfo()` — is the call that
 * actually matters here: it refreshes the StoreKit receipt and re-associates
 * its transactions with the current (anonymous) RevenueCat identity, which is
 * what makes anything recoverable after a reinstall at all. The diff that
 * follows is the exact same idempotent reconciliation the launch pass runs, so
 * restoring can only ever credit transactions the ledger hasn't already seen —
 * tapping it repeatedly is harmless and never double-grants.
 *
 * Worth being clear-eyed about the ceiling: week packs and revives are
 * *consumables*, and Apple drops finished consumables from the receipt. So a
 * genuine "restore" mostly recovers purchases this install never finished
 * crediting (paid, then killed mid-flow), not a purchase history from a
 * previous install. That's expected, and it's why the UI has to report
 * "nothing to restore" as a normal, non-error outcome rather than a failure.
 */
export async function restorePurchases(
  grantedWeekTransactionIds: ReadonlySet<string>,
  grantedReviveTransactionIds: ReadonlySet<string>,
): Promise<RestoreResult> {
  if (!configured) return { status: 'error' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    const txns = customerInfo.nonSubscriptionTransactions;
    return {
      status: 'ok',
      reconciliation: {
        newlyGrantedWeeks: reconcilePurchases(txns, grantedWeekTransactionIds, weeksForProduct).newlyGranted,
        newlyGrantedRevives: reconcileRevivePurchases(txns, grantedReviveTransactionIds, isReviveProduct).newlyGranted,
      },
    };
  } catch (err) {
    console.warn('[purchases] restore failed', err);
    return { status: 'error' };
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

/** The revive offering's single package (the bailout consumable), or undefined if misconfigured. */
async function fetchRevivePackage() {
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[OFFERING_LOOKUP_KEY_REVIVE];
  if (!offering) return undefined;
  return (
    offering.availablePackages.find((p) => isReviveProduct(p.product.identifier)) ?? offering.availablePackages[0]
  );
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
      const weeks = weeksForProduct(result.productIdentifier) ?? 0;
      return {
        status: 'success',
        reward: { kind: 'weeks', weeks },
        transactionId: result.transaction.transactionIdentifier,
      };
    } catch (error) {
      return { status: 'error', code: isUserCancelled(error) ? 'cancelled' : 'unknown' };
    }
  },

  async purchaseRevive(): Promise<PurchaseResult> {
    try {
      const pkg = await fetchRevivePackage();
      if (!pkg) return { status: 'error', code: 'unknown' };
      const result = await Purchases.purchasePackage(pkg);
      // Only honor a transaction that's actually the revive product.
      if (!isReviveProduct(result.productIdentifier)) return { status: 'error', code: 'unknown' };
      return {
        status: 'success',
        reward: { kind: 'revive' },
        transactionId: result.transaction.transactionIdentifier,
      };
    } catch (error) {
      return { status: 'error', code: isUserCancelled(error) ? 'cancelled' : 'unknown' };
    }
  },

  async getRevivePrice(): Promise<string | null> {
    try {
      const pkg = await fetchRevivePackage();
      return pkg?.product.priceString ?? null;
    } catch (err) {
      console.warn('[purchases] failed to load revive price', err);
      return null;
    }
  },
};
