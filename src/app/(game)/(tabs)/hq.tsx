import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FirstRunHint } from '@/components/game/first-run-hint';
import { InsolvencyBanner } from '@/components/game/insolvency-banner';
import { NewsFeed } from '@/components/game/news-feed';
import { Sparkline } from '@/components/game/sparkline';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney } from '@/lib/format';
import { STAT_EXPLAINERS } from '@/lib/stat-explainers';
import { useGame } from '@/state/game-store';

export default function HqScreen() {
  const { state, previousState } = useGame();
  const theme = useTheme();

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const { burn, revenue, valuation, insolvent } = deriveWeeklyStats(state);
  const previous = previousState ? deriveWeeklyStats(previousState) : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">HQ</ThemedText>

        <FirstRunHint id="hq" text="Watch revenue vs. burn." />

        {insolvent ? <InsolvencyBanner weeksInTheRed={state.weeksInTheRed} /> : null}

        <Sparkline data={state.valuationHistory} />

        <View style={styles.grid}>
          <StatTile
            label="Weekly burn"
            value={burn}
            previousValue={previous?.burn}
            format={formatMoney}
            goodDirection="down"
            explainer={STAT_EXPLAINERS.weeklyBurn}
          />
          <StatTile
            label="Revenue"
            value={revenue}
            previousValue={previous?.revenue}
            format={formatMoney}
            goodDirection="up"
            explainer={STAT_EXPLAINERS.revenue}
          />
          <StatTile
            label="Valuation"
            value={valuation}
            previousValue={previous?.valuation}
            format={formatMoney}
            goodDirection="up"
            explainer={STAT_EXPLAINERS.valuation}
          />
        </View>

        <View style={styles.newsSection}>
          <ThemedText type="small" themeColor="textSecondary">
            News
          </ThemedText>
          <NewsFeed entries={state.newsLog} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
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
});
