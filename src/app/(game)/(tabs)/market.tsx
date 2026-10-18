import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { HeadlineStat } from '@/components/game/headline-stat';
import { FocusPicker, type FocusPickerHandle } from '@/components/game/focus-picker';
import { LeaderboardRankCard } from '@/components/game/leaderboard-rank-card';
import { PrimaryButton } from '@/components/game/primary-button';
import { ProgressBar } from '@/components/game/progress-bar';
import { SectionHeader } from '@/components/game/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { FOCUS_TRANSITION_WEEKS, weeklyReportFor } from '@/game/balance';
import type { Era } from '@/game/events/types';
import type { FocusId } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/lib/format';
import {
  BOTTLENECK_LABEL,
  ERA_LABEL,
  FOCUS_LABEL,
  TREND_LABEL,
  TREND_PHASE_LABEL,
  trendAlignmentFor,
} from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';
import { isGuided, isUnlocked, unlockConditionFor } from '@/game/unlocks';

const HYPE_MIN = 0.5;
const HYPE_MAX = 2.5;
const ERA_ORDER: Era[] = ['scrappy', 'boom', 'reckoning'];

export default function MarketScreen() {
  const { state, dispatch } = useGame();
  const theme = useTheme();
  const [pendingFocus, setPendingFocus] = useState<FocusId | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const focusPickerRef = useRef<FocusPickerHandle>(null);
  useTabView('market');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  // Rivals are ranked bars, not identities to remember — amber then red, in
  // fixed order, so they never collide with the accent green that means "you".
  const rivalColors = [theme.warning, theme.danger];
  const rivalShareTotal = state.rivals.reduce((sum, rival) => sum + rival.marketShare, 0);
  const restOfMarket = Math.max(0, 1 - state.marketShare - rivalShareTotal);
  const hypePercent = ((state.hype - HYPE_MIN) / (HYPE_MAX - HYPE_MIN)) * 100;
  const report = weeklyReportFor(state);

  const openFocusPicker = () => {
    track(EVENTS.FOCUS_PICKER_OPENED, { focus: state.focus });
    focusPickerRef.current?.present();
  };

  const requestFocus = (focus: FocusId) => {
    focusPickerRef.current?.dismiss();
    setPendingFocus(focus);
  };

  const focusLocked = !isUnlocked(state, 'focus');

  const confirmFocus = () => {
    if (pendingFocus) dispatch({ type: 'SET_FOCUS', focus: pendingFocus });
    setPendingFocus(null);
  };

  const rivalRows = state.rivals.map((rival, index) => ({
    rival,
    color: rivalColors[index % rivalColors.length],
    edge: rival.productQuality - state.productQuality,
  }));

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Fits one iPhone 15 screen without scrolling; the ScrollView is only
          the fallback for shorter phones and large text. */}
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.titleRow}>
          <ThemedText type="sheetTitle">Market</ThemedText>
          <Pressable
            onPress={() => setDetailsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Show market details: customers, trend and era"
            style={[styles.detailsPill, { backgroundColor: theme.accentSurface }]}>
            <ThemedText type="smallBold" themeColor="accent">
              Details ›
            </ThemedText>
          </Pressable>
        </View>

        {/* A guided run's quest strip does the explaining. */}
        {isGuided(state) ? null : (
          <FirstRunHint id="market" text="Two rivals want your customers. Quality and hype decide who wins the market." />
        )}

        {/* The whole card is the tap target, so "Change" is a label, not a
            nested button — nesting one would be invalid and unreachable. */}
        {/* A guided run keeps its onboarding focus until the picker unlocks;
            the card still shows the bet, just not the way to change it. */}
        <Pressable
          onPress={focusLocked ? undefined : openFocusPicker}
          disabled={focusLocked}
          accessibilityRole="button"
          accessibilityLabel={focusLocked ? `Company focus, locked. ${unlockConditionFor('focus')}.` : 'Change company focus'}>
          <Card style={styles.compactCard}>
            <View style={styles.rowBetween}>
              <ThemedText type="default" numberOfLines={1} style={styles.strategyLine}>
                {FOCUS_LABEL[state.focus]} · {ERA_LABEL[state.era]} era
              </ThemedText>
              <ThemedText type="small" themeColor={focusLocked ? 'textMuted' : 'accent'}>
                {focusLocked ? '🔒' : 'Change'}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textMuted">
              {focusLocked ? unlockConditionFor('focus') : `Bottleneck: ${BOTTLENECK_LABEL[report.bottleneck]}`}
            </ThemedText>
          </Card>
        </Pressable>

        {/* The race: you against the two rivals. Customer counts and the rest of
            the market are in Details. */}
        <Card style={[styles.compactCard, styles.race]}>
          <ThemedText type="sectionLabel">Market share</ThemedText>
          <ShareRow label="You" percent={state.marketShare * 100} color={theme.accent} />
          {rivalRows.map(({ rival, color, edge }) => (
            <ShareRow
              key={rival.name}
              label={rival.name}
              percent={rival.marketShare * 100}
              color={color}
              edge={edge}
              focus={rival.focus}
            />
          ))}
        </Card>

        <View style={styles.statsRow}>
          <HeadlineStat
            label="Hype"
            value={`${state.hype.toFixed(2)}x`}
            note="Drifts back to 1x"
          />
          <HeadlineStat
            label="Trend"
            value={`${TREND_LABEL[state.trend.id]} · ${TREND_PHASE_LABEL[state.trend.phase]}`}
            note={`${state.trend.weeksInPhase} wk in phase`}
            onPress={() => setDetailsOpen(true)}
          />
        </View>

        <LeaderboardRankCard />

      </ScrollView>

      <BottomSheet visible={detailsOpen} onClose={() => setDetailsOpen(false)} title="Market details">
        <Card style={styles.shareSection}>
          <SectionHeader label="Market share" />
          <ShareRow label="You" percent={state.marketShare * 100} color={theme.accent} customers={state.customers} />
          {rivalRows.map(({ rival, color, edge }) => (
            <ShareRow
              key={rival.name}
              label={rival.name}
              percent={rival.marketShare * 100}
              color={color}
              edge={edge}
              focus={rival.focus}
              customers={Math.round(rival.marketShare * state.marketCustomers)}
            />
          ))}
          <ShareRow label="Rest of market" percent={restOfMarket * 100} color={theme.border} />
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <ThemedText type="sectionLabel">Trend</ThemedText>
            <ThemedText type="smallBold">
              {TREND_LABEL[state.trend.id]} · {TREND_PHASE_LABEL[state.trend.phase]}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {state.trend.weeksInPhase} wk in phase · {trendAlignmentFor(state.focus, state.trend)}
          </ThemedText>
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <ThemedText type="sectionLabel">Hype</ThemedText>
            <ThemedText type="smallBold">{state.hype.toFixed(2)}x</ThemedText>
          </View>
          <ProgressBar percent={hypePercent} color={theme.accent} />
        </Card>

        <Card>
          <SectionHeader label="Era" />
          <View style={styles.eraStrip}>
            {ERA_ORDER.map((era) => (
              <View key={era} style={styles.eraStop}>
                <ThemedText type="small" themeColor={era === state.era ? 'text' : 'textSecondary'}>
                  {ERA_LABEL[era]}
                </ThemedText>
                {era === state.era ? (
                  <ThemedText type="small" themeColor="accent">
                    ▲ you are here
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      </BottomSheet>

      <BottomSheet visible={pendingFocus !== null} onClose={() => setPendingFocus(null)} title="Switch focus?">
        <FirstRunHint
          id="focus-switch"
          text={`Switching focus costs ~${FOCUS_TRANSITION_WEEKS} weeks of drag — commit, don't flip-flop.`}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
          {pendingFocus
            ? `Switching to ${FOCUS_LABEL[pendingFocus]} costs ${FOCUS_TRANSITION_WEEKS} weeks of reduced dev effort and conversion while the team retools.`
            : ''}
        </ThemedText>
        <View style={styles.sheetActions}>
          <PrimaryButton variant="secondary" label="Cancel" onPress={() => setPendingFocus(null)} style={styles.sheetButton} />
          <PrimaryButton variant="primary" label="Confirm switch" onPress={confirmFocus} style={styles.sheetButton} />
        </View>
      </BottomSheet>

      <FocusPicker
        ref={focusPickerRef}
        focus={state.focus}
        productQuality={state.productQuality}
        rivals={state.rivals}
        trend={state.trend}
        onSelect={requestFocus}
      />
    </View>
  );
}

function ShareRow({
  label,
  percent,
  color,
  edge,
  focus,
  customers,
}: {
  label: string;
  percent: number;
  color: string;
  /** Your product quality minus this rival's — positive means you have the edge. */
  edge?: number;
  /** Rival's strategic bet — renders as a badge next to the label. Omitted for you/rest-of-market. */
  focus?: FocusId;
  /** Implied customer count: exact for you, `share × marketCustomers` (UI-only) for rivals. */
  customers?: number;
}) {
  const theme = useTheme();
  const edgeLabel =
    edge === undefined
      ? null
      : edge >= 0
        ? `+${Math.round(edge)} edge`
        : `${Math.round(edge)} behind`;
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareLabelRow}>
        <View style={styles.shareLabelLeft}>
          <ThemedText type="small">{label}</ThemedText>
          {focus ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={[styles.focusBadge, { borderColor: theme.border }]}>
              {FOCUS_LABEL[focus]}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.shareLabelRight}>
          {edgeLabel ? (
            <ThemedText type="small" themeColor={edge! >= 0 ? 'success' : 'danger'}>
              {edgeLabel}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {percent.toFixed(1)}%
          </ThemedText>
        </View>
      </View>
      <ProgressBar percent={percent} color={color} />
      {customers !== undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          {formatCount(customers)} customers
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // flexGrow, not flex: a block that stretches (Money's chart) fills a tall
  // screen, and the content can still outgrow a short one.
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  compactCard: {
    gap: Spacing.one,
    paddingVertical: Spacing.two + Spacing.one,
  },
  race: {
    gap: Spacing.two,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strategyLine: {
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  shareSection: {
    gap: Spacing.three,
  },
  shareRow: {
    gap: Spacing.one,
  },
  shareLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shareLabelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shareLabelRight: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  focusBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  eraStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eraStop: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  sheetBody: {
    lineHeight: 20,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  sheetButton: {
    flex: 1,
  },
});
