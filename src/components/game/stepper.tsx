import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function Stepper({
  label,
  value,
  hint,
  onIncrement,
  onDecrement,
}: {
  label: string;
  value: number;
  hint?: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.info}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          onPress={onDecrement}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
          <ThemedText style={styles.stepLabel}>−</ThemedText>
        </Pressable>
        <ThemedText style={styles.count}>{value}</ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={onIncrement}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
          <ThemedText style={styles.stepLabel}>+</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  info: {
    gap: Spacing.half,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3c87f733',
  },
  pressed: {
    opacity: 0.7,
  },
  stepLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3c87f7',
  },
  count: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
});
