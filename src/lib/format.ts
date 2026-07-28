/** Presentation helpers. Kept out of `src/game/` since formatting is a UI concern. */

/** Compact currency: 1_200_000 → "$1.2M", -5_000 → "-$5K". */
export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1e3)}K`;
  if (abs >= 1_000) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Runway weeks → "12 wk" or "∞". */
export function formatWeeks(weeks: number): string {
  if (!Number.isFinite(weeks)) return '∞';
  return `${Math.max(0, Math.floor(weeks))} wk`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A `dateKey` (local 'YYYY-MM-DD', see `src/state/week-budget.ts`) → "Jul 26",
 * or "Jul 26, 2025" once the year differs from `now`.
 *
 * Parsed by hand rather than through `new Date(key)`: the Date constructor
 * reads a bare ISO date as UTC midnight, which renders as the *previous* day
 * everywhere west of Greenwich — turning a run finished tonight into yesterday's.
 * Unparseable input is returned untouched rather than shown as "NaN".
 */
export function formatDateKey(key: string, now: Date = new Date()): string {
  const [year, month, day] = key.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return key;
  const name = MONTHS[month - 1];
  if (!name) return key;
  const label = `${name} ${day}`;
  return year === now.getFullYear() ? label : `${label}, ${year}`;
}

/** Compact whole-number count: 1_200 → "1.2K", 400 → "400". */
export function formatCount(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1e3)}K`;
  if (abs >= 1_000) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}
