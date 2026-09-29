import { StyleSheet, View } from 'react-native';

import { ActionTip } from '@/components/game/action-tip';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import type { ActionNow, TomorrowAgenda } from '@/state/day-close';
import { WEEK_REGEN_MS, WEEKS_BANK_CAP } from '@/state/week-budget';

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
  actionTip,
  onActionTip,
  onBuyWeeks,
  onRemindMe,
  onDismiss,
}: {
  visible: boolean;
  companyName: string;
  week: number;
  /** Founder take-home at the current valuation — the run's score-in-progress. */
  stake: number;
  agenda: TomorrowAgenda | null;
  /** Something still worth doing today (a raise), shown as a tappable 💡 row. */
  actionTip?: ActionNow | null;
  onActionTip?: () => void;
  /** Present only where real purchases work; omit to render no purchase affordance. */
  onBuyWeeks?: () => void;
  /**
   * Present only while the one-shot OS permission ask is still unspent. The
   * system dialog follows this tap and nothing else at the wall, so the player
   * knows what they're agreeing to before iOS asks.
   */
  onRemindMe?: () => void;
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
            Next up
          </ThemedText>
          <ThemedText type="smallBold">{agenda.line}</ThemedText>
        </View>
      ) : null}

      {actionTip && onActionTip ? <ActionTip action={actionTip} onPress={onActionTip} /> : null}

      <ThemedText type="small" themeColor="textSecondary">
        A week comes back every {WEEK_REGEN_MS / 60_000} minutes — a full sprint of {WEEKS_BANK_CAP} in{' '}
        {(WEEKS_BANK_CAP * WEEK_REGEN_MS) / 3_600_000} hours.
      </ThemedText>

      {onRemindMe ? (
        <>
          <PrimaryButton label="Notify me when weeks are back" onPress={onRemindMe} />
          <PrimaryButton label="Back soon" variant="ghost" onPress={onDismiss} />
        </>
      ) : (
        <PrimaryButton label="Back soon" onPress={onDismiss} />
      )}
      {onBuyWeeks ? <PrimaryButton label="Pull an all-nighter" variant="secondary" onPress={onBuyWeeks} /> : null}
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
