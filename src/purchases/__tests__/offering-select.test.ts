import { describe, expect, it } from 'vitest';

import {
  CLIFFHANGER_OFFERING_KEY,
  WEEKS_OFFERING_KEY,
  cheapestPriceTeaser,
  selectWeeksOffering,
  type OfferingsLike,
} from '../offering-select';

const weeks = { id: 'weeks' };
const cliffhanger = { id: 'weeks_cliffhanger' };
const current = { id: 'current' };

function offerings(all: Record<string, { id: string }>, cur: { id: string } | null = current): OfferingsLike<{ id: string }> {
  return { all, current: cur };
}

describe('selectWeeksOffering', () => {
  it('uses weeks_cliffhanger for the cliffhanger trigger when it exists', () => {
    const o = offerings({ [WEEKS_OFFERING_KEY]: weeks, [CLIFFHANGER_OFFERING_KEY]: cliffhanger });
    expect(selectWeeksOffering(o, 'cliffhanger')).toBe(cliffhanger);
  });

  it('falls back to exactly today\'s lookup when weeks_cliffhanger is absent', () => {
    expect(selectWeeksOffering(offerings({ [WEEKS_OFFERING_KEY]: weeks }), 'cliffhanger')).toBe(weeks);
    expect(selectWeeksOffering(offerings({}), 'cliffhanger')).toBe(current);
    expect(selectWeeksOffering(offerings({}, null), 'cliffhanger')).toBeNull();
  });

  it('never uses weeks_cliffhanger for any other trigger', () => {
    const o = offerings({ [WEEKS_OFFERING_KEY]: weeks, [CLIFFHANGER_OFFERING_KEY]: cliffhanger });
    for (const trigger of ['out_of_weeks', 'hud', undefined]) {
      expect(selectWeeksOffering(o, trigger)).toBe(weeks);
    }
  });

  it('keeps the weeks -> current fallback for other triggers', () => {
    expect(selectWeeksOffering(offerings({ [CLIFFHANGER_OFFERING_KEY]: cliffhanger }), 'out_of_weeks')).toBe(current);
  });
});

describe('cheapestPriceTeaser', () => {
  it('quotes the smallest recognised pack', () => {
    expect(
      cheapestPriceTeaser([
        { weeks: 60, priceLabel: '€5,49' },
        { weeks: 20, priceLabel: '€2,29' },
      ]),
    ).toEqual({ weeks: 20, priceLabel: '€2,29' });
  });

  it('skips unrecognised products and empty prices', () => {
    expect(
      cheapestPriceTeaser([
        { weeks: undefined, priceLabel: '$0.99' },
        { weeks: 20, priceLabel: '' },
        { weeks: 60, priceLabel: '$4.99' },
      ]),
    ).toEqual({ weeks: 60, priceLabel: '$4.99' });
  });

  it('is null when nothing is quotable, so the button keeps its plain copy', () => {
    expect(cheapestPriceTeaser([])).toBeNull();
    expect(cheapestPriceTeaser([{ weeks: undefined, priceLabel: '$1.99' }])).toBeNull();
  });
});
