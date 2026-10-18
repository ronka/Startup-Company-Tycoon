import { Pressable, StyleSheet } from 'react-native';

import { Card } from '@/components/game/card';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

/**
 * One of a tab's (at most three) headline numbers: a label, the value and an
 * optional one-line note, in a compact card that sits in a row with its
 * siblings. Fixed height by design — no tap-to-expand explainer — so a tab
 * that fits one screen keeps fitting. With `onPress` the whole tile opens the
 * number's detail (a `›` marks it).
 */
export function HeadlineStat({
  label,
  value,
  note,
  valueColor,
  noteColor = 'textMuted',
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  note?: string;
  valueColor?: ThemedTextProps['themeColor'];
  noteColor?: ThemedTextProps['themeColor'];
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <Card style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
        {onPress ? ' ›' : ''}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={valueColor} numberOfLines={1}>
        {value}
      </ThemedText>
      {note ? (
        <ThemedText type="footnote" themeColor={noteColor} numberOfLines={1}>
          {note}
        </ThemedText>
      ) : null}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}. Show details.`}
      style={styles.pressable}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same shape as HQ's vitals, so the four tabs' headline rows read as one system.
  card: { flex: 1, padding: Spacing.two, paddingHorizontal: Spacing.three, gap: 0, borderRadius: Radius.lg },
  pressable: { flex: 1, flexDirection: 'row' },
});
