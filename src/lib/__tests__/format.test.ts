import { describe, expect, it } from 'vitest';

import { formatDateKey } from '../format';

const now = new Date(2026, 6, 28); // 28 Jul 2026, local

describe('formatDateKey', () => {
  it('renders a key from the current year without the year', () => {
    expect(formatDateKey('2026-07-26', now)).toBe('Jul 26');
  });

  it('appends the year once it differs from now', () => {
    expect(formatDateKey('2025-12-31', now)).toBe('Dec 31, 2025');
  });

  it('drops the leading zero from single-digit days and handles both edge months', () => {
    expect(formatDateKey('2026-01-05', now)).toBe('Jan 5');
    expect(formatDateKey('2026-12-01', now)).toBe('Dec 1');
  });

  it('keeps the calendar day the player saw, regardless of the machine timezone', () => {
    // `new Date('2026-07-26')` parses as UTC midnight and renders as Jul 25 in
    // any negative-offset zone. The manual parse must not do that — this is the
    // whole reason the helper exists.
    const key = '2026-07-26';
    expect(formatDateKey(key, now)).toBe('Jul 26');
    expect(formatDateKey(key, now)).not.toContain('25');
  });

  it('returns unparseable input untouched rather than showing NaN', () => {
    expect(formatDateKey('', now)).toBe('');
    expect(formatDateKey('not-a-date', now)).toBe('not-a-date');
    expect(formatDateKey('2026-13-01', now)).toBe('2026-13-01');
  });
});
