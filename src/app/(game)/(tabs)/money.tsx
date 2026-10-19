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
  FOCUS_PROFILES,
  IPO_REVENUE_BAR,
  IPO_SUSTAIN_WEEKS,
  ROUND_COOLDOWN_WEEKS,
  ROUND_MIN_VALUATION,
  canRaiseRound,
  cLevelPerkMultiplierFor,
  nextRound,
  roundOpenAt,
  weeklyReportFor,
} from '@/game/balance';
import { ROUND_LABEL, acceptedDilutionFor, investorById, weeksToExpiry } from '@/game/investors';
import { ROUND_ORDER } from '@/game/types';
import { isIpoEligible } from '@/game/score';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney, formatWeeks } from '@/lib/format';
import { STAT_EXPLAINERS } from '@/lib/stat-explainers';
import { STAGE_LABEL } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';
import { isGuided, isUnlocked } from '@/game/unlocks';
import { Glow } from '@/components/game/glow';
import { LockedFeature } from '@/components/game/locked-feature';
import { GuideAnchor, useGuideFor } from '@/components/game/guide-pointer';
import { TermSheetsSheet } from '@/components/game/term-sheets-sheet';
import { celebrateRound } from '@/components/game/round-celebration';

/** Below this the valuation chart is a squiggle, so it isn't drawn. */
const MIN_CHART_HEIGHT = 32;

export default function MoneyScreen() {
  const { state, previousState, dispatch } = useGame();
  const theme = useTheme();
  const [offersOpen, setOffersOpen] = useState(false);
  // Bumped on every open so the term sheets sheet remounts on the list, not a stale confirm step.
  const [offersOpenCount, setOffersOpenCount] = useState(0);
  const [ipoConfirming, setIpoConfirming] = useState(false);
  const [burnBreakdownOpen, setBurnBreakdownOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chartBox, setChartBox] = useState<{ w: number; h: number } | null>(null);
  useTabView('money');
  // The coach's tooltip, when it points at Raise.
  const guideRaise = useGuideFor((target) => target.kind === 'raise');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  // Guided first weeks: Money opens with the "Reach 5 customers" quest. Cash
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

  const round = nextRound(state.roundsRaised);
  const offers = state.fundingOffers ?? [];
  const raiseLocked = round !== null && !canRaiseRound(state.week, state.lastRoundRaisedWeek);
  const cooldownWeeksLeft =
    state.lastRoundRaisedWeek !== null
      ? Math.max(0, ROUND_COOLDOWN_WEEKS - (state.week - state.lastRoundRaisedWeek))
      : 0;
  // Late rounds wait on traction: no term sheets until valuation clears the bar.
  const roundShut = round !== null && !raiseLocked && !roundOpenAt(round, valuation) && offers.length === 0;
  // Open round, empty table: every offer was passed on (the table refills on the next week).
  const tableEmpty = round !== null && !raiseLocked && !roundShut && offers.length === 0;
  const expiringNow = offers.some((o) => weeksToExpiry(state, o) === 0);
  const offerNames = offers.map((o) => investorById(o.investorId)?.name ?? 'An investor');

  // Week-over-week valuation move, shown as the hero's delta chip.
  const valuationChange =
    previous && previous.valuation > 0 ? ((valuation - previous.valuation) / previous.valuation) * 100 : null;
  const valuationUp = (valuationChange ?? 0) >= 0;
  const history = state.valuationHistory ?? [];
  const hasChart = history.length > 1;

  const ipoEligible = isIpoEligible(state.stage, state.ipoWindowOpen, state.weeksRevenueAboveIpoBar);

  const guided = isGuided(state);

  const acceptOffer = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    dispatch({ type: 'ACCEPT_FUNDING_OFFER', offerId });
    setOffersOpen(false);
    // Signing is the biggest beat in a run: throw a party.
    if (offer) {
      celebrateRound({
        roundLabel: ROUND_LABEL[offer.round],
        investorName: investorById(offer.investorId)?.name ?? 'your new investor',
        amount: offer.amount,
        equityAfter: state.founderEquity * (1 - acceptedDilutionFor(state, offer)),
        finalRound: offer.round === ROUND_ORDER[ROUND_ORDER.length - 1],
      });
    }
  };

  const declineOffer = (offerId: string) => {
    dispatch({ type: 'DECLINE_FUNDING_OFFER', offerId });
    // Passing on the last one closes the sheet rather than leaving it empty.
    if (offers.length <= 1) setOffersOpen(false);
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
        {guided ? null : <FirstRunHint id="money" text="Investors send term sheets over time. Take one before runway drops under 8 weeks or terms get worse." />}

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

        {round && offers.length > 0 && !raiseLocked ? (
          <GuideAnchor step={guideRaise} align="right" inset={RAISE_FROM_RIGHT}>
            <Card style={styles.actionCard}>
              <View style={styles.actionText}>
                <ThemedText type="smallBold">
                  {ROUND_LABEL[round]}: {offers.length} term sheet{offers.length === 1 ? '' : 's'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {offerNames.length > 2 ? `${offerNames.slice(0, 2).join(', ')} +${offerNames.length - 2}` : offerNames.join(' & ')}
                </ThemedText>
                {expiringNow ? (
                  <ThemedText type="footnote" themeColor="warning" numberOfLines={1}>
                    One expires this week
                  </ThemedText>
                ) : null}
              </View>
              <Glow on={guideRaise !== null}>
                <PrimaryButton
                  label="Review"
                  onPress={() => {
                    setOffersOpenCount((n) => n + 1);
                    setOffersOpen(true);
                  }}
                />
              </Glow>
            </Card>
          </GuideAnchor>
        ) : (
          <Card style={styles.actionCard}>
            <View style={styles.actionText}>
              <ThemedText type="smallBold">
                {!round
                  ? 'Fully funded'
                  : roundShut
                    ? `${ROUND_LABEL[round]}: no term sheets yet`
                    : tableEmpty
                      ? `${ROUND_LABEL[round]}: no term sheets this week`
                      : `${ROUND_LABEL[round]} cooling down`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {!round
                  ? 'Seed through Series G are all raised.'
                  : roundShut
                    ? `Late-stage investors want a ${formatMoney(ROUND_MIN_VALUATION[round])} valuation before they call.`
                    : tableEmpty
                      ? 'New investors will reach out next week.'
                      : `Investors want a few weeks of progress. Next round in ${formatWeeks(cooldownWeeksLeft)}.`}
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

      <TermSheetsSheet
        key={offersOpenCount}
        state={state}
        visible={offersOpen}
        onClose={() => setOffersOpen(false)}
        onAccept={acceptOffer}
        onDecline={declineOffer}
      />

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

/** Roughly the Review button's centre, in from the action card's right edge. */
const RAISE_FROM_RIGHT = Spacing.three + 40;

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
