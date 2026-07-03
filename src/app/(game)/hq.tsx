import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DecisionModal } from '@/components/game/decision-modal';
import { InsolvencyBanner } from '@/components/game/insolvency-banner';
import { NewsFeed } from '@/components/game/news-feed';
import { PrimaryButton } from '@/components/game/primary-button';
import { Sparkline } from '@/components/game/sparkline';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { WeekInReviewSheet, type RivalShareMove } from '@/components/game/week-in-review-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney } from '@/lib/format';
import { useGame } from '@/state/game-store';

export default function HqScreen() {
  const { state, previousState, dispatch } = useGame();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [reviewedWeek, setReviewedWeek] = useState<number | null>(null);

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const { burn, revenue, valuation, insolvent } = deriveWeeklyStats(state);
  const previous = previousState ? deriveWeeklyStats(previousState) : null;

  // Show once per tick, after any decision card that tick drew has been
  // answered (pendingEvent clears). previousState only exists once at least
  // one tick has happened this session, so this never fires on app open.
  const showReview = previousState !== null && !state.pendingEvent && state.week !== reviewedWeek;
  const cashDelta = previousState ? state.cash - previousState.cash : 0;
  const moraleDelta = previousState ? state.morale - previousState.morale : 0;
  const yourShareDelta = previousState ? state.marketShare - previousState.marketShare : 0;
  const rivalShares: RivalShareMove[] = previousState
    ? state.rivals.map((rival, index) => ({
        name: rival.name,
        delta: rival.marketShare - (previousState.rivals[index]?.marketShare ?? rival.marketShare),
      }))
    : [];
  const weekEntries = state.newsLog.filter((entry) => entry.week === state.week);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">HQ</ThemedText>

        {insolvent ? <InsolvencyBanner weeksInTheRed={state.weeksInTheRed} /> : null}

        <Sparkline data={state.valuationHistory} />

        <View style={styles.grid}>
          <StatTile
            label="Weekly burn"
            value={burn}
            previousValue={previous?.burn}
            format={formatMoney}
            goodDirection="down"
          />
          <StatTile
            label="Revenue"
            value={revenue}
            previousValue={previous?.revenue}
            format={formatMoney}
            goodDirection="up"
          />
          <StatTile
            label="Valuation"
            value={valuation}
            previousValue={previous?.valuation}
            format={formatMoney}
            goodDirection="up"
          />
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

      <WeekInReviewSheet
        visible={showReview}
        week={state.week}
        cashDelta={cashDelta}
        revenue={revenue}
        burn={burn}
        moraleDelta={moraleDelta}
        yourShareDelta={yourShareDelta}
        rivalShares={rivalShares}
        entries={weekEntries}
        onDismiss={() => setReviewedWeek(state.week)}
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
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
