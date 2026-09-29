import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import type { ActionNow } from '@/state/day-close';

/** Tab names for `ActionNow['href']`, as the tab bar labels them. */
const DESTINATION_LABEL: Record<ActionNow['href'], string> = {
  '/money': 'Money',
};

/**
 * The 💡 "While you wait" row: one thing the player can still do with no weeks
 * left today, and a one-tap jump to where it's done. Kept visually apart from
 * the "Tomorrow" line and the countdown so it reads as an action, not a teaser.
 */
export function ActionTip({ action, onPress }: { action: ActionNow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${action.line} Open ${DESTINATION_LABEL[action.href]}`}>
      {({ pressed }) => (
        <ThemedView type="surfaceRaised" style={[styles.tip, pressed && styles.pressed]}>
          <ThemedText type="small" style={styles.icon}>
            💡
          </ThemedText>
          <ThemedText type="small" style={styles.text}>
            <ThemedText type="smallBold">While you wait: </ThemedText>
            {action.line}
          </ThemedText>
          <ThemedText type="smallBold" themeColor="accent">
            {DESTINATION_LABEL[action.href]} →
          </ThemedText>
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    lineHeight: 18,
  },
  text: {
    flex: 1,
    lineHeight: 18,
  },
});
