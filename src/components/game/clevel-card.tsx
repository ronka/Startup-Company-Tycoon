import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/game/card';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
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
    <Card style={styles.card}>
      <ThemedText type="sectionLabel">{title}</ThemedText>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 200,
  },
  filled: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  quirk: {
    fontStyle: 'italic',
  },
});
