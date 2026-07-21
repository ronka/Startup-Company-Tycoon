import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/game/animated-number';
import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function StatTile({
  label,
  value,
  format,
  previousValue,
  goodDirection = 'up',
  hint,
  alert = false,
  explainer,
  icon,
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
  /** SF Symbol (with Material fallbacks) drawn beside the label. */
  icon?: SymbolViewProps['name'];
  /** When provided, tapping the tile calls this instead of toggling the explainer. */
  onPress?: () => void;
}) {
  const theme = useTheme();
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
  const labelColor = alert ? theme.danger : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress ?? (() => explainer && setExplainerOpen((open) => !open))}
      accessibilityRole={onPress || explainer ? 'button' : undefined}
      accessibilityLabel={onPress || explainer ? `${label}: tap for details` : undefined}
      style={styles.pressable}>
      <Card tone={alert ? 'alert' : 'default'} style={styles.tile}>
        <View style={styles.labelRow}>
          {icon ? <SymbolView name={icon} size={16} tintColor={labelColor} /> : null}
          <ThemedText type="small" themeColor={alert ? 'danger' : 'textSecondary'}>
            {label}
          </ThemedText>
        </View>
        <AnimatedNumber
          value={value}
          format={format}
          goodDirection={goodDirection}
          type="cardValue"
          themeColor={alert ? 'danger' : undefined}
        />
        {hasDelta ? (
          <ThemedText type="small" themeColor={deltaIsGood ? 'success' : 'danger'}>
            {delta > 0 ? '▲' : '▼'} {format(Math.abs(delta))}
          </ThemedText>
        ) : hint ? (
          <ThemedText type="small" themeColor={alert ? 'danger' : 'textMuted'}>
            {hint}
          </ThemedText>
        ) : null}
        {explainerOpen && explainer ? (
          <ThemedText type="small" themeColor={alert ? 'danger' : 'textSecondary'} style={styles.explainer}>
            {explainer}
          </ThemedText>
        ) : null}
      </Card>
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
    gap: Spacing.one,
    minHeight: 116,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  explainer: {
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
