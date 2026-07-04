import { Modal, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { weeklyExpensesFor } from '@/game/balance';
import type { GameState } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney } from '@/lib/format';

/**
 * "Where the money goes" modal: decomposes weekly burn into labeled lines
 * (with per-role salary detail) plus the net for the week. Shared by the
 * Money and HQ screens — open it from a Weekly Burn tile's `onPress`.
 */
export function BurnBreakdownModal({
  state,
  visible,
  onClose,
}: {
  state: GameState;
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const expenses = weeklyExpensesFor(state);
  const { burn, revenue } = deriveWeeklyStats(state);
  const net = revenue - burn;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <ThemedView type="backgroundElement" style={styles.modalCard}>
          <ThemedText type="smallBold">Where the money goes</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Week {state.week}
          </ThemedText>
          {expenses.lines.map((line) => (
            <View key={line.label}>
              <View style={styles.expenseRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {line.label}
                </ThemedText>
                <View style={styles.expenseAmountGroup}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {Math.round((line.amount / expenses.total) * 100)}%
                  </ThemedText>
                  <ThemedText type="small">{formatMoney(line.amount)}</ThemedText>
                </View>
              </View>
              {line.detail ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.payrollDetail}>
                  {line.detail.map((d) => `${d.label} · ${formatMoney(d.amount)}`).join('   ')}
                </ThemedText>
              ) : null}
            </View>
          ))}
          <View style={[styles.expenseRow, styles.expenseTotalRow, { borderTopColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Total burn</ThemedText>
            <ThemedText type="smallBold">{formatMoney(expenses.total)}</ThemedText>
          </View>
          <View style={styles.expenseRow}>
            <ThemedText type="smallBold">Net</ThemedText>
            <ThemedText type="smallBold" themeColor={net >= 0 ? 'success' : 'danger'}>
              {formatMoney(net)}
            </ThemedText>
          </View>
          <PrimaryButton variant="secondary" label="Close" onPress={onClose} />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expenseTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.half,
  },
  expenseAmountGroup: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  payrollDetail: {
    marginTop: -Spacing.half,
  },
});
