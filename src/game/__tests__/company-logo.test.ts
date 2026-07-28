import { describe, expect, it } from 'vitest';

import { COMPANY_LOGO_SUGGESTIONS, randomCompanyLogo, sanitizeCompanyLogo } from '../company-logo';

describe('sanitizeCompanyLogo', () => {
  it('accepts a plain emoji', () => {
    expect(sanitizeCompanyLogo('🚀')).toBe('🚀');
  });

  it('keeps the last emoji when several are typed', () => {
    expect(sanitizeCompanyLogo('🚀💡')).toBe('💡');
  });

  it('keeps a ZWJ sequence whole', () => {
    expect(sanitizeCompanyLogo('👨‍👩‍👧')).toBe('👨‍👩‍👧');
  });

  it('keeps a skin-tone modifier attached', () => {
    expect(sanitizeCompanyLogo('👍🏽')).toBe('👍🏽');
  });

  it('keeps both halves of a flag', () => {
    expect(sanitizeCompanyLogo('🇮🇱')).toBe('🇮🇱');
  });

  it('rejects plain text', () => {
    expect(sanitizeCompanyLogo('Wix')).toBeNull();
  });

  it('rejects an emoji followed by words', () => {
    expect(sanitizeCompanyLogo('🚀 hello')).toBeNull();
  });

  it('returns null for empty and whitespace-only input', () => {
    expect(sanitizeCompanyLogo('')).toBeNull();
    expect(sanitizeCompanyLogo('   ')).toBeNull();
  });

  it('rejects a pathological ZWJ chain', () => {
    const chain = Array.from({ length: 20 }, () => '🚀').join('‍');
    expect(sanitizeCompanyLogo(chain)).toBeNull();
  });

  // The two cases the code-point range table decides for us, pinned so a range
  // edit shows up as a test change rather than a surprise on device.
  it('rejects keycaps, whose base is an ASCII digit', () => {
    expect(sanitizeCompanyLogo('1️⃣')).toBeNull();
  });

  it('accepts dingbat-range glyphs like ★', () => {
    expect(sanitizeCompanyLogo('★')).toBe('★');
  });

  it('drops a dangling ZWJ rather than saving an invisible code point', () => {
    expect(sanitizeCompanyLogo('🚀‍')).toBe('🚀');
  });
});

describe('randomCompanyLogo', () => {
  it('picks from the suggestion list', () => {
    expect(randomCompanyLogo(undefined, () => 0)).toBe(COMPANY_LOGO_SUGGESTIONS[0]);
    expect(COMPANY_LOGO_SUGGESTIONS).toContain(randomCompanyLogo(undefined, () => 0.99));
  });

  it('never returns the emoji already showing', () => {
    // Lowest and highest draws both land elsewhere, so no roll can repeat it.
    const current = COMPANY_LOGO_SUGGESTIONS[0];
    expect(randomCompanyLogo(current, () => 0)).not.toBe(current);
    expect(randomCompanyLogo(current, () => 0.99)).not.toBe(current);
  });

  it('only suggests emoji the sanitizer accepts', () => {
    for (const emoji of COMPANY_LOGO_SUGGESTIONS) {
      expect(sanitizeCompanyLogo(emoji)).toBe(emoji);
    }
  });
});
