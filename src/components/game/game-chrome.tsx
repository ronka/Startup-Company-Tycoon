import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuyWeeksSheet, type BuyWeeksTrigger } from '@/components/game/buy-weeks-sheet';
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
import { WEEKS_BANK_CAP, canSpendAnyWeek } from '@/state/week-budget';

// Week packs (Task 2, PRD week-packs) are iOS-only for v1 — Android/web keep
// today's free-only behavior exactly, no sheet and no tappable affordance.
const IS_IOS = Platform.OS === 'ios';

/**
 * Persistent chrome shared by every game tab (Task 12): the Next Week
 * control, the pending-decision modal, and the post-tick
 * recap (a full Week in Review sheet on notable weeks, a compact dismissible
 * ticker on quiet ones — Task 13). Rendered once in `(game)/_layout.tsx`
 * rather than per-screen so its two `Modal`s never stack duplicates across
 * tabs that stay mounted in the background.
 */
export function GameChrome() {
  const { state, previousState, dispatch, weekBudget, purchasedWeeks, creditPurchase, devFreePlay, setDevFreePlay } =
    useGame();
  const insets = useSafeAreaInsets();
  const [reviewedWeek, setReviewedWeek] = useState<number | null>(null);
  const [tickerDismissedWeek, setTickerDismissedWeek] = useState<number | null>(null);
  const [buySheetTrigger, setBuySheetTrigger] = useState<BuyWeeksTrigger | null>(null);
  // Week whose recap has "settled" — armed a beat after its tick's decision
  // card (if any) is answered, so the recap never presents into the same frame
  // the DecisionModal is dismissing (present-while-dismiss hangs iOS — see
  // docs/bug-stuck-decision-modal.md).
  const [recapArmedWeek, setRecapArmedWeek] = useState<number | null>(null);

  const pendingWeek =
    state !== null && !state.gameOver && previousState !== null && !state.pendingEvent
      ? state.week
      : null;
  useEffect(() => {
    if (pendingWeek === null) return;
    const timer = setTimeout(() => setRecapArmedWeek(pendingWeek), 350);
    return () => clearTimeout(timer);
  }, [pendingWeek]);

  if (!state || state.gameOver) return null;

  const { burn, revenue, valuation } = deriveWeeklyStats(state);
  const weekEntries = state.newsLog.filter((entry) => entry.week === state.week);
  const notable = isNotableWeek(weekEntries);

  // Show once per tick, after any decision card that tick drew has been
  // answered (pendingEvent clears). previousState only exists once at least
  // one tick has happened this session, so neither ever fires on app open.
  const hasUnseenTick = previousState !== null && !state.pendingEvent && recapArmedWeek === state.week;
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

  // Store-layer daily week budget (PRD F12) plus the IAP-purchased pool — a
  // no-op while either is still resolving (null), so play is never blocked
  // by a slow AsyncStorage read.
  const budgetExhausted =
    !devFreePlay && weekBudget !== null && purchasedWeeks !== null && !canSpendAnyWeek(weekBudget, purchasedWeeks);
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

      <View style={[styles.chrome, { paddingBottom: insets.bottom + Spacing.two }]}>
        <View style={styles.footer}>
          <PrimaryButton
            label="Next Week →"
            onPress={() => dispatch({ type: 'TICK' })}
            disabled={!canAdvance}
            style={styles.nextButton}
          />
        </View>

        <View style={styles.budgetRow}>
          {budgetExhausted ? (
            IS_IOS ? (
              <Pressable onPress={() => setBuySheetTrigger('out_of_weeks')} accessibilityRole="button">
                <ThemedText type="small" themeColor="textSecondary" style={styles.budgetCopy}>
                  That&apos;s the week planned out — the team gets to work.{' '}
                  <ThemedText type="smallBold" themeColor="text">
                    Buy more weeks →
                  </ThemedText>
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.budgetCopy}>
                That&apos;s the week planned out — the team gets to work. Come back tomorrow.
              </ThemedText>
            )
          ) : weekBudget ? (
            IS_IOS ? (
              <Pressable onPress={() => setBuySheetTrigger('hud')} accessibilityRole="button">
                <WeekBudgetDots
                  weeksRemaining={weekBudget.weeksRemaining}
                  purchasedWeeksRemaining={purchasedWeeks?.weeksRemaining ?? 0}
                />
              </Pressable>
            ) : (
              <WeekBudgetDots
                weeksRemaining={weekBudget.weeksRemaining}
                purchasedWeeksRemaining={purchasedWeeks?.weeksRemaining ?? 0}
              />
            )
          ) : null}

          {__DEV__ ? (
            <Pressable onPress={() => setDevFreePlay(!devFreePlay)} accessibilityRole="button">
              <ThemedText type="small" themeColor={devFreePlay ? 'success' : 'textSecondary'}>
                {devFreePlay ? 'Free play: ON' : 'Free play: off'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
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

      {IS_IOS ? (
        <BuyWeeksSheet
          visible={buySheetTrigger !== null}
          trigger={buySheetTrigger ?? 'hud'}
          onClose={() => setBuySheetTrigger(null)}
          onPurchased={creditPurchase}
        />
      ) : null}
    </>
  );
}

/**
 * Diegetic, non-numeric stand-in for a battery/energy meter: one filled dot
 * per free week still available today (banked weeks included), out of the
 * bank cap. Purchased weeks are cap-exempt and shown separately as a "+N"
 * companion — since they never expire, a dot-per-week meter would grow
 * unbounded — so a numeric badge is used there instead.
 */
function WeekBudgetDots({
  weeksRemaining,
  purchasedWeeksRemaining,
}: {
  weeksRemaining: number;
  purchasedWeeksRemaining: number;
}) {
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
      {purchasedWeeksRemaining > 0 ? (
        <ThemedText type="small" themeColor="success" style={styles.purchasedBadge}>
          +{purchasedWeeksRemaining}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    paddingTop: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  nextButton: {
    flex: 1,
    paddingVertical: Spacing.two,
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
  purchasedBadge: {
    marginLeft: Spacing.half,
  },
});
