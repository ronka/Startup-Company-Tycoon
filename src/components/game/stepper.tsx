import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Stepper({
  label,
  value,
  hint,
  contribution,
  contributionAlert = false,
  onIncrement,
  onDecrement,
}: {
  label: string;
  value: number;
  hint?: string;
  /** Live, formula-derived "what this headcount does" line — e.g. "5 devs → +212 quality/wk". */
  contribution?: string;
  /** Red treatment for the contribution line when this role is visibly falling short (e.g. support coverage). */
  contributionAlert?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.row}>
      {/* Two lines at most — name (with the current count while a change is
          queued) and one line of effect — so three roles fit one screen. */}
      <View style={styles.info}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {label}
          {hint ? (
            <ThemedText type="small" themeColor="textSecondary">
              {'  '}
              {hint}
            </ThemedText>
          ) : null}
        </ThemedText>
        {contribution ? (
          <ThemedText type="small" themeColor={contributionAlert ? 'danger' : 'textSecondary'} numberOfLines={1}>
            {contribution}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          onPress={onDecrement}
          style={({ pressed }) => [
            styles.stepButton,
            { backgroundColor: theme.surfaceRaised },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText style={styles.stepLabel}>−</ThemedText>
        </Pressable>
        <ThemedText style={styles.count}>{value}</ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={onIncrement}
          style={({ pressed }) => [
            styles.stepButton,
            { backgroundColor: theme.surfaceRaised },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText style={styles.stepLabel}>+</ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  info: {
    flex: 1,
    gap: Spacing.half,
  },
  controls: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  stepLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  count: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
});
