import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { BurnBreakdownModal } from '@/components/game/burn-breakdown-modal';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { PrimaryButton } from '@/components/game/primary-button';
import { ProgressBar } from '@/components/game/progress-bar';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
import { RoundType, Stage } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney, formatWeeks } from '@/lib/format';
import { STAT_EXPLAINERS } from '@/lib/stat-explainers';
import { useGame } from '@/state/game-store';

const STAGE_LABEL: Record<Stage, string> = {
  garage: 'Garage',
  seed: 'Seed',
  seriesA: 'Series A',
  growth: 'Growth',
};

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

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

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

  const ipoEligible = isIpoEligible(state.stage, state.ipoWindowOpen, state.weeksRevenueAboveIpoBar);

  const raise = () => {
    dispatch({ type: 'RAISE_ROUND' });
    setConfirming(false);
  };

  const goPublic = () => {
    dispatch({ type: 'GO_PUBLIC' });
    setIpoConfirming(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Money</ThemedText>
        <ThemedText themeColor="textSecondary">{STAGE_LABEL[state.stage]} stage</ThemedText>

        <FirstRunHint id="money" text="Raise before runway drops under 8 weeks or terms get worse." />

        <View style={styles.grid}>
          <StatTile
            label="Weekly burn"
            value={burn}
            previousValue={previous?.burn}
            format={formatMoney}
            goodDirection="down"
            hint="Tap for breakdown"
            onPress={() => setBurnBreakdownOpen(true)}
          />
          <StatTile
            label="Runway"
            value={runway}
            previousValue={previous?.runway}
            format={formatWeeks}
            goodDirection="up"
            explainer={STAT_EXPLAINERS.runway}
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

        <ThemedView type="backgroundElement" style={styles.breakdownBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            Revenue breakdown
          </ThemedText>
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
        </ThemedView>

        <View style={styles.equityBlock}>
          <View style={styles.equityHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              Founder equity
            </ThemedText>
            <ThemedText type="smallBold">{Math.round(state.founderEquity * 100)}%</ThemedText>
          </View>
          <ProgressBar percent={state.founderEquity * 100} color="#3c87f7" />
          <ThemedText type="small" themeColor="textSecondary">
            Your stake: {Math.round(state.founderEquity * 100)}% × {formatMoney(valuation)} = {formatMoney(stake)}
          </ThemedText>
        </View>

        {round && terms && !raiseLocked ? (
          <ThemedView type="backgroundElement" style={styles.raiseCard}>
            <ThemedText type="smallBold">Raise {ROUND_LABEL[round]}</ThemedText>
            {terms.isBridge ? (
              <ThemedText type="small" style={styles.bridgeWarning}>
                Runway is under {formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)} — this is a bridge
                round: less cash, more dilution.
                {nextRoundLikelyBridgeToo
                  ? ` This raise still leaves you under ${formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)} — your next round will likely also be a bridge.`
                  : ''}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              {formatMoney(terms.amount)} for {Math.round(terms.dilution * 100)}% of the company
            </ThemedText>
            <PrimaryButton
              label={`Raise ${ROUND_LABEL[round]}`}
              onPress={() => setConfirming(true)}
            />
          </ThemedView>
        ) : round && raiseLocked ? (
          <ThemedView type="backgroundElement" style={styles.raiseCard}>
            <ThemedText type="smallBold">{ROUND_LABEL[round]} cooling down</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              The last round just closed — the market wants to see a few weeks of progress first.
              Next round available in {formatWeeks(cooldownWeeksLeft)}.
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.raiseCard}>
            <ThemedText type="smallBold">Fully funded</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Seed, Series A, and Series B are all raised. No more rounds available.
            </ThemedText>
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={[styles.ipoCard, ipoEligible && styles.ipoCardReady]}>
          <ThemedText type="smallBold" themeColor={ipoEligible ? 'text' : 'textSecondary'}>
            IPO
          </ThemedText>
          {state.stage !== 'growth' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.ipoBody}>
              Unlocks at Growth stage once revenue clears the bar and the IPO window is open.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.ipoBody}>
                Revenue {formatMoney(revenue)} / {formatMoney(IPO_REVENUE_BAR)} needed
              </ThemedText>
              <ProgressBar percent={(revenue / IPO_REVENUE_BAR) * 100} color="#22c55e" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.ipoBody}>
                Sustained {Math.min(state.weeksRevenueAboveIpoBar, IPO_SUSTAIN_WEEKS)} /{' '}
                {IPO_SUSTAIN_WEEKS} weeks
                {!state.ipoWindowOpen ? ' — IPO window is shut' : ''}
              </ThemedText>
            </>
          )}
          <PrimaryButton
            variant="secondary"
            label="IPO"
            disabled={!ipoEligible}
            onPress={() => setIpoConfirming(true)}
          />
        </ThemedView>
      </ScrollView>

      <Modal visible={confirming} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold">Raise {round ? ROUND_LABEL[round] : ''}?</ThemedText>
            {terms ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.modalBody}>
                {formatMoney(terms.amount)} for {Math.round(terms.dilution * 100)}% of the
                company. Founder equity goes from {Math.round(state.founderEquity * 100)}% to{' '}
                {Math.round(state.founderEquity * (1 - terms.dilution) * 100)}%.
              </ThemedText>
            ) : null}
            {terms ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.modalBody}>
                Your stake goes from {formatMoney(stake)} to ~{formatMoney(stakeAfterRaise)}.
              </ThemedText>
            ) : null}
            <View style={styles.modalActions}>
              <PrimaryButton
                variant="secondary"
                label="Cancel"
                onPress={() => setConfirming(false)}
                style={styles.modalButton}
              />
              <PrimaryButton label="Raise" onPress={raise} style={styles.modalButton} />
            </View>
          </ThemedView>
        </View>
      </Modal>

      <Modal visible={ipoConfirming} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold">Go public?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.modalBody}>
              Ends the run at today&apos;s valuation of {formatMoney(valuation)}. Your {Math.round(state.founderEquity * 100)}%
              stake cashes out at {formatMoney(stake)}.
            </ThemedText>
            <View style={styles.modalActions}>
              <PrimaryButton
                variant="secondary"
                label="Cancel"
                onPress={() => setIpoConfirming(false)}
                style={styles.modalButton}
              />
              <PrimaryButton label="Go Public" onPress={goPublic} style={styles.modalButton} />
            </View>
          </ThemedView>
        </View>
      </Modal>

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
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  breakdownBlock: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  flowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  equityBlock: {
    gap: Spacing.two,
  },
  equityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  raiseCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  bridgeWarning: {
    color: '#f59e0b',
  },
  ipoCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
    opacity: 0.6,
  },
  ipoCardReady: {
    opacity: 1,
  },
  ipoBody: {
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalBody: {
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  modalButton: {
    flex: 1,
  },
});
