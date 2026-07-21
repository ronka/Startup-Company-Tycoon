/** Shared "how healthy is this number" → theme-token mapping. */

import type { ThemeColor } from '@/constants/theme';

/** Morale bands: red under 30, amber under 60, green above. */
export function moraleTone(percent: number): ThemeColor {
  if (percent < 30) return 'danger';
  if (percent < 60) return 'warning';
  return 'success';
}

/** Which token a change should wear, given which direction reads as good. */
export function deltaTone(delta: number, goodDirection: 'up' | 'down' = 'up'): ThemeColor {
  const good = delta > 0 ? goodDirection === 'up' : goodDirection === 'down';
  return good ? 'success' : 'danger';
}
