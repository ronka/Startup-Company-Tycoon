import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { FirstRunHint } from '@/components/game/first-run-hint';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { NewsEntry } from '@/game/events/types';
import { formatMoney } from '@/lib/format';

export interface RivalShareMove {
  name: string;
  delta: number;
}

/**
 * "This Week" recap shown once per tick, after any decision card (if drawn)
 * has been answered. Always has at least the cash/revenue summary, plus
 * whatever digest/news entries landed this week.
 */
export function WeekInReviewSheet({
  visible,
  week,
  cashDelta,
  revenue,
  burn,
  moraleDelta,
  yourShareDelta,
  rivalShares,
  entries,
  onDismiss,
}: {
  visible: boolean;
  week: number;
  cashDelta: number;
  revenue: number;
  burn: number;
  moraleDelta: number;
  yourShareDelta: number;
  rivalShares: RivalShareMove[];
  entries: NewsEntry[];
  onDismiss: () => void;
}) {
  const isProfitable = revenue >= burn;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <ThemedText type="smallBold">Week {week}</ThemedText>

          <FirstRunHint id="first-week-review" text="Every week ends like this — what changed, and why." />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <SummaryRow
              label="Cash"
              value={`${cashDelta >= 0 ? '+' : ''}${formatMoney(cashDelta)}`}
              good={cashDelta >= 0}
            />
            <SummaryRow
              label="Revenue vs burn"
              value={`${formatMoney(revenue)} vs ${formatMoney(burn)}`}
              good={isProfitable}
            />
            {Math.round(moraleDelta) !== 0 ? (
              <SummaryRow
                label="Morale"
                value={`${moraleDelta > 0 ? '+' : ''}${Math.round(moraleDelta)}`}
                good={moraleDelta >= 0}
              />
            ) : null}
            {Math.abs(yourShareDelta) >= 0.001 ? (
              <SummaryRow
                label="Your market share"
                value={`${yourShareDelta > 0 ? '+' : ''}${(yourShareDelta * 100).toFixed(1)}%`}
                good={yourShareDelta >= 0}
              />
            ) : null}
            {rivalShares
              .filter((r) => Math.abs(r.delta) >= 0.001)
              .map((r) => (
                <SummaryRow
                  key={r.name}
                  label={r.name}
                  value={`${r.delta > 0 ? '+' : ''}${(r.delta * 100).toFixed(1)}%`}
                  good={r.delta <= 0}
                />
              ))}

            {entries.some((entry) => entry.kind === 'era')
              ? entries
                  .filter((entry) => entry.kind === 'era')
                  .map((entry, index) => (
                    <View key={`era-${index}`} style={styles.eraBeat}>
                      <ThemedText type="smallBold" style={styles.eraBeatTitle}>
                        {entry.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.eraBeatTitle}>
                        {entry.flavor}
                      </ThemedText>
                    </View>
                  ))
              : null}

            {entries.filter((entry) => entry.kind !== 'era').length > 0 ? (
              <View style={styles.entries}>
                {entries
                  .filter((entry) => entry.kind !== 'era')
                  .map((entry, index) => (
                    <View key={`${entry.title}-${index}`} style={styles.entryCard}>
                      <ThemedText type="smallBold">{entry.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {entry.flavor}
                      </ThemedText>
                    </View>
                  ))}
              </View>
            ) : null}
          </ScrollView>

          <PrimaryButton label="Continue" onPress={onDismiss} />
        </ThemedView>
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={good ? 'success' : 'danger'}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entries: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  entryCard: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.half,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  eraBeat: {
    borderRadius: Spacing.two,
    borderWidth: 2,
    borderColor: '#a855f7',
    padding: Spacing.three,
    gap: Spacing.half,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  eraBeatTitle: {
    textAlign: 'center',
  },
});
