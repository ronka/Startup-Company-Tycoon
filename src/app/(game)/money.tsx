import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/game/primary-button';
import { ProgressBar } from '@/components/game/progress-bar';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  BRIDGE_RUNWAY_THRESHOLD_WEEKS,
  cLevelPayroll,
  cLevelPerkMultiplier,
  nextRound,
  revenueFor,
  roundTermsFor,
  runwayWeeks,
  salesFactorFor,
  valuationFor,
  weeklyBurnFor,
} from '@/game/balance';
import { RoundType, Stage } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, formatWeeks } from '@/lib/format';
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
  const { state, dispatch } = useGame();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);

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

  const round = nextRound(state.roundsRaised);
  const terms = round ? roundTermsFor(round, valuation, state.hype, runway) : null;

  const raise = () => {
    dispatch({ type: 'RAISE_ROUND' });
    setConfirming(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <ThemedText type="subtitle">Money</ThemedText>
        <ThemedText themeColor="textSecondary">{STAGE_LABEL[state.stage]} stage</ThemedText>

        <View style={styles.grid}>
          <StatTile label="Cash" value={formatMoney(state.cash)} />
          <StatTile label="Weekly burn" value={formatMoney(burn)} />
          <StatTile label="Runway" value={formatWeeks(runway)} />
          <StatTile label="Valuation" value={formatMoney(valuation)} />
        </View>

        <View style={styles.equityBlock}>
          <View style={styles.equityHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              Founder equity
            </ThemedText>
            <ThemedText type="smallBold">{Math.round(state.founderEquity * 100)}%</ThemedText>
          </View>
          <ProgressBar percent={state.founderEquity * 100} color="#3c87f7" />
        </View>

        {round && terms ? (
          <ThemedView type="backgroundElement" style={styles.raiseCard}>
            <ThemedText type="smallBold">Raise {ROUND_LABEL[round]}</ThemedText>
            {terms.isBridge ? (
              <ThemedText type="small" style={styles.bridgeWarning}>
                Runway is under {formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)} — this is a bridge
                round: less cash, more dilution.
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
        ) : (
          <ThemedView type="backgroundElement" style={styles.raiseCard}>
            <ThemedText type="smallBold">Fully funded</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Seed, Series A, and Series B are all raised. No more rounds available.
            </ThemedText>
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={styles.ipoCard}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            IPO
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.ipoBody}>
            Unlocks at Growth stage once revenue clears the bar and the IPO window is open. Coming
            soon.
          </ThemedText>
          <PrimaryButton variant="secondary" label="IPO" disabled onPress={() => {}} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  grid: {
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
