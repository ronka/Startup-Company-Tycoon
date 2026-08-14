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
  hasOffer,
  searchLabel,
  onFire,
  onViewCandidates,
}: {
  title: string;
  hired: CLevelCandidate | null;
  /** Whether this seat has been spun for yet — an empty seat and a seat with a standing offer read differently. */
  hasOffer: boolean;
  /** What the search button says — it spins, opens a standing offer, or browses over a filled seat. */
  searchLabel: string;
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
          {/* A filled seat still reaches the search. Without this the only way
              to see a roll is to fire first — paying morale before you know
              what the wheel gives you — and rolling would stop entirely once
              all three seats fill, which is early, and long before the stages
              where a legend is actually reachable. */}
          <PrimaryButton variant="primary" label={searchLabel} onPress={onViewCandidates} />
          <PrimaryButton variant="secondary" label="Fire" onPress={onFire} />
        </View>
      ) : (
        <View style={styles.filled}>
          <ThemedText type="small" themeColor="textSecondary">
            {hasOffer ? 'Seat open' : 'Empty — spin to see who’s available'}
          </ThemedText>
          <PrimaryButton variant="primary" label={searchLabel} onPress={onViewCandidates} />
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
