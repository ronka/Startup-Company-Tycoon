import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { CLevelCandidate } from '@/game/types';
import { formatMoney } from '@/lib/format';

export function CLevelCard({
  title,
  hired,
  onFire,
  onViewCandidates,
}: {
  title: string;
  hired: CLevelCandidate | null;
  onFire: () => void;
  onViewCandidates: () => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {title}
      </ThemedText>
      {hired ? (
        <View style={styles.filled}>
          <ThemedText type="smallBold">{hired.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hired.perk.label} · {formatMoney(hired.salary)}/wk
          </ThemedText>
          {hired.quirk ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.quirk}>
              Quirk: {hired.quirk.label}
            </ThemedText>
          ) : null}
          <PrimaryButton variant="secondary" label="Fire" onPress={onFire} />
        </View>
      ) : (
        <View style={styles.filled}>
          <ThemedText type="small" themeColor="textSecondary">
            Seat open
          </ThemedText>
          <PrimaryButton variant="primary" label="View candidates" onPress={onViewCandidates} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 200,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  filled: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  quirk: {
    fontStyle: 'italic',
  },
});
