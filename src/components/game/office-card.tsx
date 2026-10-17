import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { totalHeadcount } from '@/game/balance';
import { C_LEVEL_ROLES, type GameState } from '@/game/types';
import { OFFICE_NAMES, sceneryFor } from '@/office/maps';
import { OfficeScene } from '@/office/office-scene';
import { peopleShown } from '@/office/select-office';
import { useOfficeTier } from '@/office/use-office-tier';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/lib/format';

/** Everyone who comes to the office: staff, filled C-level seats, and the founder. */
export function officeHeadcount(state: GameState): number {
  const execs = C_LEVEL_ROLES.filter((role) => state.cLevels[role].hired != null).length;
  return totalHeadcount(state.headcount) + execs + 1;
}

/**
 * HQ's living office, under the valuation chart. The office tier is the
 * smaller of what the valuation can afford and what the headcount needs, so
 * a rich three-person team stays cosy and a broke sixty-person one gets
 * crowded.
 */
export function OfficeCard({ state, valuation }: { state: GameState; valuation: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [debug, setDebug] = useState(false);

  const employees = officeHeadcount(state);
  const tier = useOfficeTier(employees, valuation, state.week);
  const { capacity } = sceneryFor(tier).map;
  const { visible, overflow, crowded } = peopleShown(employees, capacity);

  return (
    <Card tone="plain" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="sectionLabel">Your office</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.caption}>
          {OFFICE_NAMES[tier]} · {formatCount(employees)} {employees === 1 ? 'person' : 'people'}
          {crowded ? ' · cramped' : ''}
        </ThemedText>
      </View>
      <Pressable
        // Dev builds only: long-press shows the nav map for checking traces.
        onLongPress={__DEV__ ? () => setDebug((d) => !d) : undefined}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${OFFICE_NAMES[tier]} with ${employees} ${employees === 1 ? 'person' : 'people'}`}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? <OfficeScene tier={tier} people={visible} width={width} debug={__DEV__ && debug} /> : null}
        {overflow > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText type="smallBold">+{formatCount(overflow)}</ThemedText>
          </View>
        ) : null}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingTop: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  caption: {
    flexShrink: 1,
    textAlign: 'right',
  },
  badge: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
