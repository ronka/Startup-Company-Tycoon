import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DecisionModal } from '@/components/game/decision-modal';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { WeekInReviewSheet, type RivalShareMove } from '@/components/game/week-in-review-sheet';
import { WeekTicker } from '@/components/game/week-ticker';
import { Spacing } from '@/constants/theme';
import { isNotableWeek } from '@/game/digest';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { useGame } from '@/state/game-store';
import { WEEKS_BANK_CAP, canSpendWeek } from '@/state/week-budget';

/** How many weeks a single fast-forward tap advances (before an early stop). */
const FAST_FORWARD_WEEKS = 4;

/**
 * Persistent chrome shared by every game tab (Task 12): the Next Week /
 * fast-forward controls, the pending-decision modal, and the post-tick
 * recap (a full Week in Review sheet on notable weeks, a compact dismissible
 * ticker on quiet ones — Task 13). Rendered once in `(game)/_layout.tsx`
 * rather than per-screen so its two `Modal`s never stack duplicates across
 * tabs that stay mounted in the background.
 */
export function GameChrome() {
  const { state, previousState, dispatch, fastForward, weekBudget, devFreePlay, setDevFreePlay } = useGame();
  const insets = useSafeAreaInsets();
  const [reviewedWeek, setReviewedWeek] = useState<number | null>(null);
  const [tickerDismissedWeek, setTickerDismissedWeek] = useState<number | null>(null);

  if (!state || state.gameOver) return null;

  const { burn, revenue, valuation } = deriveWeeklyStats(state);
  const weekEntries = state.newsLog.filter((entry) => entry.week === state.week);
  const notable = isNotableWeek(weekEntries);

  // Show once per tick, after any decision card that tick drew has been
  // answered (pendingEvent clears). previousState only exists once at least
  // one tick has happened this session, so neither ever fires on app open.
  const hasUnseenTick = previousState !== null && !state.pendingEvent;
  const showReview = hasUnseenTick && notable && state.week !== reviewedWeek;
  const showTicker = hasUnseenTick && !notable && state.week !== tickerDismissedWeek;

  const cashDelta = previousState ? state.cash - previousState.cash : 0;
  const moraleDelta = previousState ? state.morale - previousState.morale : 0;
  const yourShareDelta = previousState ? state.marketShare - previousState.marketShare : 0;
  const rivalShares: RivalShareMove[] = previousState
    ? state.rivals.map((rival, index) => ({
        name: rival.name,
        delta: rival.marketShare - (previousState.rivals[index]?.marketShare ?? rival.marketShare),
      }))
    : [];

  // Store-layer daily week budget (PRD F12) — a no-op while the initial load
  // is still resolving (weekBudget null), so play is never blocked by a slow
  // AsyncStorage read.
  const budgetExhausted = !devFreePlay && weekBudget !== null && !canSpendWeek(weekBudget);
  const canAdvance = !state.pendingEvent && !budgetExhausted;

  return (
    <>
      {showTicker ? (
        <WeekTicker
          week={state.week}
          cashDelta={cashDelta}
          revenue={revenue}
          burn={burn}
          onDismiss={() => setTickerDismissedWeek(state.week)}
        />
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <PrimaryButton
          label="Next Week →"
          onPress={() => dispatch({ type: 'TICK' })}
          disabled={!canAdvance}
          style={styles.nextButton}
        />
        <PrimaryButton
          variant="secondary"
          label={`⏩ ${FAST_FORWARD_WEEKS}`}
          onPress={() => fastForward(FAST_FORWARD_WEEKS)}
          disabled={!canAdvance}
          style={styles.ffButton}
        />
      </View>

      <View style={styles.budgetRow}>
        {budgetExhausted ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.budgetCopy}>
            That&apos;s the week planned out — the team gets to work. Come back tomorrow.
          </ThemedText>
        ) : weekBudget ? (
          <WeekBudgetDots weeksRemaining={weekBudget.weeksRemaining} />
        ) : null}

        {__DEV__ ? (
          <Pressable onPress={() => setDevFreePlay(!devFreePlay)} accessibilityRole="button">
            <ThemedText type="small" themeColor={devFreePlay ? 'success' : 'textSecondary'}>
              {devFreePlay ? 'Free play: ON' : 'Free play: off'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <DecisionModal
        card={state.pendingEvent}
        valuation={valuation}
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
    </>
  );
}

/**
 * Diegetic, non-numeric stand-in for a battery/energy meter: one filled dot
 * per week still available today (banked weeks included), out of the bank
 * cap. No digits anywhere — just how full the row looks.
 */
function WeekBudgetDots({ weeksRemaining }: { weeksRemaining: number }) {
  const theme = useTheme();
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: WEEKS_BANK_CAP }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i < weeksRemaining ? theme.text : theme.backgroundElement },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  nextButton: {
    flex: 1,
  },
  ffButton: {
    minWidth: 72,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  budgetCopy: {
    flexShrink: 1,
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
