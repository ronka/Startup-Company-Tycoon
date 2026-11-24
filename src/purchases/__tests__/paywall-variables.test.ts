import { describe, expect, it } from 'vitest';

import {
  MAX_VARIABLE_LENGTH,
  PAYWALL_VARIABLE_DEFAULTS,
  PAYWALL_VARIABLE_KEYS,
  paywallVariablesFor,
  toCustomVariables,
  type CustomVariableFactory,
} from '../paywall-variables';

const card = {
  title: 'First Big Customer',
  teaser: 'A company ten times your size just asked for a call.',
  choiceA: 'Take the deal, crunch the week',
  choiceB: 'Decline, protect the roadmap',
  stakes: "A 2-point slice of the market, and the team's morale, are on the line.",
};

/** Mirrors the SDK's `CustomVariableValue` factories. */
const factory: CustomVariableFactory<{ type: string; value: string | number }> = {
  string: (value) => ({ type: 'string', value }),
  number: (value) => ({ type: 'number', value }),
};

describe('paywallVariablesFor', () => {
  it('passes every variable for the cliffhanger trigger', () => {
    expect(paywallVariablesFor({ companyName: 'Acme', week: 10, card }, 'cliffhanger')).toEqual({
      companyName: 'Acme',
      week: 10,
      ...card,
    });
  });

  it('sends only company and week for other triggers, even with a card pinned', () => {
    for (const trigger of ['out_of_weeks', 'hud']) {
      expect(paywallVariablesFor({ companyName: 'Acme', week: 12, card }, trigger)).toEqual({ companyName: 'Acme', week: 12 });
    }
  });

  it('omits what is missing so RevenueCat falls back to the editor defaults', () => {
    expect(paywallVariablesFor({}, 'cliffhanger')).toEqual({});
    expect(paywallVariablesFor({ companyName: '   ', week: null, card: null }, 'cliffhanger')).toEqual({});
    expect(paywallVariablesFor({ companyName: 'Acme', week: 3, card: { ...card, choiceB: null } }, 'cliffhanger')).not.toHaveProperty('choiceB');
  });

  it('keeps week 0, and drops a negative or non-finite week', () => {
    expect(paywallVariablesFor({ week: 0 }, 'hud')).toEqual({ week: 0 });
    expect(paywallVariablesFor({ week: -1 }, 'hud')).toEqual({});
    expect(paywallVariablesFor({ week: Number.NaN }, 'hud')).toEqual({});
    expect(paywallVariablesFor({ week: 7.9 }, 'hud')).toEqual({ week: 7 });
  });

  it('trims, collapses whitespace, and caps runaway strings', () => {
    const vars = paywallVariablesFor({ companyName: '  Acme \n Corp ', card: { ...card, teaser: 'x'.repeat(500) } }, 'cliffhanger');
    expect(vars.companyName).toBe('Acme Corp');
    expect(vars.teaser!.length).toBe(MAX_VARIABLE_LENGTH);
    expect(vars.teaser!.endsWith('…')).toBe(true);
  });

  it('documents a default for every key', () => {
    expect(Object.keys(PAYWALL_VARIABLE_DEFAULTS).sort()).toEqual([...PAYWALL_VARIABLE_KEYS].sort());
  });
});

describe('toCustomVariables', () => {
  it('maps week to a number and everything else to strings, with the exact keys', () => {
    const out = toCustomVariables(paywallVariablesFor({ companyName: 'Acme', week: 20, card }, 'cliffhanger'), factory);
    expect(out).toEqual({
      companyName: { type: 'string', value: 'Acme' },
      week: { type: 'number', value: 20 },
      title: { type: 'string', value: card.title },
      teaser: { type: 'string', value: card.teaser },
      choiceA: { type: 'string', value: card.choiceA },
      choiceB: { type: 'string', value: card.choiceB },
      stakes: { type: 'string', value: card.stakes },
    });
  });

  it('is undefined when there is nothing to send', () => {
    expect(toCustomVariables({}, factory)).toBeUndefined();
  });

  it('lets a broken factory throw, so the caller can present without variables', () => {
    const broken: CustomVariableFactory<never> = {
      string: () => {
        throw new Error('no custom variables in this SDK');
      },
      number: () => {
        throw new Error('no custom variables in this SDK');
      },
    };
    expect(() => toCustomVariables({ companyName: 'Acme' }, broken)).toThrow();
  });
});
