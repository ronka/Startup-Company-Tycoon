import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { LegalLinkText } from '@/components/game/legal-links-row';
import { RestorePurchasesButton, type PurchaseSurface } from '@/components/game/restore-purchases-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { purchasesAvailable } from '@/purchases';

/**
 * The compliance block App Review expects on a purchase screen — what the money
 * buys, how to restore it, and the terms it's sold under — as one quiet line
 * rather than a full-width button stacked on a links row stacked on a
 * disclosure, which reads as three more things to do next to the CTA.
 *
 * Owning the whole line here is the point. `RestorePurchasesButton` renders
 * nothing where purchases can't happen (web, Expo Go, Android), so *something*
 * has to drop the separator in front of it or the line ends on a stray `·`.
 * That belongs to a paywall-compliance component, not to the screens: a game-over
 * screen importing `purchasesAvailable` to decide punctuation is how two
 * paywalls drift apart the first time either is retuned.
 */
export function PaywallFooter({
  source,
  disclosure,
  onRestored,
}: {
  source: PurchaseSurface;
  /** What the money buys, e.g. "One-time purchase". Kept short — this is one line. */
  disclosure: string;
  /** Forwarded to the restore control, for a paywall that closes itself once something lands. */
  onRestored?: (weeks: number, revives: number) => void;
}) {
  return (
    <View style={styles.row}>
      <ThemedText type="footnote">{disclosure}</ThemedText>
      {purchasesAvailable ? (
        <Fragment>
          <Separator />
          {/*
            Returns its own outcome message as a sibling here. The row is full
            by this point, so every message ("Restored 1 bailout.", "Couldn't
            reach the App Store — try again.") wraps onto a line of its own
            rather than trailing the links.
          */}
          <RestorePurchasesButton source={source} appearance="link" onRestored={onRestored} />
        </Fragment>
      ) : null}
      <Separator />
      <LegalLinkText link="privacy" source={source} type="footnote" />
      <Separator />
      <LegalLinkText link="terms" source={source} type="footnote" />
    </View>
  );
}

function Separator() {
  return <ThemedText type="footnote">{' · '}</ThemedText>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
