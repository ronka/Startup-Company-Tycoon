import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { unlockConditionFor, type Feature } from '@/game/unlocks';

/**
 * Stands in for a feature a guided run hasn't unlocked yet: its name, a lock,
 * and when it opens. Never an instruction — the quest strip does the guiding.
 */
export function LockedFeature({ feature, title }: { feature: Feature; title: string }) {
  return (
    <Card style={styles.card} accessibilityLabel={`${title}, locked. ${unlockConditionFor(feature)}.`}>
      <ThemedText style={styles.lock}>🔒</ThemedText>
      <View style={styles.text}>
        <ThemedText type="smallBold" themeColor="textSecondary">{title}</ThemedText>
        <ThemedText type="small" themeColor="textMuted">{unlockConditionFor(feature)}</ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + Spacing.one },
  lock: { fontSize: 20 },
  text: { flex: 1, gap: Spacing.half },
});
