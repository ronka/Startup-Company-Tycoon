import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { AnimatedNumber } from '@/components/game/animated-number';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { BurnBreakdownModal } from '@/components/game/burn-breakdown-modal';
import { Card } from '@/components/game/card';
import { CompanyHeader } from '@/components/game/company-header';
import { FirstRunHint, HintSlot } from '@/components/game/first-run-hint';
import { FocusPicker, type FocusPickerHandle } from '@/components/game/focus-picker';
import { InsolvencyBanner } from '@/components/game/insolvency-banner';
import { LogoPickerSheet } from '@/components/game/logo-picker-sheet';
import { NewsFeed } from '@/components/game/news-feed';
import { Pill, PillRow } from '@/components/game/pill';
import { PrimaryButton } from '@/components/game/primary-button';
import { RingGauge } from '@/components/game/ring-gauge';
import { SectionHeader } from '@/components/game/section-header';
import { Sparkline } from '@/components/game/sparkline';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { FOCUS_TRANSITION_WEEKS, weeklyReportFor } from '@/game/balance';
import type { FocusId } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney } from '@/lib/format';
import { moraleTone } from '@/lib/stat-colors';
import { STAT_EXPLAINERS } from '@/lib/stat-explainers';
import { BOTTLENECK_LABEL, ERA_LABEL, FOCUS_LABEL, trendAlignmentFor } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';

/** Runway below this many weeks is where a founder should be thinking about raising. */
const SHORT_RUNWAY_WEEKS = 10;
/** By this week, a player who still hasn't opened the drawer gets pointed at it. */
const DRAWER_HINT_WEEK = 6;
/** How many news entries the collapsed "This week" list shows. */
const COMPACT_NEWS_COUNT = 3;
/** Hype is a 0.5–2.5 multiplier internally; ×40 reads as a familiar 20–100 score. */
const HYPE_SCORE_SCALE = 40;

export default function HqScreen() {
  const { state, previousState, dispatch } = useGame();
  const theme = useTheme();
  const [pendingFocus, setPendingFocus] = useState<FocusId | null>(null);
  const [burnBreakdownOpen, setBurnBreakdownOpen] = useState(false);
  const [allNewsOpen, setAllNewsOpen] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);
  const focusPickerRef = useRef<FocusPickerHandle>(null);
  useTabView('hq');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const { burn, revenue, valuation, insolvent, runway } = deriveWeeklyStats(state);
  const runwayIsShort = Number.isFinite(runway) && runway < SHORT_RUNWAY_WEEKS;
  const previous = previousState ? deriveWeeklyStats(previousState) : null;
  const report = weeklyReportFor(state);

  // Week-over-week valuation move, shown as the hero's delta chip.
  const valuationChange =
    previous && previous.valuation > 0 ? ((valuation - previous.valuation) / previous.valuation) * 100 : null;
  const valuationUp = (valuationChange ?? 0) >= 0;
  const history = state.valuationHistory ?? [];
  const hasChart = history.length > 1;
  const newsShown = allNewsOpen ? state.newsLog : state.newsLog.slice(0, COMPACT_NEWS_COUNT);

  const requestFocus = (focus: FocusId) => {
    focusPickerRef.current?.dismiss();
    setPendingFocus(focus);
  };

  const confirmFocus = () => {
    if (pendingFocus) dispatch({ type: 'SET_FOCUS', focus: pendingFocus });
    setPendingFocus(null);
  };

  const openLogoPicker = () => {
    track(EVENTS.COMPANY_LOGO_PICKER_OPENED, { surface: 'hq', had_logo: state.companyLogo != null });
    setLogoPickerOpen(true);
  };

  const openFocusPicker = () => {
    track(EVENTS.FOCUS_PICKER_OPENED, { focus: state.focus });
    focusPickerRef.current?.present();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CompanyHeader
          name={state.companyName}
          stage={state.stage}
          focus={state.focus}
          logo={state.companyLogo}
          onPressLogo={openLogoPicker}
        />

        <PillRow>
          {/* Week 0 is still year one, so the year is floor-then-+1, not ceil. */}
          <Pill label="Year" value={`${Math.floor(state.week / 52) + 1}`} tone="strong" />
          <Pill label="MRR" value={formatMoney(revenue * 4)} />
          <Pill label="Hype" value={`${Math.round(state.hype * HYPE_SCORE_SCALE)}`} />
          <Pill label="Share" value={`${Math.round(state.marketShare * 100)}%`} />
          <Pill label={`${ERA_LABEL[state.era]} era`} />
        </PillRow>

        {/* At most one shows at a time; earlier entries win the slot. */}
        <HintSlot
          hints={[
            {
              id: 'hq',
              text: 'Top bar: your cash, how many weeks it lasts (runway), customers, and the current week. Cash at $0 for 3 weeks = game over.',
            },
            {
              id: 'runway-short',
              text: 'Runway is getting short. The Money tab is where founders raise cash — before terms get ugly.',
              when: runwayIsShort,
            },
            {
              id: 'drawer-glossary',
              text: 'Stuck on a term? The ☰ menu has a full glossary with your live numbers.',
              when: state.week >= DRAWER_HINT_WEEK,
            },
          ]}
        />

        {insolvent ? <InsolvencyBanner weeksInTheRed={state.weeksInTheRed} /> : null}

        <Card tone="plain" style={[styles.hero, !hasChart && styles.heroCompact]}>
          <View style={styles.heroTop}>
            <View style={styles.heroNumbers}>
              <ThemedText type="small" themeColor="textSecondary">
                Company valuation
              </ThemedText>
              <View style={styles.heroValueRow}>
                <AnimatedNumber value={valuation} format={formatMoney} goodDirection="up" type="hero" />
                {valuationChange !== null && Math.abs(valuationChange) >= 0.1 ? (
                  <ThemedText type="smallBold" themeColor={valuationUp ? 'success' : 'danger'}>
                    {valuationUp ? '↗' : '↘'} {Math.abs(valuationChange).toFixed(1)}%
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textMuted">
                Week {state.week} · post-money est.
              </ThemedText>
            </View>
            <RingGauge percent={state.morale} label="team" caption="Morale" tone={moraleTone(state.morale)} />
          </View>
          {/* Bleeds to the card's bottom edge, like a chart footer. Kept out of
              the tree until there's a series to draw, so the card doesn't open
              with 72px of dead space in weeks 0-1. */}
          {hasChart ? (
            <View style={styles.chart} onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}>
              {chartWidth > 0 ? <Sparkline data={history} width={chartWidth} height={72} /> : null}
            </View>
          ) : null}
        </Card>

        <View style={styles.grid}>
          <StatTile
            label="Revenue"
            value={revenue}
            previousValue={previous?.revenue}
            format={formatMoney}
            goodDirection="up"
            icon={{ ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' }}
            explainer={STAT_EXPLAINERS.revenue}
          />
          <StatTile
            label="Burn / wk"
            value={burn}
            previousValue={previous?.burn}
            format={formatMoney}
            goodDirection="down"
            alert={runwayIsShort}
            icon={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
            hint="Tap for breakdown"
            onPress={() => {
              track(EVENTS.BURN_BREAKDOWN_OPENED, { screen: 'hq' });
              setBurnBreakdownOpen(true);
            }}
          />
          <StatTile
            label="Hype"
            value={state.hype * HYPE_SCORE_SCALE}
            previousValue={previousState ? previousState.hype * HYPE_SCORE_SCALE : undefined}
            format={(n) => `${Math.round(n)}`}
            goodDirection="up"
            icon={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }}
            explainer={STAT_EXPLAINERS.hype}
          />
          <StatTile
            label="Active users"
            value={state.customers}
            previousValue={previousState?.customers}
            format={formatCount}
            goodDirection="up"
            icon={{ ios: 'person.2.fill', android: 'groups', web: 'groups' }}
            explainer={STAT_EXPLAINERS.customers}
          />
        </View>

        {/* The whole card is the tap target, so "Change" is a label, not a
            nested button — nesting one would be invalid and unreachable. */}
        <Pressable onPress={openFocusPicker} accessibilityRole="button" accessibilityLabel="Change company focus">
          <Card>
            <View style={styles.strategyHeader}>
              <ThemedText type="sectionLabel">Strategy</ThemedText>
              <ThemedText type="small" themeColor="accent">
                Change
              </ThemedText>
            </View>
            <ThemedText type="default">{FOCUS_LABEL[state.focus]}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {trendAlignmentFor(state.focus, state.trend)}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Bottleneck: {BOTTLENECK_LABEL[report.bottleneck]}
            </ThemedText>
          </Card>
        </Pressable>

        <View style={styles.newsSection}>
          <SectionHeader
            label="This week"
            action={state.newsLog.length > COMPACT_NEWS_COUNT ? (allNewsOpen ? 'Show less' : 'View all') : undefined}
            onPressAction={() => setAllNewsOpen((open) => !open)}
          />
          <NewsFeed entries={newsShown} variant={allNewsOpen ? 'full' : 'compact'} />
        </View>
      </ScrollView>

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
          <PrimaryButton
            variant="secondary"
            label="Cancel"
            onPress={() => setPendingFocus(null)}
            style={styles.sheetButton}
          />
          <PrimaryButton variant="primary" label="Confirm switch" onPress={confirmFocus} style={styles.sheetButton} />
        </View>
      </BottomSheet>

      <BurnBreakdownModal state={state} visible={burnBreakdownOpen} onClose={() => setBurnBreakdownOpen(false)} />

      <LogoPickerSheet
        visible={logoPickerOpen}
        logo={state.companyLogo}
        onCommit={(logo) => dispatch({ type: 'SET_COMPANY_LOGO', logo })}
        onClose={() => setLogoPickerOpen(false)}
      />

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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  hero: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  // No chart yet: the card closes up instead of leaving the slot empty.
  heroCompact: {
    paddingBottom: Spacing.three,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  heroNumbers: {
    flex: 1,
    gap: Spacing.half,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  chart: {
    marginTop: Spacing.three,
    marginHorizontal: -Spacing.three,
    height: 72,
    justifyContent: 'flex-end',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  strategyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.one,
  },
  newsSection: {
    gap: Spacing.two,
    marginTop: Spacing.two,
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
