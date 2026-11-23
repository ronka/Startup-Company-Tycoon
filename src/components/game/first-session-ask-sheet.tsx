import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * The first-session notification soft ask: one plain question before iOS's
 * one-shot permission dialog, so the dialog only ever appears to a player who
 * just said yes. Shown once per install (see `first-session-ask.ts`).
 *
 * Saying yes only closes the sheet. The chrome mounts the OS ask from
 * `onDismissed`, once the sheet has finished sliding away — presenting the
 * system dialog into the sheet's dismissal frame hangs iOS
 * (docs/bug-stuck-decision-modal.md).
 */
export function FirstSessionAskSheet({
  visible,
  companyName,
  onAccept,
  onDecline,
  onDismissed,
}: {
  visible: boolean;
  companyName: string;
  onAccept: () => void;
  onDecline: () => void;
  /** The sheet has finished animating away (iOS). */
  onDismissed?: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onDecline} onDismissed={onDismissed}>
      <View style={styles.header}>
        <ThemedText type="sheetTitle">Your investors check in every morning — want a heads-up?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          We&apos;ll nudge you when there&apos;s news at {companyName} and when your weeks are back. Nothing else.
        </ThemedText>
      </View>
      <PrimaryButton label="Yes, keep me posted" onPress={onAccept} />
      <PrimaryButton label="Not now" variant="ghost" onPress={onDecline} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
});
