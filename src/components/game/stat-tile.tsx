import { StyleSheet } from 'react-native';

import { AnimatedNumber } from '@/components/game/animated-number';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function StatTile({
  label,
  value,
  format,
  previousValue,
  goodDirection = 'up',
  hint,
  alert = false,
}: {
  label: string;
  /** Raw numeric value; formatted for display via `format`. */
  value: number;
  format: (n: number) => string;
  /** Last week's value, for the count-up animation and the ▲/▼ delta badge. Omit to render statically. */
  previousValue?: number;
  /** Which direction of change reads as "good" (green) vs "bad" (red). */
  goodDirection?: 'up' | 'down';
  hint?: string;
  /** Alert-red treatment for stats that need to read as urgent (e.g. while insolvent). */
  alert?: boolean;
}) {
  // Compare formatted strings, not raw floats: a runway of 14.63 vs 14.61
  // both read "14 wk", and a "▼ 0 wk" badge would be more confusing than none.
  const hasDelta =
    previousValue !== undefined &&
    Number.isFinite(previousValue) &&
    Number.isFinite(value) &&
    previousValue !== value &&
    format(value) !== format(previousValue);
  const delta = hasDelta ? value - (previousValue as number) : 0;
  const deltaIsGood = hasDelta && (delta > 0 ? goodDirection === 'up' : goodDirection === 'down');

  return (
    <ThemedView type={alert ? 'dangerBackground' : 'backgroundElement'} style={styles.tile}>
      <ThemedText type="small" themeColor={alert ? 'danger' : 'textSecondary'}>
        {label}
      </ThemedText>
      <AnimatedNumber
        value={value}
        format={format}
        goodDirection={goodDirection}
        style={styles.value}
        themeColor={alert ? 'danger' : undefined}
      />
      {hasDelta ? (
        <ThemedText type="small" themeColor={deltaIsGood ? 'success' : 'danger'}>
          {delta > 0 ? '▲' : '▼'} {format(Math.abs(delta))}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor={alert ? 'danger' : 'textSecondary'}>
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  value: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
});
