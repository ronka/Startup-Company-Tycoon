import { describe, expect, it } from 'vitest';

import { buildSyncPayload, mergeEntitlements, type ServerEntitlements } from '../entitlement-sync';
import type { PurchaseTransaction } from '../reconciliation';

import { initialPurchasedWeeksPool, type PurchasedWeeksPool } from '@/state/week-budget';
import { initialRevivePool, type RevivePool } from '@/state/revive';

const emptyServer: ServerEntitlements = {
  weeksGranted: 0,
  weeksSpent: 0,
  revivesGranted: 0,
  revivesSpent: 0,
  transactionIds: [],
};

describe('buildSyncPayload', () => {
  it('prices store transactions using the same product mapping the native purchase flow uses', () => {
    const purchased: PurchasedWeeksPool = { weeksRemaining: 5, grantedTransactionIds: ['tx1'], weeksSpent: 3 };
    const revives: RevivePool = { tokensRemaining: 1, grantedTransactionIds: ['txr'], tokensSpent: 2 };
    const storeTransactions: PurchaseTransaction[] = [
      { transactionIdentifier: 'tx1', productIdentifier: 'com.ronkaa.startuptycoon.weeks20' },
      { transactionIdentifier: 'txr', productIdentifier: 'com.ronkaa.startuptycoon.revive' },
    ];

    const payload = buildSyncPayload(purchased, revives, storeTransactions);

    expect(payload.weeksSpent).toBe(3);
    expect(payload.revivesSpent).toBe(2);
    expect(payload.transactions).toEqual([
      { transactionId: 'tx1', productId: 'com.ronkaa.startuptycoon.weeks20', weeks: 20, revives: 0 },
      { transactionId: 'txr', productId: 'com.ronkaa.startuptycoon.revive', weeks: 0, revives: 1 },
    ]);
  });

  it('defaults spend counters to 0 for pools that predate the spend fields', () => {
    const purchased = { weeksRemaining: 5, grantedTransactionIds: [] } as PurchasedWeeksPool;
    const revives = { tokensRemaining: 0, grantedTransactionIds: [] } as RevivePool;

    const payload = buildSyncPayload(purchased, revives, []);

    expect(payload.weeksSpent).toBe(0);
    expect(payload.revivesSpent).toBe(0);
    expect(payload.transactions).toEqual([]);
  });
});

describe('mergeEntitlements', () => {
  it('a fresh device (local 0) takes the full server balance', () => {
    const server: ServerEntitlements = {
      weeksGranted: 20,
      weeksSpent: 0,
      revivesGranted: 1,
      revivesSpent: 0,
      transactionIds: ['tx1', 'txr'],
    };

    const result = mergeEntitlements(initialPurchasedWeeksPool(), initialRevivePool(), server, { firstLink: true });

    expect(result.purchased.weeksRemaining).toBe(20);
    expect(result.purchased.weeksSpent).toBe(0);
    expect(result.purchased.grantedTransactionIds.sort()).toEqual(['tx1', 'txr']);
    expect(result.revives.tokensRemaining).toBe(1);
    expect(result.revives.tokensSpent).toBe(0);
  });

  it('a linked device that spent locally reflects the server-merged spend on the next (non-first-link) sync', () => {
    const purchased: PurchasedWeeksPool = { weeksRemaining: 15, grantedTransactionIds: ['tx1'], weeksSpent: 5 };
    const server: ServerEntitlements = { ...emptyServer, weeksGranted: 20, weeksSpent: 5, transactionIds: ['tx1'] };

    const result = mergeEntitlements(purchased, initialRevivePool(), server, { firstLink: false });

    expect(result.purchased.weeksRemaining).toBe(15);
    expect(result.purchased.weeksSpent).toBe(5);
  });

  it('first-link with local ahead of server takes the max — never loses balance to an unlinked server', () => {
    // Local device has spent nothing yet and the server hasn't heard of this transaction at all.
    const purchased: PurchasedWeeksPool = { weeksRemaining: 20, grantedTransactionIds: ['tx-local-only'], weeksSpent: 0 };

    const result = mergeEntitlements(purchased, initialRevivePool(), emptyServer, { firstLink: true });

    expect(result.purchased.weeksRemaining).toBe(20);
    // Union keeps the locally-known transaction even though the server has never seen it.
    expect(result.purchased.grantedTransactionIds).toContain('tx-local-only');
  });

  it('already-linked with server ahead (a spend on another device) takes the server value plainly', () => {
    // This device still thinks it has 15; another device spent more and pushed weeksSpent=10.
    const purchased: PurchasedWeeksPool = { weeksRemaining: 15, grantedTransactionIds: ['tx1'], weeksSpent: 5 };
    const server: ServerEntitlements = { ...emptyServer, weeksGranted: 20, weeksSpent: 10, transactionIds: ['tx1'] };

    const result = mergeEntitlements(purchased, initialRevivePool(), server, { firstLink: false });

    expect(result.purchased.weeksRemaining).toBe(10);
    expect(result.purchased.weeksSpent).toBe(10);
  });

  it('an empty server account merges to an empty pool without throwing', () => {
    const result = mergeEntitlements(initialPurchasedWeeksPool(), initialRevivePool(), emptyServer, {
      firstLink: true,
    });

    expect(result.purchased.weeksRemaining).toBe(0);
    expect(result.revives.tokensRemaining).toBe(0);
  });

  it('is idempotent — re-syncing the same server response twice is a no-op', () => {
    const server: ServerEntitlements = { ...emptyServer, weeksGranted: 20, weeksSpent: 3, transactionIds: ['tx1'] };

    const once = mergeEntitlements(initialPurchasedWeeksPool(), initialRevivePool(), server, { firstLink: true });
    const twice = mergeEntitlements(once.purchased, once.revives, server, { firstLink: false });

    expect(twice.purchased.weeksRemaining).toBe(once.purchased.weeksRemaining);
    expect(twice.purchased.grantedTransactionIds.sort()).toEqual(once.purchased.grantedTransactionIds.sort());
  });

  it('a transaction id the server does not know about survives the merge (union, never replace)', () => {
    const purchased: PurchasedWeeksPool = {
      weeksRemaining: 5,
      grantedTransactionIds: ['tx-not-yet-pushed'],
      weeksSpent: 0,
    };
    const server: ServerEntitlements = { ...emptyServer, weeksGranted: 20, weeksSpent: 0, transactionIds: ['tx-server-only'] };

    const result = mergeEntitlements(purchased, initialRevivePool(), server, { firstLink: false });

    // This is the case that catches replace-instead-of-union: a naive
    // `grantedTransactionIds: server.transactionIds` would drop
    // `tx-not-yet-pushed`, and the next launch reconciliation would credit
    // it a second time.
    expect(result.purchased.grantedTransactionIds.sort()).toEqual(['tx-not-yet-pushed', 'tx-server-only']);
  });

  it('unions the same server transaction ids into both the weeks and revive ledgers', () => {
    const server: ServerEntitlements = { ...emptyServer, transactionIds: ['tx-weeks', 'tx-revive'] };

    const result = mergeEntitlements(initialPurchasedWeeksPool(), initialRevivePool(), server, { firstLink: true });

    expect(result.purchased.grantedTransactionIds.sort()).toEqual(['tx-revive', 'tx-weeks']);
    expect(result.revives.grantedTransactionIds.sort()).toEqual(['tx-revive', 'tx-weeks']);
  });
});
