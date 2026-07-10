import { describe, expect, it } from 'vitest';

import { shortIdFromProductIdentifier, weeksForProduct } from '../product-weeks';
import { WEEK_PACKS } from '../stub';

describe('weeksForProduct', () => {
  it('maps each catalog product identifier to its weeks', () => {
    for (const pack of WEEK_PACKS) {
      expect(weeksForProduct(`com.ronkaa.startuptycoon.${pack.id}`)).toBe(pack.weeks);
    }
  });

  it('returns undefined for an unknown product', () => {
    expect(weeksForProduct('com.ronkaa.startuptycoon.unrelated')).toBeUndefined();
  });
});

describe('shortIdFromProductIdentifier', () => {
  it('strips the bundle-id prefix', () => {
    expect(shortIdFromProductIdentifier('com.ronkaa.startuptycoon.weeks20')).toBe('weeks20');
  });

  it('round-trips with weeksForProduct for every catalog pack', () => {
    for (const pack of WEEK_PACKS) {
      const productId = `com.ronkaa.startuptycoon.${pack.id}`;
      expect(shortIdFromProductIdentifier(productId)).toBe(pack.id);
    }
  });

  it('returns the input unchanged when the prefix does not match', () => {
    expect(shortIdFromProductIdentifier('some.other.product')).toBe('some.other.product');
  });
});
