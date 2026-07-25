import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import type { TomorrowAgenda } from '@/state/day-close';

/**
 * The end-of-day beat: shown once per local day when the week budget runs out,
 * in place of the footer's plain full stop. Names the run's score-in-progress
 * and the one concrete thing waiting tomorrow, so the day closes on a reason to
 * come back rather than on a locked door.
 *
 * Tone is fixed by PRD F12 (`plans/prd-endgame-and-depth.md`): diegetic, never
 * an energy meter, never a countdown, never guilt — and always dismissible,
 * since the daily limit is a pacing device and not a gate to pay past.
 */
export function DayCompleteSheet({
  visible,
  companyName,
  week,
  stake,
  agenda,
  onBuyWeeks,
  onDismiss,
}: {
  visible: boolean;
  companyName: string;
  week: number;
  /** Founder take-home at the current valuation — the run's score-in-progress. */
  stake: number;
  agenda: TomorrowAgenda | null;
  /** Present only where real purchases work; omit to render no purchase affordance. */
  onBuyWeeks?: () => void;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onDismiss}>
      <View style={styles.header}>
        <ThemedText type="title">That&apos;s the week planned out</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {companyName} — week {week}
        </ThemedText>
      </View>

      {/* The number worth protecting overnight — the run's score so far, not a
          spent-resource readout. */}
      <View style={styles.stake}>
        <ThemedText type="small" themeColor="textSecondary">
          Your stake
        </ThemedText>
        <ThemedText type="title">{formatMoney(stake)}</ThemedText>
      </View>

      {agenda ? (
        <View style={styles.agenda}>
          <ThemedText type="small" themeColor="textSecondary">
            Tomorrow
          </ThemedText>
          <ThemedText type="smallBold">{agenda.line}</ThemedText>
        </View>
      ) : null}

      <PrimaryButton label="See you tomorrow" onPress={onDismiss} />
      {onBuyWeeks ? <PrimaryButton label="Keep playing" variant="secondary" onPress={onBuyWeeks} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.half,
  },
  stake: {
    gap: Spacing.half,
  },
  agenda: {
    gap: Spacing.half,
  },
});
