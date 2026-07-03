import { BottomSheetModal, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { CLevelCandidate } from '@/game/types';
import { formatMoney } from '@/lib/format';

export interface CandidatePickerHandle {
  present: () => void;
  dismiss: () => void;
}

export function CandidatePicker({
  title,
  candidates,
  onHire,
  ref,
}: {
  title: string;
  candidates: CLevelCandidate[];
  onHire: (candidateId: string) => void;
  ref?: Ref<CandidatePickerHandle>;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  return (
    <BottomSheetModal ref={sheetRef} enablePanDownToClose>
      <BottomSheetView style={styles.sheet}>
        <ThemedText type="smallBold">{title} candidates</ThemedText>
        {candidates.map((candidate) => (
          <ThemedView key={candidate.id} type="backgroundElement" style={styles.candidate}>
            <ThemedText type="smallBold">{candidate.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {candidate.personality}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {candidate.perk.label} · {formatMoney(candidate.salary)}/wk
            </ThemedText>
            <PrimaryButton
              label="Hire"
              onPress={() => {
                onHire(candidate.id);
                sheetRef.current?.dismiss();
              }}
            />
          </ThemedView>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  candidate: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
});
