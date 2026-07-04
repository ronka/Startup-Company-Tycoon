import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

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
  explainer,
  onPress,
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
  /** One-sentence "what feeds it, what it feeds" explainer, revealed on tap. */
  explainer?: string;
  /** When provided, tapping the tile calls this instead of toggling the explainer. */
  onPress?: () => void;
}) {
  const [explainerOpen, setExplainerOpen] = useState(false);
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
    <Pressable
      onPress={onPress ?? (() => explainer && setExplainerOpen((open) => !open))}
      accessibilityRole={onPress || explainer ? 'button' : undefined}
      accessibilityLabel={onPress || explainer ? `${label}: tap for details` : undefined}
      style={styles.pressable}>
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
        {explainerOpen && explainer ? (
          <ThemedText type="small" themeColor={alert ? 'danger' : 'textSecondary'} style={styles.explainer}>
            {explainer}
          </ThemedText>
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
  },
  tile: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  value: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  explainer: {
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
