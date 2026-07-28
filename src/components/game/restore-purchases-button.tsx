import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { purchasesAvailable } from '@/purchases';
import { useGame } from '@/state/game-store';

/**
 * The "Restore Purchases" control App Review expects on every surface that
 * sells something, plus in Settings (Guideline 3.1.1). One component so all
 * three placements report identically — a reviewer who taps it in Settings and
 * again on the paywall must not get two different behaviours.
 *
 * It renders nothing where real purchases can't happen (`purchasesAvailable`:
 * web, Expo Go, Android), matching how the paywalls themselves are gated — a
 * restore button that can only ever say "nothing to restore" is worse than no
 * button.
 *
 * All three outcomes are surfaced honestly and distinctly, because a restore
 * that silently does nothing is one of the most common IAP rejection reasons:
 * something was restored, the store answered but owed nothing, or the store
 * couldn't be reached at all. Only the last is an error.
 */
export function RestorePurchasesButton({
  source,
  label = 'Restore purchases',
  variant = 'ghost',
  onRestored,
}: {
  /** Which surface this instance lives on — recorded on the analytics events. */
  source: 'settings' | 'buy_weeks_sheet' | 'game_over';
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Called after a restore that actually credited something, so a paywall can close itself. */
  onRestored?: (weeks: number, revives: number) => void;
}) {
  const { restorePurchases } = useGame();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'muted' | 'danger' } | null>(null);

  if (!purchasesAvailable) return null;

  const handlePress = () => {
    setMessage(null);
    setPending(true);
    track(EVENTS.PURCHASE_RESTORE_STARTED, { source });
    restorePurchases()
      .then((outcome) => {
        setPending(false);
        if (outcome.status === 'error') {
          track(EVENTS.PURCHASE_RESTORE_FAILED, { source });
          setMessage({ text: "Couldn't reach the App Store — try again.", tone: 'danger' });
          return;
        }
        if (outcome.status === 'nothing') {
          track(EVENTS.PURCHASE_RESTORE_COMPLETED, { source, outcome: 'nothing', weeks: 0, revives: 0 });
          setMessage({ text: 'No purchases to restore on this Apple ID.', tone: 'muted' });
          return;
        }
        track(EVENTS.PURCHASE_RESTORE_COMPLETED, {
          source,
          outcome: 'restored',
          weeks: outcome.weeks,
          revives: outcome.revives,
        });
        setMessage({ text: `Restored ${describeRestored(outcome.weeks, outcome.revives)}.`, tone: 'success' });
        onRestored?.(outcome.weeks, outcome.revives);
      })
      .catch(() => {
        setPending(false);
        track(EVENTS.PURCHASE_RESTORE_FAILED, { source });
        setMessage({ text: "Couldn't reach the App Store — try again.", tone: 'danger' });
      });
  };

  return (
    <>
      <PrimaryButton label={label} variant={variant} loading={pending} disabled={pending} onPress={handlePress} />
      {message ? (
        <ThemedText
          type="small"
          themeColor={message.tone === 'success' ? 'success' : message.tone === 'danger' ? 'danger' : 'textSecondary'}
          style={styles.message}>
          {message.text}
        </ThemedText>
      ) : null}
    </>
  );
}

/** "20 weeks", "1 bailout", or "20 weeks and 1 bailout" — whichever actually came back. */
function describeRestored(weeks: number, revives: number): string {
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
  if (revives > 0) parts.push(`${revives} ${revives === 1 ? 'bailout' : 'bailouts'}`);
  return parts.join(' and ');
}

const styles = StyleSheet.create({
  message: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
});
