import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { purchasesClient, type PurchaseErrorCode, type WeekPack } from '@/purchases';

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
          track(EVENTS.PURCHASE_COMPLETED, {
            pack_id: pack.id,
            weeks_granted: result.weeksGranted,
            price_label: pack.priceLabel,
          });
          onPurchased(result.weeksGranted, result.transactionId);
          onClose();
        } else {
          track(EVENTS.PURCHASE_FAILED, { pack_id: pack.id, error_code: result.code });
          setErrorCode(result.code);
        }
      })
      .catch(() => {
        setPendingPackId(null);
        track(EVENTS.PURCHASE_FAILED, { pack_id: pack.id, error_code: 'unknown' });
        setErrorCode('unknown');
      });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <ThemedText type="smallBold">Buy weeks</ThemedText>
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
                onPress={() => handlePurchase(pack)}
              />
            ))}
          </View>

          {errorCode ? (
            <ThemedText type="small" themeColor="danger">
              {errorCode === 'cancelled' ? 'Purchase cancelled.' : "Purchase didn't go through — try again."}
            </ThemedText>
          ) : null}

          <PrimaryButton label="Not now" variant="secondary" onPress={onClose} />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  packs: {
    gap: Spacing.two,
  },
});
