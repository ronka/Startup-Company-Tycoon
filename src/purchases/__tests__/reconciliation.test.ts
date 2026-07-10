import { describe, expect, it } from 'vitest';

import { reconcilePurchases, reconcileRevivePurchases } from '../reconciliation';

const weeksForProduct = (productIdentifier: string): number | undefined =>
  ({ 'com.ronkaa.startuptycoon.weeks20': 20, 'com.ronkaa.startuptycoon.weeks60': 60 })[productIdentifier];

const isReviveProduct = (productIdentifier: string): boolean =>
  productIdentifier === 'com.ronkaa.startuptycoon.revive';

describe('reconcilePurchases', () => {
  it('credits a missing grant exactly once', () => {
    const result = reconcilePurchases(
      [{ transactionIdentifier: 'tx1', productIdentifier: 'com.ronkaa.startuptycoon.weeks20' }],
      new Set(),
      weeksForProduct,
    );
    expect(result.newlyGranted).toEqual([{ transactionId: 'tx1', weeks: 20 }]);
  });

  it('never re-credits an already-granted transaction', () => {
    const result = reconcilePurchases(
      [{ transactionIdentifier: 'tx1', productIdentifier: 'com.ronkaa.startuptycoon.weeks20' }],
      new Set(['tx1']),
      weeksForProduct,
    );
    expect(result.newlyGranted).toEqual([]);
  });

  it('credits multiple pending grants, skipping only the already-granted one', () => {
    const result = reconcilePurchases(
      [
        { transactionIdentifier: 'tx1', productIdentifier: 'com.ronkaa.startuptycoon.weeks20' },
        { transactionIdentifier: 'tx2', productIdentifier: 'com.ronkaa.startuptycoon.weeks60' },
        { transactionIdentifier: 'tx3', productIdentifier: 'com.ronkaa.startuptycoon.weeks20' },
      ],
      new Set(['tx1']),
      weeksForProduct,
    );
    expect(result.newlyGranted.map((g) => g.transactionId).sort()).toEqual(['tx2', 'tx3']);
    expect(result.newlyGranted.reduce((sum, g) => sum + g.weeks, 0)).toBe(80);
  });

  it('ignores transactions for unknown products', () => {
    const result = reconcilePurchases(
      [{ transactionIdentifier: 'tx1', productIdentifier: 'com.ronkaa.startuptycoon.unrelated' }],
      new Set(),
      weeksForProduct,
    );
    expect(result.newlyGranted).toEqual([]);
  });

  it('is a no-op on an empty transaction list', () => {
    const result = reconcilePurchases([], new Set(), weeksForProduct);
    expect(result).toEqual({ newlyGranted: [] });
  });

  it('ignores a revive transaction (unmapped for weeks)', () => {
    const result = reconcilePurchases(
      [{ transactionIdentifier: 'txr', productIdentifier: 'com.ronkaa.startuptycoon.revive' }],
      new Set(),
      weeksForProduct,
    );
    expect(result.newlyGranted).toEqual([]);
  });
});

describe('reconcileRevivePurchases', () => {
  it('credits a pending revive transaction id exactly once', () => {
    const result = reconcileRevivePurchases(
      [{ transactionIdentifier: 'txr', productIdentifier: 'com.ronkaa.startuptycoon.revive' }],
      new Set(),
      isReviveProduct,
    );
    expect(result.newlyGranted).toEqual(['txr']);
  });

  it('never re-credits an already-granted revive', () => {
    const result = reconcileRevivePurchases(
      [{ transactionIdentifier: 'txr', productIdentifier: 'com.ronkaa.startuptycoon.revive' }],
      new Set(['txr']),
      isReviveProduct,
    );
    expect(result.newlyGranted).toEqual([]);
  });

  it('ignores week-pack transactions', () => {
    const result = reconcileRevivePurchases(
      [{ transactionIdentifier: 'tx1', productIdentifier: 'com.ronkaa.startuptycoon.weeks20' }],
      new Set(),
      isReviveProduct,
    );
    expect(result.newlyGranted).toEqual([]);
  });
});
