import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DecisionModal } from '@/components/game/decision-modal';
import { NewsFeed } from '@/components/game/news-feed';
import { PrimaryButton } from '@/components/game/primary-button';
import { Sparkline } from '@/components/game/sparkline';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  cLevelPayroll,
  cLevelPerkMultiplier,
  revenueFor,
  runwayWeeks,
  salesFactorFor,
  valuationFor,
  weeklyBurnFor,
} from '@/game/balance';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, formatWeeks } from '@/lib/format';
import { useGame } from '@/state/game-store';

export default function HqScreen() {
  const { state, dispatch } = useGame();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const burn = weeklyBurnFor(state.headcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplier(state.cLevels, 'cfo'),
  });
  const effectiveHype = state.hype * cLevelPerkMultiplier(state.cLevels, 'cmo');
  const revenue = revenueFor(
    state.productQuality,
    state.marketShare,
    effectiveHype,
    salesFactorFor(state.headcount.sales),
  );
  const valuation = valuationFor(revenue, effectiveHype);
  const runway = runwayWeeks(state.cash, burn - revenue);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <ThemedText type="subtitle">HQ</ThemedText>
        <ThemedText themeColor="textSecondary">Week {state.week}</ThemedText>

        <Sparkline data={state.valuationHistory} />

        <View style={styles.grid}>
          <StatTile label="Cash" value={formatMoney(state.cash)} />
          <StatTile label="Weekly burn" value={formatMoney(burn)} />
          <StatTile label="Runway" value={formatWeeks(runway)} />
          <StatTile label="Revenue" value={formatMoney(revenue)} />
          <StatTile label="Valuation" value={formatMoney(valuation)} />
          <StatTile label="Week" value={`${state.week}`} />
        </View>

        <View style={styles.newsSection}>
          <ThemedText type="small" themeColor="textSecondary">
            News
          </ThemedText>
          <NewsFeed entries={state.newsLog} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <PrimaryButton label="Next Week →" onPress={() => dispatch({ type: 'TICK' })} />
      </View>

      <DecisionModal
        card={state.pendingEvent}
        onChoose={(choiceIndex) => dispatch({ type: 'ANSWER_EVENT', choiceIndex })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  newsSection: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
