import { BottomSheetModal, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  FOCUS_PROFILES,
  HARDWARE_COGS_PER_CUSTOMER,
  HARDWARE_FIXED_BURN_MULTIPLIER,
  focusChurnMultiplierFor,
} from '@/game/balance';
import { FOCUS_IDS, type FocusId, type Rival, type Trend } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { FOCUS_BLURB, FOCUS_LABEL, trendAlignmentFor } from '@/lib/strategy-copy';

export interface FocusPickerHandle {
  present: () => void;
  dismiss: () => void;
}

export function FocusPicker({
  focus,
  productQuality,
  rivals,
  trend,
  onSelect,
  ref,
}: {
  focus: FocusId;
  productQuality: number;
  rivals: Rival[];
  trend: Trend;
  onSelect: (focus: FocusId) => void;
  ref?: Ref<FocusPickerHandle>;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const theme = useTheme();

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const rivalAvgQuality =
    rivals.length > 0 ? rivals.reduce((sum, r) => sum + r.productQuality, 0) / rivals.length : 0;

  return (
    <BottomSheetModal ref={sheetRef} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.background }}>
      <BottomSheetView style={styles.sheet}>
        <ThemedText type="smallBold">Company focus</ThemedText>
        {FOCUS_IDS.map((id) => {
          const profile = FOCUS_PROFILES[id];
          const churn = focusChurnMultiplierFor(id, productQuality, rivalAvgQuality);
          const isCurrent = id === focus;
          return (
            <ThemedView key={id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                {FOCUS_LABEL[id]}
                {isCurrent ? ' · current' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {FOCUS_BLURB[id]}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Quality ×{profile.qualityGrowthMultiplier} · ARPC ×{profile.arpcMultiplier} · Churn ×
                {churn.toFixed(2)} · Hype gain ×{profile.hypeGainMultiplier}
              </ThemedText>
              {id === 'hardware' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Fixed burn ×{HARDWARE_FIXED_BURN_MULTIPLIER} · +{formatMoney(HARDWARE_COGS_PER_CUSTOMER)}/customer
                  COGS
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {trendAlignmentFor(id, trend)}
              </ThemedText>
              {!isCurrent ? (
                <PrimaryButton
                  label={`Switch to ${FOCUS_LABEL[id]}`}
                  onPress={() => {
                    onSelect(id);
                  }}
                />
              ) : null}
            </ThemedView>
          );
        })}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
});
