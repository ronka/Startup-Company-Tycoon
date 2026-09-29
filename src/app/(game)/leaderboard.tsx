import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import type { Stage } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import {
  BOARD_FILTERS,
  fetchBoardPage,
  type BoardFilter,
  type BoardOutcome,
  type BoardRow,
} from '@/lib/leaderboard-api';
import { openLegalLink } from '@/lib/open-legal-link';
import { STAGE_LABEL } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';
import { useLeaderboard } from '@/state/leaderboard-provider';

const FILTER_LABEL: Record<BoardFilter, string> = {
  all: 'All',
  running: 'Running',
  exited: 'Exited',
  bankrupt: 'Bankrupt',
};

/** The server's outcome names — note `bankrupt`, not the game's `bankruptcy`. */
const OUTCOME_LABEL: Record<BoardOutcome, string> = {
  running: 'Running',
  bankrupt: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

const OUTCOME_COLOR: Record<BoardOutcome, ThemeColor> = {
  running: 'textSecondary',
  bankrupt: 'danger',
  acquired: 'accent',
  ipo: 'success',
};

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage as Stage] ?? stage;
}

/**
 * Company names are player-written, so every real row can be reported
 * (App Review Guideline 1.2). Long-press keeps it out of the way; the support
 * page is where the report lands.
 */
function reportRow(row: BoardRow) {
  Alert.alert(
    `Report “${row.companyName}”?`,
    'If this name is offensive, tell us on the support page and we’ll take it down.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => openLegalLink('support', 'leaderboard_report') },
    ],
    { cancelable: true },
  );
}

function BoardCard({ row, position, mine }: { row: BoardRow; position: number; mine: boolean }) {
  const theme = useTheme();
  const meta = [`Week ${row.week}`, stageLabel(row.stage), row.sector].filter(Boolean).join(' · ');
  const reportable = !row.sample && !mine;

  return (
    <Pressable
      onLongPress={reportable ? () => reportRow(row) : undefined}
      accessibilityHint={reportable ? 'Long press to report this name' : undefined}>
      <ThemedView type="backgroundElement" style={[styles.card, mine && { borderWidth: 1, borderColor: theme.accent }]}>
        <View style={styles.cardRow}>
          <ThemedText type="small" themeColor="textMuted" style={styles.position}>
            {/* The server leaves seeded rows unranked; the app ranks them by list order. */}
            #{row.rank ?? position}
          </ThemedText>
          <View style={styles.cardBody}>
            <View style={styles.cardRow}>
              <ThemedText type="default" numberOfLines={1} style={styles.name}>
                {row.companyName}
                {mine ? (
                  <ThemedText type="small" themeColor="accent">
                    {'  '}You
                  </ThemedText>
                ) : null}
              </ThemedText>
              <ThemedText type="cardValue">{formatMoney(row.founderStake)}</ThemedText>
            </View>
            <View style={styles.cardRow}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.name}>
                {meta}
              </ThemedText>
              <ThemedText type="small" themeColor={OUTCOME_COLOR[row.outcome]}>
                {OUTCOME_LABEL[row.outcome]}
              </ThemedText>
            </View>
          </View>
        </View>
      </ThemedView>
    </Pressable>
  );
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: BoardRow[]; nextCursor: string | null };

/**
 * The community board from the website's public API, ranked by founder stake.
 * Read-only for now: the app doesn't publish runs yet, so until the site flips
 * to `live` this shows the site's seeded startups, presented like any other
 * entry. Real ranks come from the response, so that flip needs no app update.
 */
export default function LeaderboardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useGame();
  const { prefs, joined, canJoin, openJoin } = useLeaderboard();
  // Runs this device put on the board — highlighted so the player finds themselves.
  const mine = new Set([...(prefs?.published ?? []), ...(joined && state?.runId ? [state.runId] : [])]);

  const [filter, setFilter] = useState<BoardFilter>('all');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Every request gets an id; a response only lands if it's still the latest,
  // so a slow page for an old filter can't overwrite the current list.
  const requestId = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  /**
   * Page one for `next`, resolved to the state it should produce — or `null`
   * when a newer request superseded it. Touches no state itself, so the mount
   * effect can call it and apply the result in `.then`.
   */
  const requestFirstPage = useCallback(async (next: BoardFilter): Promise<Load | null> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const id = ++requestId.current;
    let result: Load;
    try {
      const page = await fetchBoardPage(next, null, controller.signal);
      result = { status: 'ready', rows: page.rows, nextCursor: page.nextCursor };
    } catch {
      result = { status: 'error' };
    }
    return id === requestId.current ? result : null;
  }, []);

  const applyFirstPage = useCallback((result: Load | null) => {
    if (!result) return;
    // A failed pull-to-refresh keeps the rows already on screen.
    setLoad((prev) => (result.status === 'error' && prev.status === 'ready' ? prev : result));
    setRefreshing(false);
  }, []);

  useEffect(() => {
    track(EVENTS.LEADERBOARD_VIEWED);
  }, []);

  // Initial load only — filter changes and refreshes load from their handlers.
  useEffect(() => {
    requestFirstPage('all').then(applyFirstPage);
    return () => inFlight.current?.abort();
  }, [requestFirstPage, applyFirstPage]);

  const reload = (next: BoardFilter) => {
    setLoad({ status: 'loading' });
    setLoadingMore(false);
    requestFirstPage(next).then(applyFirstPage);
  };

  const refresh = () => {
    setRefreshing(true);
    setLoadingMore(false);
    requestFirstPage(filter).then(applyFirstPage);
  };

  const loadMore = async () => {
    if (load.status !== 'ready' || !load.nextCursor || loadingMore || refreshing) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const id = ++requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchBoardPage(filter, load.nextCursor, controller.signal);
      if (id !== requestId.current) return;
      setLoad({
        status: 'ready',
        rows: [...load.rows, ...page.rows],
        nextCursor: page.nextCursor,
      });
    } catch {
      // Keep what's already on screen; scrolling to the end again retries.
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  };

  const selectFilter = (next: BoardFilter) => {
    if (next === filter) return;
    track(EVENTS.LEADERBOARD_FILTERED, { filter: next });
    setFilter(next);
    reload(next);
  };

  const header = (
    <View style={styles.headerContent}>
      <ThemedText type="subtitle">Leaderboard</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Startups ranked by founder stake — what the founder’s shares are worth. Scores are self-reported
        by players.
      </ThemedText>

      {canJoin && !joined && state && !state.gameOver ? (
        <Pressable
          onPress={() => openJoin('board')}
          accessibilityRole="button"
          style={[styles.join, { backgroundColor: theme.accentSurface, borderColor: theme.accent }]}>
          <ThemedText type="small" numberOfLines={1} style={styles.name}>
            Put {state.companyName} on the board
          </ThemedText>
          <ThemedText type="smallBold" themeColor="accent">
            Join ›
          </ThemedText>
        </Pressable>
      ) : null}

      <View style={styles.filters}>
        {BOARD_FILTERS.map((f) => {
          const selected = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => selectFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.accentSurface : theme.surface,
                  borderColor: selected ? theme.accent : theme.border,
                },
              ]}>
              <ThemedText type="small" themeColor={selected ? 'accent' : 'textSecondary'}>
                {FILTER_LABEL[f]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const empty =
    load.status === 'loading' ? (
      <ActivityIndicator color={theme.text} style={styles.state} />
    ) : load.status === 'error' ? (
      <View style={styles.state}>
        <ThemedText type="small" themeColor="textSecondary">
          Couldn’t reach the leaderboard. Check your connection and try again.
        </ThemedText>
        <Pressable onPress={() => reload(filter)} hitSlop={8} accessibilityRole="button">
          <ThemedText type="default" themeColor="accent">
            Retry
          </ThemedText>
        </Pressable>
      </View>
    ) : (
      <ThemedText type="small" themeColor="textSecondary" style={styles.state}>
        No startups here yet.
      </ThemedText>
    );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <ThemedText type="default" themeColor="textSecondary">
            ‹ Back
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={load.status === 'ready' ? load.rows : []}
        keyExtractor={(row) => row.runId}
        renderItem={({ item, index }) => <BoardCard row={item} position={index + 1} mine={mine.has(item.runId)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.text} style={styles.footer} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.textSecondary}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  join: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  headerContent: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardBody: {
    flex: 1,
    gap: Spacing.half,
  },
  position: {
    minWidth: 28,
  },
  name: {
    flexShrink: 1,
  },
  state: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  footer: {
    marginVertical: Spacing.three,
  },
});
