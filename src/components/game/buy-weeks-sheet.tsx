import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { LegalLinksRow } from '@/components/game/legal-links-row';
import { PrimaryButton } from '@/components/game/primary-button';
import { RestorePurchasesButton } from '@/components/game/restore-purchases-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { purchasesClient, type PurchaseErrorCode, type WeekPack } from '@/purchases';
import { notePurchaseFailed } from '@/state/store-review';

export type BuyWeeksTrigger = 'out_of_weeks' | 'hud';

/**
 * iOS-only bottom sheet (Task 2, PRD week-packs) offering the two week packs.
 * Opened either when the player hits the daily wall (`out_of_weeks`) or by
 * tapping the HUD week counter anytime (`hud`). Purchases go through
 * `@/purchases` — a stub today, RevenueCat behind the same interface once
 * Task 5 lands — so this component never talks to a store SDK directly.
 */
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
  const [packs, setPacks] = useState<WeekPack[]>([]);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<PurchaseErrorCode | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErrorCode(null);
    track(EVENTS.PAYWALL_SHOWN, { trigger });
    purchasesClient.getPacks().then(setPacks);
  }, [visible, trigger]);

  const handlePurchase = (pack: WeekPack) => {
    setErrorCode(null);
    setPendingPackId(pack.id);
    track(EVENTS.PURCHASE_STARTED, { pack_id: pack.id, weeks: pack.weeks, price_label: pack.priceLabel });
    purchasesClient
      .purchasePack(pack.id)
      .then((result) => {
        setPendingPackId(null);
        if (result.status === 'success') {
          const weeksGranted = result.reward.kind === 'weeks' ? result.reward.weeks : 0;
          track(EVENTS.PURCHASE_COMPLETED, {
            pack_id: pack.id,
            weeks_granted: weeksGranted,
            price_label: pack.priceLabel,
          });
          onPurchased(weeksGranted, result.transactionId);
          onClose();
        } else {
          track(EVENTS.PURCHASE_FAILED, { pack_id: pack.id, error_code: result.code });
          notePurchaseFailed();
          setErrorCode(result.code);
        }
      })
      .catch(() => {
        setPendingPackId(null);
        track(EVENTS.PURCHASE_FAILED, { pack_id: pack.id, error_code: 'unknown' });
        notePurchaseFailed();
        setErrorCode('unknown');
      });
  };

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
