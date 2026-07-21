import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** Uppercase divider above a list or block, with an optional right-hand action. */
export function SectionHeader({
  label,
  action,
  onPressAction,
}: {
  label: string;
  action?: string;
  onPressAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      {action && onPressAction ? (
        <Pressable onPress={onPressAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={action}>
          <ThemedText type="small">{action}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.one,
  },
});
