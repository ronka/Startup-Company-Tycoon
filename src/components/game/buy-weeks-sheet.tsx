import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { accountAvailable } from '@/account';
import { EVENTS, track, type EventName, type Props } from '@/analytics/events';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { AccountSignInHint, LegalLinksRow } from '@/components/game/legal-links-row';
import { PrimaryButton } from '@/components/game/primary-button';
import { RestorePurchasesButton } from '@/components/game/restore-purchases-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { purchasesClient, type PurchaseErrorCode, type WeekPack } from '@/purchases';
import type { BuyWeeksTrigger } from '@/state/buy-weeks-flow';
import { useGame } from '@/state/game-store';
import { notePurchaseFailed } from '@/state/store-review';

/**
 * iOS-only bottom sheet offering the two week packs.
 *
 * No longer the primary purchase surface — the RevenueCat-hosted paywall is
 * (`game-chrome.tsx`'s `openBuyWeeks`). This is the fallback it degrades to
 * when that paywall can't be shown at all: offerings failed to load, no
 * paywall is attached to the `weeks` offering, or the running binary predates
 * the paywall UI native module. It's kept precisely because it survives those
 * cases — `getPacks()` falls back to a hardcoded `WEEK_PACKS` catalog, so this
 * sheet still renders something buyable when the network doesn't cooperate.
 *
 * Purchases go through `@/purchases`, so this component never talks to a store
 * SDK directly.
 */
/**
 * Every event from this sheet is tagged with the surface it came from, so a
 * funnel can tell the fallback apart from the hosted paywall. Stamped in one
 * place rather than spelled at each call site, where it was five chances to
 * forget.
 */
function trackSheet(event: EventName, props: Props): void {
  track(event, { ...props, surface: 'sheet' });
}

export function BuyWeeksSheet({
  visible,
  trigger,
  onClose,
  onPurchased,
}: {
  visible: boolean;
  trigger: BuyWeeksTrigger;
  onClose: () => void;
  onPurchased: (weeksGranted: number, transactionId: string) => void;
}) {
  const { account, signInWithApple } = useGame();
  const [packs, setPacks] = useState<WeekPack[]>([]);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<PurchaseErrorCode | null>(null);
  // Set instead of closing immediately, when the purchase completed while
  // signed out — "the success state offers sign-in once" (the plan). Reset
  // on every open so a later, unrelated open of this sheet doesn't inherit a
  // stale offer from a previous purchase.
  const [postPurchaseSignInOffer, setPostPurchaseSignInOffer] = useState(false);
  const [signInPending, setSignInPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setErrorCode(null);
    setPostPurchaseSignInOffer(false);
    trackSheet(EVENTS.PAYWALL_SHOWN, { trigger });
    purchasesClient.getPacks().then(setPacks);
  }, [visible, trigger]);

  const handlePurchase = (pack: WeekPack) => {
    setErrorCode(null);
    setPendingPackId(pack.id);
    trackSheet(EVENTS.PURCHASE_STARTED, { pack_id: pack.id, weeks: pack.weeks, price_label: pack.priceLabel });
    purchasesClient
      .purchasePack(pack.id)
      .then((result) => {
        setPendingPackId(null);
        if (result.status === 'success') {
          const weeksGranted = result.reward.kind === 'weeks' ? result.reward.weeks : 0;
          trackSheet(EVENTS.PURCHASE_COMPLETED, {
            pack_id: pack.id,
            weeks_granted: weeksGranted,
            price_label: pack.priceLabel,
          });
          onPurchased(weeksGranted, result.transactionId);
          if (accountAvailable && account.status === 'signed-out') {
            setPostPurchaseSignInOffer(true);
          } else {
            onClose();
          }
        } else {
          trackSheet(EVENTS.PURCHASE_FAILED, { pack_id: pack.id, error_code: result.code });
          notePurchaseFailed();
          setErrorCode(result.code);
        }
      })
      .catch(() => {
        setPendingPackId(null);
        trackSheet(EVENTS.PURCHASE_FAILED, { pack_id: pack.id, error_code: 'unknown' });
        notePurchaseFailed();
        setErrorCode('unknown');
      });
  };

  /** Dismissible, not blocking — signs in if it can, but closes either way. */
  const handleOfferSignIn = () => {
    setSignInPending(true);
    signInWithApple().finally(() => {
      setSignInPending(false);
      onClose();
    });
  };

  if (postPurchaseSignInOffer) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Weeks added!">
        <ThemedText type="small" themeColor="textSecondary">
          Keep these weeks safe — sign in with Apple to restore them on your other devices.
        </ThemedText>
        <PrimaryButton
          label={signInPending ? 'Signing in…' : 'Sign in with Apple'}
          loading={signInPending}
          disabled={signInPending}
          onPress={handleOfferSignIn}
        />
        <PrimaryButton label="Not now" variant="secondary" disabled={signInPending} onPress={onClose} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Buy weeks">
      <ThemedText type="small" themeColor="textSecondary">
        {trigger === 'out_of_weeks'
          ? "That's the free weeks planned out — grab more to keep going today."
          : 'Stock up on weeks for whenever you run out.'}
      </ThemedText>

      <View style={styles.packs}>
        {packs.map((pack) => (
          <PrimaryButton
            key={pack.id}
            label={`${pack.weeks} weeks — ${pack.priceLabel}`}
            disabled={pendingPackId !== null}
            loading={pendingPackId === pack.id}
            onPress={() => handlePurchase(pack)}
          />
        ))}
      </View>

      {errorCode ? (
        <ThemedText type="small" themeColor="danger">
          {errorCode === 'cancelled' ? 'Purchase cancelled.' : "Purchase didn't go through — try again."}
        </ThemedText>
      ) : null}

      {/*
        Spells out exactly what the money buys before the player spends it, which
        App Review expects of any purchase screen: a one-time charge (not a
        subscription), weeks that never expire, and the fact that they're only
        consumed once the free daily allowance is gone — which is also just true
        (`spendWeekFromPools` spends free weeks first).
      */}
      <ThemedText type="small" themeColor="textMuted" style={styles.fineprint}>
        One-time purchase, not a subscription. Weeks never expire and are only used once your free daily
        weeks run out.
      </ThemedText>

      <PrimaryButton label="Not now" variant="secondary" onPress={onClose} />

      <RestorePurchasesButton source="buy_weeks_sheet" onRestored={onClose} />

      <AccountSignInHint />

      <LegalLinksRow source="buy_weeks_sheet" />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  packs: {
    gap: Spacing.two,
  },
  fineprint: {
    textAlign: 'center',
  },
});
