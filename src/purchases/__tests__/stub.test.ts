import { describe, expect, it } from 'vitest';

import { stubPurchasesClient, WEEK_PACKS } from '../stub';

describe('stubPurchasesClient', () => {
  it('returns the two hardcoded week packs', async () => {
    const packs = await stubPurchasesClient.getPacks();
    expect(packs).toEqual(WEEK_PACKS);
    expect(packs.map((p) => p.weeks)).toEqual([20, 60]);
  });

  it('purchasePack completes instantly with the pack\'s week count and a transaction id', async () => {
    const result = await stubPurchasesClient.purchasePack('weeks20');
    expect(result.status).toBe('success');
    expect(result).toMatchObject({ status: 'success', weeksGranted: 20 });
    expect((result as { transactionId: string }).transactionId).toBeTruthy();
  });

  it('purchasePack errors on an unknown pack id', async () => {
    const result = await stubPurchasesClient.purchasePack('nope');
    expect(result).toEqual({ status: 'error', code: 'unknown' });
  });
});
