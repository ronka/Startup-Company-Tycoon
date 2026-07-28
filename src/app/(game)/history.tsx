import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import type { GameOverReason } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatCount, formatDateKey, formatMoney } from '@/lib/format';
import { ERA_LABEL, FOCUS_LABEL } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';
import { bestRunIndex, type RunRecord } from '@/state/run-history';

/** Short outcome word per ending — the list's version of game-over's `HEADLINE`. */
const OUTCOME_LABEL: Record<GameOverReason, string> = {
  bankruptcy: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

/** Reuses the same reading the rest of the game gives these colors: green won, red died. */
const OUTCOME_COLOR: Record<GameOverReason, ThemeColor> = {
  bankruptcy: 'danger',
  acquired: 'accent',
  ipo: 'success',
};

/**
 * The two optional detail lines, assembled from whichever fields a record
 * happens to carry. Runs recorded before `RunRecord` was widened have none of
 * them, so both arrays come back empty and the card quietly renders as its
 * original two lines rather than leaking `undefined` into the UI.
 */
function detailLines(run: RunRecord): string[] {
  const money: string[] = [];
  if (run.exitValuation !== undefined) {
    money.push(`${formatMoney(run.exitValuation)} ${run.reason === 'bankruptcy' ? 'valuation' : 'exit'}`);
  }
  if (run.founderEquity !== undefined) money.push(`${Math.round(run.founderEquity * 100)}% equity`);
  if (run.customers !== undefined) money.push(`${formatCount(run.customers)} customers`);

  const company: string[] = [];
  if (run.employees !== undefined) company.push(`${formatCount(run.employees)} staff`);
  if (run.era) company.push(ERA_LABEL[run.era]);
  if (run.focus) company.push(FOCUS_LABEL[run.focus]);

  return [money, company].filter((parts) => parts.length > 0).map((parts) => parts.join(' · '));
}

function RunCard({ run, isBest }: { run: RunRecord; isBest: boolean }) {
  const theme = useTheme();
  const details = detailLines(run);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="default" themeColor={OUTCOME_COLOR[run.reason]}>
          {OUTCOME_LABEL[run.reason]}
        </ThemedText>
        <ThemedText type="cardValue">{formatMoney(run.score)}</ThemedText>
      </View>

      <ThemedText type="default" numberOfLines={1}>
        {run.companyName}
      </ThemedText>

      <View style={styles.cardHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          Week {run.weeks} · {formatDateKey(run.endedOnDateKey)}
        </ThemedText>
        {isBest ? (
          <View style={[styles.badge, { backgroundColor: theme.successBackground }]}>
            <ThemedText type="small" themeColor="success">
              ★ BEST
            </ThemedText>
          </View>
        ) : null}
      </View>

      {details.map((line) => (
        <ThemedText key={line} type="small" themeColor="textSecondary">
          {line}
        </ThemedText>
      ))}
    </ThemedView>
  );
}

/**
 * Every finished run, newest first, with the personal best badged. Reads only
 * `runHistory` — deliberately not `state`, so it renders fine on the game-over
 * beat when the current run is already spent.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { runHistory } = useGame();

  const runs = runHistory?.runs ?? [];
  const loaded = runHistory !== null;

  useEffect(() => {
    if (!loaded) return;
    track(EVENTS.HISTORY_VIEWED, { run_count: runs.length });
  }, [loaded, runs.length]);

  const best = runHistory ? bestRunIndex(runHistory) : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <ThemedText type="default" themeColor="textSecondary">
            ‹ Back
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">History</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Every company you’ve taken to an ending, newest first. Your best score keeps the star.
        </ThemedText>

        {!loaded ? (
          <ActivityIndicator color={theme.text} style={styles.loading} />
        ) : runs.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No finished runs yet — your first IPO or bankruptcy lands here.
          </ThemedText>
        ) : (
          runs.map((run, index) => (
            <RunCard key={`${run.endedOnDateKey}-${run.seed}-${index}`} run={run} isBest={index === best} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  loading: {
    marginTop: Spacing.four,
  },
  empty: {
    marginTop: Spacing.two,
  },
});
