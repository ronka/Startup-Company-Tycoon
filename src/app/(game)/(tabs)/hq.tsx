import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BurnBreakdownModal } from '@/components/game/burn-breakdown-modal';
import { FirstRunHint, HintSlot } from '@/components/game/first-run-hint';
import { FocusPicker, type FocusPickerHandle } from '@/components/game/focus-picker';
import { InsolvencyBanner } from '@/components/game/insolvency-banner';
import { NewsFeed } from '@/components/game/news-feed';
import { PrimaryButton } from '@/components/game/primary-button';
import { Sparkline } from '@/components/game/sparkline';
import { StatTile } from '@/components/game/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { FOCUS_TRANSITION_WEEKS, weeklyReportFor } from '@/game/balance';
import type { FocusId } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney } from '@/lib/format';
import { STAT_EXPLAINERS } from '@/lib/stat-explainers';
import { BOTTLENECK_LABEL, FOCUS_LABEL, trendAlignmentFor } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';

/** Runway below this many weeks is where a founder should be thinking about raising. */
const SHORT_RUNWAY_WEEKS = 10;
/** By this week, a player who still hasn't opened the drawer gets pointed at it. */
const DRAWER_HINT_WEEK = 6;

export default function HqScreen() {
  const { state, previousState, dispatch } = useGame();
  const theme = useTheme();
  const [pendingFocus, setPendingFocus] = useState<FocusId | null>(null);
  const [burnBreakdownOpen, setBurnBreakdownOpen] = useState(false);
  const focusPickerRef = useRef<FocusPickerHandle>(null);
  useTabView('hq');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const { burn, revenue, valuation, insolvent, runway } = deriveWeeklyStats(state);
  const runwayIsShort = Number.isFinite(runway) && runway < SHORT_RUNWAY_WEEKS;
  const previous = previousState ? deriveWeeklyStats(previousState) : null;
  const report = weeklyReportFor(state);

  const requestFocus = (focus: FocusId) => {
    focusPickerRef.current?.dismiss();
    setPendingFocus(focus);
  };

  const confirmFocus = () => {
    if (pendingFocus) dispatch({ type: 'SET_FOCUS', focus: pendingFocus });
    setPendingFocus(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle" numberOfLines={1}>
          {state.companyName} HQ
        </ThemedText>

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

        {state.valuationHistory && state.valuationHistory.length > 1 ? <Sparkline data={state.valuationHistory} /> : null}

        <View style={styles.grid}>
          <StatTile
            label="Weekly burn"
            value={burn}
            previousValue={previous?.burn}
            format={formatMoney}
            goodDirection="down"
            hint="Tap for breakdown"
            onPress={() => {
              track(EVENTS.BURN_BREAKDOWN_OPENED, { screen: 'hq' });
              setBurnBreakdownOpen(true);
            }}
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

        <Pressable
          onPress={() => {
            track(EVENTS.FOCUS_PICKER_OPENED, { focus: state.focus });
            focusPickerRef.current?.present();
          }}
          accessibilityRole="button"
          accessibilityLabel="Change company focus">
          <ThemedView type="backgroundElement" style={styles.strategyCard}>
            <View style={styles.strategyHeader}>
              <ThemedText type="small" themeColor="textSecondary">
                Strategy
              </ThemedText>
              <ThemedText type="link">Change</ThemedText>
            </View>
            <ThemedText type="smallBold">{FOCUS_LABEL[state.focus]}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {trendAlignmentFor(state.focus, state.trend)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Bottleneck: {BOTTLENECK_LABEL[report.bottleneck]}
            </ThemedText>
          </ThemedView>
        </Pressable>

        <View style={styles.newsSection}>
          <ThemedText type="small" themeColor="textSecondary">
            News
          </ThemedText>
          <NewsFeed entries={state.newsLog} />
        </View>
      </ScrollView>

      <Modal visible={pendingFocus !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold">Switch focus?</ThemedText>
            <FirstRunHint
              id="focus-switch"
              text={`Switching focus costs ~${FOCUS_TRANSITION_WEEKS} weeks of drag — commit, don't flip-flop.`}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.modalBody}>
              {pendingFocus
                ? `Switching to ${FOCUS_LABEL[pendingFocus]} costs ${FOCUS_TRANSITION_WEEKS} weeks of reduced dev effort and conversion while the team retools.`
                : ''}
            </ThemedText>
            <View style={styles.modalActions}>
              <PrimaryButton
                variant="secondary"
                label="Cancel"
                onPress={() => setPendingFocus(null)}
                style={styles.modalButton}
              />
              <PrimaryButton
                variant="primary"
                label="Confirm switch"
                onPress={confirmFocus}
                style={styles.modalButton}
              />
            </View>
          </ThemedView>
        </View>
      </Modal>

      <BurnBreakdownModal
        state={state}
        visible={burnBreakdownOpen}
        onClose={() => setBurnBreakdownOpen(false)}
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
  strategyCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  strategyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
