import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/format';

/**
 * Compact one-line recap for a quiet week (nothing crossed a notable
 * threshold — see `isNotableWeek` in `digest.ts`) — a lighter-weight
 * alternative to the full `WeekInReviewSheet`, tap-to-dismiss rather than a
 * blocking modal.
 */
export function WeekTicker({
  week,
  cashDelta,
  revenue,
  burn,
  onDismiss,
}: {
  week: number;
  cashDelta: number;
  revenue: number;
  burn: number;
  onDismiss: () => void;
}) {
  const isProfitable = revenue >= burn;
  return (
    <Pressable onPress={onDismiss} accessibilityRole="button">
      <ThemedView type="backgroundElement" style={styles.ticker}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          Week {week} — {cashDelta >= 0 ? '+' : ''}
          {formatMoney(cashDelta)} cash · {isProfitable ? 'profitable' : 'in the red'}
        </ThemedText>
        <View style={styles.dismiss}>
          <ThemedText type="small" themeColor="textSecondary">
            ✕
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  text: {
    flexShrink: 1,
  },
  dismiss: {
    paddingLeft: Spacing.two,
  },
});
