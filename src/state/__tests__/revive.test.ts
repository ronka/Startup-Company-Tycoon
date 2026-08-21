import { describe, expect, it } from 'vitest';

import {
  canRedeemRevive,
  consumeReviveToken,
  creditReviveTransaction,
  creditReviveTransactions,
  grantReviveToken,
  initialRevivePool,
} from '../revive';

describe('revive pool', () => {
  it('starts empty', () => {
    expect(initialRevivePool()).toEqual({ tokensRemaining: 0, grantedTransactionIds: [], tokensSpent: 0 });
  });

  it('credits a transaction exactly once (idempotent per tx id)', () => {
    let pool = initialRevivePool();
    pool = creditReviveTransaction(pool, 'txr');
    expect(pool.tokensRemaining).toBe(1);
    expect(pool.grantedTransactionIds).toEqual(['txr']);

    // Re-crediting the same transaction is a no-op — no double grant.
    const same = creditReviveTransaction(pool, 'txr');
    expect(same).toBe(pool);
    expect(same.tokensRemaining).toBe(1);
  });

  it('credits a batch, skipping already-granted ids', () => {
    const pool = creditReviveTransactions(initialRevivePool(), ['a', 'b', 'a']);
    expect(pool.tokensRemaining).toBe(2);
    expect(pool.grantedTransactionIds).toEqual(['a', 'b']);
  });

  it('consumes a token and floors at zero', () => {
    let pool = grantReviveToken(initialRevivePool());
    expect(canRedeemRevive(pool)).toBe(true);
    pool = consumeReviveToken(pool);
    expect(pool.tokensRemaining).toBe(0);
    expect(canRedeemRevive(pool)).toBe(false);
    // Consuming an empty pool never goes negative, and never inflates the spend counter.
    expect(consumeReviveToken(pool).tokensRemaining).toBe(0);
    expect(consumeReviveToken(pool).tokensSpent).toBe(1);
  });

  it('keeps the ledger when a token is consumed (a spent revive is not re-grantable)', () => {
    const credited = creditReviveTransaction(initialRevivePool(), 'txr');
    const spent = consumeReviveToken(credited);
    expect(spent.tokensRemaining).toBe(0);
    expect(spent.grantedTransactionIds).toEqual(['txr']);
    expect(spent.tokensSpent).toBe(1);
    // Reconciling the same transaction again grants nothing.
    expect(creditReviveTransaction(spent, 'txr')).toBe(spent);
  });

  it('increments tokensSpent, defaulting an unset counter to 0 for pre-existing installs', () => {
    // Simulates a pool persisted before this field existed.
    const legacy = { tokensRemaining: 2, grantedTransactionIds: ['a', 'b'] } as ReturnType<typeof initialRevivePool>;
    const once = consumeReviveToken(legacy);
    expect(once.tokensSpent).toBe(1);
    const twice = consumeReviveToken(once);
    expect(twice.tokensSpent).toBe(2);
    expect(twice.tokensRemaining).toBe(0);
  });

  it('preserves tokensSpent across a credit — a purchase must never reset how much was already spent', () => {
    const spent = consumeReviveToken(grantReviveToken(initialRevivePool()));
    expect(spent.tokensSpent).toBe(1);
    const credited = creditReviveTransaction(spent, 'tx1');
    expect(credited.tokensSpent).toBe(1);
    expect(credited.tokensRemaining).toBe(1);
  });
});
