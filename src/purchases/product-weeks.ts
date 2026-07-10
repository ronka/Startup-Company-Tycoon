import { WEEK_PACKS } from './stub';

/** Matches the bundle-id-prefixed product identifiers created in Task 3. */
const PRODUCT_ID_PREFIX = 'com.ronkaa.startuptycoon.';

/** Store product identifier (e.g. from `nonSubscriptionTransactions`) -> weeks. */
export function weeksForProduct(productIdentifier: string): number | undefined {
  return WEEK_PACKS.find((pack) => productIdentifier === `${PRODUCT_ID_PREFIX}${pack.id}`)?.weeks;
}

/** Store product identifier -> our short pack id (e.g. `weeks20`), so live RC packages line up with `WEEK_PACKS`. */
export function shortIdFromProductIdentifier(productIdentifier: string): string {
  return productIdentifier.startsWith(PRODUCT_ID_PREFIX)
    ? productIdentifier.slice(PRODUCT_ID_PREFIX.length)
    : productIdentifier;
}

/** The single consumable product behind the bankruptcy bailout IAP (Task: revive). */
export const REVIVE_PRODUCT_ID = `${PRODUCT_ID_PREFIX}revive`;

/** Whether a store transaction is for the revive product (drives the revive reconciliation pass). */
export function isReviveProduct(productIdentifier: string): boolean {
  return productIdentifier === REVIVE_PRODUCT_ID;
}
