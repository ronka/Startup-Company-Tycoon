import { describe, expect, it } from 'vitest';

import { pickActiveHint, type HintDef } from '@/lib/hints';

const HQ: HintDef[] = [
  { id: 'hq', text: 'top bar' },
  { id: 'runway-short', text: 'raise soon', when: true },
  { id: 'drawer-glossary', text: 'glossary', when: true },
];

describe('pickActiveHint', () => {
  it('shows the highest-priority unseen hint, not whichever loaded first', () => {
    expect(pickActiveHint(HQ, new Set())?.id).toBe('hq');
  });

  it('advances to the next hint once the holder is dismissed', () => {
    // The regression this guards: the old slot latched its holder in an effect
    // and never re-claimed, so dismissing the holder showed nothing at all.
    expect(pickActiveHint(HQ, new Set(['hq']))?.id).toBe('runway-short');
    expect(pickActiveHint(HQ, new Set(['hq', 'runway-short']))?.id).toBe('drawer-glossary');
  });

  it('skips ineligible hints without consuming the slot', () => {
    const hints: HintDef[] = [
      { id: 'runway-short', text: 'raise soon', when: false },
      { id: 'drawer-glossary', text: 'glossary', when: true },
    ];
    expect(pickActiveHint(hints, new Set())?.id).toBe('drawer-glossary');
  });

  it('treats a missing `when` as always eligible', () => {
    expect(pickActiveHint([{ id: 'market', text: 'rivals' }], new Set())?.id).toBe('market');
  });

  it('returns undefined once every hint is seen or ineligible', () => {
    expect(pickActiveHint(HQ, new Set(['hq', 'runway-short', 'drawer-glossary']))).toBeUndefined();
    expect(pickActiveHint([{ id: 'a', text: 'a', when: false }], new Set())).toBeUndefined();
  });

  it('re-offers a hint whose condition flips back on, while it is still unseen', () => {
    const off: HintDef[] = [{ id: 'runway-short', text: 'raise soon', when: false }];
    const on: HintDef[] = [{ id: 'runway-short', text: 'raise soon', when: true }];
    expect(pickActiveHint(off, new Set())).toBeUndefined();
    expect(pickActiveHint(on, new Set())?.id).toBe('runway-short');
    expect(pickActiveHint(on, new Set(['runway-short']))).toBeUndefined();
  });
});
