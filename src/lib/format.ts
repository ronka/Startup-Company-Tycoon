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

/** Compact whole-number count: 1_200 → "1.2K", 400 → "400". */
export function formatCount(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1e3)}K`;
  if (abs >= 1_000) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}
