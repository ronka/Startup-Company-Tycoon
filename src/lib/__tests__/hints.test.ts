import { describe, expect, it } from 'vitest';

import { ALL_HINTS_RETIRED_ID, hintsRetired, pickActiveHint, type HintDef } from '@/lib/hints';

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

  it('shows nothing once the pass is retired, even for hints never seen', () => {
    // The whole point of the sentinel: a second company gets no tutoring, and
    // it must not depend on which individual hints the first run happened to
    // surface (a short first run may never have reached the money tab).
    expect(pickActiveHint(HQ, new Set([ALL_HINTS_RETIRED_ID]))).toBeUndefined();
    expect(pickActiveHint(HQ, new Set([ALL_HINTS_RETIRED_ID, 'hq']))).toBeUndefined();
  });

  it('keeps showing hints while the pass is live', () => {
    expect(pickActiveHint(HQ, new Set(['hq']))?.id).toBe('runway-short');
  });
});

describe('hintsRetired', () => {
  it('is false for a fresh player and for any ordinary seen hint', () => {
    expect(hintsRetired(new Set())).toBe(false);
    expect(hintsRetired(new Set(['hq', 'market', 'team']))).toBe(false);
  });

  it('is true once the sentinel is present', () => {
    expect(hintsRetired(new Set([ALL_HINTS_RETIRED_ID]))).toBe(true);
  });

  it('uses an id no real hint could collide with', () => {
    // Real ids are kebab-case slugs; the sentinel is double-underscored so a
    // future hint can never accidentally retire the entire pass.
    expect(ALL_HINTS_RETIRED_ID.startsWith('__')).toBe(true);
  });
});
