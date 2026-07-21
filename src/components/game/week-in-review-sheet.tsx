import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
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
    <BottomSheet visible={visible} onClose={onDismiss} title={`Week ${week}`}>
      <FirstRunHint id="first-week-review" text="Every week ends like this — what changed, and why." />

      <View style={styles.summary}>
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
                <Card key={`era-${index}`} tone="accent" style={styles.eraBeat}>
                  <ThemedText type="smallBold" style={styles.eraBeatTitle}>
                    {entry.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.eraBeatTitle}>
                    {entry.flavor}
                  </ThemedText>
                </Card>
              ))
          : null}

        {entries.filter((entry) => entry.kind !== 'era').length > 0 ? (
          <View style={styles.entries}>
            {entries
              .filter((entry) => entry.kind !== 'era')
              .map((entry, index) => (
                <Card key={`${entry.title}-${index}`} style={styles.entryCard}>
                  <ThemedText type="smallBold">{entry.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {entry.flavor}
                  </ThemedText>
                </Card>
              ))}
          </View>
        ) : null}
      </View>

      <PrimaryButton label="Continue" onPress={onDismiss} />
    </BottomSheet>
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
  summary: {
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
    borderRadius: Radius.md,
    gap: Spacing.half,
  },
  eraBeat: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  eraBeatTitle: {
    textAlign: 'center',
  },
});
