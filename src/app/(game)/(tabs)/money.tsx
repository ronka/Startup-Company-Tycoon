import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { BurnBreakdownModal } from '@/components/game/burn-breakdown-modal';
import { Card } from '@/components/game/card';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { PrimaryButton } from '@/components/game/primary-button';
import { AnimatedNumber } from '@/components/game/animated-number';
import { ProgressBar } from '@/components/game/progress-bar';
import { Sparkline } from '@/components/game/sparkline';
import { HeadlineStat } from '@/components/game/headline-stat';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  ARPC,
  BRIDGE_RUNWAY_THRESHOLD_WEEKS,
  FOCUS_PROFILES,
  IPO_REVENUE_BAR,
  IPO_SUSTAIN_WEEKS,
  ROUND_COOLDOWN_WEEKS,
  canRaiseRound,
  cLevelPerkMultiplierFor,
  founderStakeFor,
  nextRound,
  roundTermsFor,
  runwayWeeks,
  weeklyReportFor,
} from '@/game/balance';
import { isIpoEligible } from '@/game/score';
import { RoundType } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney, formatWeeks } from '@/lib/format';
import { STAT_EXPLAINERS } from '@/lib/stat-explainers';
import { STAGE_LABEL } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';
import { isGuided, isUnlocked } from '@/game/unlocks';
import { recommendedAction } from '@/lib/recommended-action';
import { Glow } from '@/components/game/glow';
import { LockedFeature } from '@/components/game/locked-feature';

/** Below this the valuation chart is a squiggle, so it isn't drawn. */
const MIN_CHART_HEIGHT = 32;

const ROUND_LABEL: Record<RoundType, string> = {
  seed: 'Seed',
  seriesA: 'Series A',
  seriesB: 'Series B',
};

export default function MoneyScreen() {
  const { state, previousState, dispatch } = useGame();
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [ipoConfirming, setIpoConfirming] = useState(false);
  const [burnBreakdownOpen, setBurnBreakdownOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chartBox, setChartBox] = useState<{ w: number; h: number } | null>(null);
  useTabView('money');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  // Guided first weeks: Money opens with the "Reach 10 customers" quest. Cash
  // and runway stay on the HUD meanwhile, so nothing the player needs is hidden.
  if (!isUnlocked(state, 'money')) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={styles.content}>
          <ThemedText type="sheetTitle">Money</ThemedText>
          <LockedFeature feature="money" title="Raise your first round" />
        </View>
      </View>
    );
  }

  const { burn, revenue, valuation, runway, stake } = deriveWeeklyStats(state);
  const previous = previousState ? deriveWeeklyStats(previousState) : null;
  const report = weeklyReportFor(state);
  const focusArpcMultiplier = FOCUS_PROFILES[state.focus].arpcMultiplier;
  const effectiveHype = state.hype * cLevelPerkMultiplierFor(state.cLevels, 'cmo', 'cmo-hypeGain');
  const cfoDilutionMultiplier = cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-roundTerms');

  const round = nextRound(state.roundsRaised);
  const terms = round
    ? roundTermsFor(round, valuation, state.hype, runway, state.era, cfoDilutionMultiplier)
    : null;
  const stakeAfterRaise = terms
    ? founderStakeFor(state.founderEquity * (1 - terms.dilution), valuation)
    : stake;

  const raiseLocked = round !== null && !canRaiseRound(state.week, state.lastRoundRaisedWeek);
  const cooldownWeeksLeft =
    state.lastRoundRaisedWeek !== null
      ? Math.max(0, ROUND_COOLDOWN_WEEKS - (state.week - state.lastRoundRaisedWeek))
      : 0;
  // Whether this raise still leaves runway under the bridge threshold — the
  // next round would likely also be a bridge, so the dialog says so up front.
  const runwayAfterRaise = terms ? runwayWeeks(state.cash + terms.amount, burn - revenue) : 0;
  const nextRoundLikelyBridgeToo = Boolean(terms?.isBridge) && runwayAfterRaise < BRIDGE_RUNWAY_THRESHOLD_WEEKS;

  // Week-over-week valuation move, shown as the hero's delta chip.
  const valuationChange =
    previous && previous.valuation > 0 ? ((valuation - previous.valuation) / previous.valuation) * 100 : null;
  const valuationUp = (valuationChange ?? 0) >= 0;
  const history = state.valuationHistory ?? [];
  const hasChart = history.length > 1;

  const ipoEligible = isIpoEligible(state.stage, state.ipoWindowOpen, state.weeksRevenueAboveIpoBar);

  // The guided run's recommended action, or the week Money just opened.
  const guided = isGuided(state);
  const raiseRecommended = guided && recommendedAction(state).id === 'raise';

  const raise = () => {
    dispatch({ type: 'RAISE_ROUND' });
    setConfirming(false);
  };

  const goPublic = () => {
    dispatch({ type: 'GO_PUBLIC' });
    setIpoConfirming(false);
  };

  const equityPercent = Math.round(state.founderEquity * 100);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Fits one iPhone 15 screen without scrolling; the ScrollView is only
          the fallback for shorter phones and large text. */}
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.titleRow}>
          <View>
            <ThemedText type="sheetTitle">Money</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {STAGE_LABEL[state.stage]} stage
            </ThemedText>
          </View>
          <Pressable
            onPress={() => setDetailsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Show revenue, runway, equity and IPO details"
            style={[styles.detailsPill, { backgroundColor: theme.accentSurface }]}>
            <ThemedText type="smallBold" themeColor="accent">
              Details ›
            </ThemedText>
          </Pressable>
        </View>

        {/* A guided run's quest strip does the explaining. */}
        {guided ? null : <FirstRunHint id="money" text="Raise before runway drops under 8 weeks or terms get worse." />}

        {/* The hero takes whatever height is left, and the chart grows into it —
            so the tab fills a tall phone and still fits a short one. */}
        <Card tone="plain" style={hasChart ? styles.heroWithChart : undefined}>
          <View style={[styles.heroText, !hasChart && styles.heroTextCompact]}>
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
          {/* Bleeds to the card's bottom edge, like a chart footer. Kept out of
              the tree until there's a series to draw, so the card closes up. */}
          {hasChart ? (
            <View
              style={styles.chart}
              onLayout={(event) => setChartBox({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}>
              {chartBox && chartBox.h >= MIN_CHART_HEIGHT ? (
                <Sparkline data={history} width={chartBox.w} height={chartBox.h} color={theme.success} />
              ) : null}
            </View>
          ) : null}
        </Card>

        <View style={styles.statsRow}>
          <HeadlineStat
            label="Burn / wk"
            value={formatMoney(burn)}
            note={previous && formatMoney(previous.burn) !== formatMoney(burn) ? `was ${formatMoney(previous.burn)}` : 'Where it goes'}
            onPress={() => {
              track(EVENTS.BURN_BREAKDOWN_OPENED, { screen: 'money' });
              setBurnBreakdownOpen(true);
            }}
            accessibilityLabel={`Burn per week: ${formatMoney(burn)}. Show breakdown.`}
          />
          <HeadlineStat
            label="Your stake"
            value={formatMoney(stake)}
            note={`${equityPercent}% of the company`}
          />
        </View>

        {round && terms && !raiseLocked ? (
          <Card style={styles.actionCard}>
            <View style={styles.actionText}>
              <ThemedText type="smallBold">Raise {ROUND_LABEL[round]}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {formatMoney(terms.amount)} for {Math.round(terms.dilution * 100)}%
              </ThemedText>
              {terms.isBridge ? (
                <ThemedText type="footnote" themeColor="warning" numberOfLines={1}>
                  Bridge round: worse terms
                </ThemedText>
              ) : null}
            </View>
            <Glow on={raiseRecommended}>
              <PrimaryButton label="Raise" onPress={() => setConfirming(true)} />
            </Glow>
          </Card>
        ) : (
          <Card style={styles.actionCard}>
            <View style={styles.actionText}>
              <ThemedText type="smallBold">
                {round ? `${ROUND_LABEL[round]} cooling down` : 'Fully funded'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {round
                  ? `Investors want a few weeks of progress. Next round in ${formatWeeks(cooldownWeeksLeft)}.`
                  : 'Seed, Series A and Series B are all raised.'}
              </ThemedText>
            </View>
          </Card>
        )}

        {/* The IPO's progress lives in Details; the button comes out only when it can be pressed. */}
        {ipoEligible ? (
          <Card style={styles.actionCard}>
            <View style={styles.actionText}>
              <ThemedText type="smallBold">IPO window is open</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                Cash out at {formatMoney(valuation)}
              </ThemedText>
            </View>
            <PrimaryButton variant="secondary" label="IPO" onPress={() => setIpoConfirming(true)} />
          </Card>
        ) : null}

      </ScrollView>

      <BottomSheet visible={detailsOpen} onClose={() => setDetailsOpen(false)} title="Revenue, equity & IPO">
        <Card>
          <View style={styles.sheetHeader}>
            <ThemedText type="sectionLabel">Revenue</ThemedText>
            <ThemedText type="smallBold">{formatMoney(revenue)} / wk</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {formatCount(state.customers)} customers × {formatMoney(ARPC)} × {focusArpcMultiplier.toFixed(1)} focus ={' '}
            {formatMoney(report.stats.revenue)}
          </ThemedText>
          <View style={styles.flowRow}>
            <ThemedText type="small" themeColor="success">
              +{formatCount(Math.round(report.customerFlow.gained))} gained
            </ThemedText>
            <ThemedText type="small" themeColor="danger">
              -{formatCount(Math.round(report.customerFlow.churnedQuality))} quality
            </ThemedText>
            <ThemedText type="small" themeColor="danger">
              -{formatCount(Math.round(report.customerFlow.churnedUncovered))} uncovered
            </ThemedText>
            {report.customerFlow.churnedTrendCrash > 0 ? (
              <ThemedText type="small" themeColor="danger">
                -{formatCount(Math.round(report.customerFlow.churnedTrendCrash))} trend crash
              </ThemedText>
            ) : null}
          </View>
          <ThemedText type="small" themeColor="textMuted">
            {STAT_EXPLAINERS.revenue}
          </ThemedText>
        </Card>

        <Card>
          <View style={styles.sheetHeader}>
            <ThemedText type="sectionLabel">Runway</ThemedText>
            <ThemedText type="smallBold">{formatWeeks(runway)}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textMuted">
            {STAT_EXPLAINERS.runway}
          </ThemedText>
        </Card>

        <Card>
          <View style={styles.sheetHeader}>
            <ThemedText type="sectionLabel">Founder equity</ThemedText>
            <ThemedText type="smallBold">{equityPercent}%</ThemedText>
          </View>
          <ProgressBar percent={state.founderEquity * 100} color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            Your stake: {equityPercent}% × {formatMoney(valuation)} = {formatMoney(stake)}
          </ThemedText>
        </Card>

        <Card>
          <ThemedText type="sectionLabel">IPO</ThemedText>
          {state.stage !== 'growth' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
              Unlocks at Growth stage once revenue clears the bar and the IPO window is open.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
                Revenue {formatMoney(revenue)} / {formatMoney(IPO_REVENUE_BAR)} needed
              </ThemedText>
              <ProgressBar percent={(revenue / IPO_REVENUE_BAR) * 100} color={theme.success} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
                Sustained {Math.min(state.weeksRevenueAboveIpoBar, IPO_SUSTAIN_WEEKS)} /{' '}
                {IPO_SUSTAIN_WEEKS} weeks
                {!state.ipoWindowOpen ? ' — IPO window is shut' : ''}
              </ThemedText>
            </>
          )}
        </Card>
      </BottomSheet>

      <BottomSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={`Raise ${round ? ROUND_LABEL[round] : ''}?`}>
        {terms?.isBridge ? (
          <ThemedText type="small" themeColor="warning" style={styles.sheetBody}>
            Runway is under {formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)}, so this is a bridge round: less cash, more
            dilution.
            {nextRoundLikelyBridgeToo
              ? ` This raise still leaves you under ${formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)}, so your next round will likely also be a bridge.`
              : ''}
          </ThemedText>
        ) : null}
        {terms ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
            {formatMoney(terms.amount)} for {Math.round(terms.dilution * 100)}% of the company. Founder equity goes
            from {equityPercent}% to {Math.round(state.founderEquity * (1 - terms.dilution) * 100)}%.
          </ThemedText>
        ) : null}
        {terms ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
            Your stake goes from {formatMoney(stake)} to ~{formatMoney(stakeAfterRaise)}.
          </ThemedText>
        ) : null}
        <View style={styles.sheetActions}>
          <PrimaryButton
            variant="secondary"
            label="Cancel"
            onPress={() => setConfirming(false)}
            style={styles.sheetButton}
          />
          <PrimaryButton label="Raise" onPress={raise} style={styles.sheetButton} />
        </View>
      </BottomSheet>

      <BottomSheet visible={ipoConfirming} onClose={() => setIpoConfirming(false)} title="Go public?">
        <ThemedText type="small" themeColor="textSecondary" style={styles.sheetBody}>
          Ends the run at today&apos;s valuation of {formatMoney(valuation)}. Your {equityPercent}% stake cashes out
          at {formatMoney(stake)}.
        </ThemedText>
        <View style={styles.sheetActions}>
          <PrimaryButton
            variant="secondary"
            label="Cancel"
            onPress={() => setIpoConfirming(false)}
            style={styles.sheetButton}
          />
          <PrimaryButton label="Go Public" onPress={goPublic} style={styles.sheetButton} />
        </View>
      </BottomSheet>

      <BurnBreakdownModal
        state={state}
        visible={burnBreakdownOpen}
        onClose={() => setBurnBreakdownOpen(false)}
      />
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
  heroWithChart: {
    flex: 1,
    minHeight: 0,
  },
  heroText: {
    gap: Spacing.half,
    padding: Spacing.three,
    paddingBottom: 0,
  },
  heroTextCompact: {
    paddingBottom: Spacing.three,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  chart: {
    flex: 1,
    minHeight: 0,
    marginTop: Spacing.two,
    justifyContent: 'flex-end',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  actionText: {
    flex: 1,
    gap: Spacing.half,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
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
