import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { purchasesAvailable } from '@/purchases';
import { BuyWeeksSheet, type BuyWeeksTrigger } from '@/components/game/buy-weeks-sheet';
import { DecisionModal } from '@/components/game/decision-modal';
import { HintSlot, useFirstRunHint } from '@/components/game/first-run-hint';
import { requestNotificationPermissionOnce } from '@/components/game/notification-manager';
import { PrimaryButton } from '@/components/game/primary-button';
import { SpotlightHint } from '@/components/game/spotlight-hint';
import { ThemedText } from '@/components/themed-text';
import { WeekInReviewSheet, type RivalShareMove } from '@/components/game/week-in-review-sheet';
import { WeekTicker } from '@/components/game/week-ticker';
import { Spacing } from '@/constants/theme';
import { isNotableWeek } from '@/game/digest';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { useGame } from '@/state/game-store';
import { WEEKS_BANK_CAP, canSpendAnyWeek } from '@/state/week-budget';

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
  // The one-time "this is the whole game" callout over Next Week. Retired by
  // the first tick, so pressing the button counts as reading it.
  const spotlight = useFirstRunHint('next-week-spotlight');

  const pendingWeek =
    state !== null && !state.gameOver && previousState !== null && !state.pendingEvent
      ? state.week
      : null;
  useEffect(() => {
    if (pendingWeek === null) return;
    const timer = setTimeout(() => setRecapArmedWeek(pendingWeek), 350);
    return () => clearTimeout(timer);
  }, [pendingWeek]);

  // Store-layer daily week budget (PRD F12) plus the IAP-purchased pool — a
  // no-op while either is still resolving (null), so play is never blocked
  // by a slow AsyncStorage read. Derived above the early return below because
  // the permission effect (a hook) has to sit above it too; it reads none of
  // `state`, so hoisting it costs nothing.
  const budgetExhausted =
    !devFreePlay && weekBudget !== null && purchasedWeeks !== null && !canSpendAnyWeek(weekBudget, purchasedWeeks);
  const pendingEvent = state?.pendingEvent;
  // Mirrors the early return below. `budgetExhausted` reads nothing about the
  // run, so without this the ask would also fire when this component renders
  // nothing at all — over a bankruptcy screen, or before the save has loaded.
  const runActive = state !== null && !state.gameOver;

  // The daily wall is the one moment the player has just felt why a nudge is
  // worth allowing — ask here rather than on a second launch most players never
  // have. `requestNotificationPermissionOnce` is a no-op after the first call.
  // Never while a decision card is up: the DecisionModal owns the screen then,
  // and this repo has a documented iOS hang when one modal presents into a
  // frame another is dismissing (see docs/bug-stuck-decision-modal.md).
  useEffect(() => {
    if (!runActive) return; // no wall on screen — the run ended or is still loading
    if (!budgetExhausted) return;
    if (pendingEvent) return;
    requestNotificationPermissionOnce('daily_wall').catch(() => {});
  }, [budgetExhausted, pendingEvent, runActive]);

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

  const canAdvance = !state.pendingEvent && !budgetExhausted;
  // Down to the final free dot, with nothing purchased to fall back on — the
  // moment the daily budget is worth explaining, before it bites.
  const onLastFreeWeek =
    !budgetExhausted && weekBudget?.weeksRemaining === 1 && (purchasedWeeks?.weeksRemaining ?? 0) === 0;

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
        {spotlight.visible && canAdvance ? (
          <SpotlightHint text="This is the whole game → advance a week" onDismiss={spotlight.dismiss} />
        ) : null}

        <View style={styles.footer}>
          <PrimaryButton
            label={budgetExhausted ? 'That’s the week — see you tomorrow' : 'Next Week →'}
            onPress={() => {
              if (spotlight.visible) spotlight.dismiss();
              // Dispatched even when the daily budget is spent: the store's TICK
              // gate swallows it and captures WEEK_ADVANCE_BLOCKED, which is the
              // only signal that tells a hit-the-wall player apart from one who
              // drifted off before reaching it. Where purchases exist, the press
              // also opens the week-pack sheet.
              dispatch({ type: 'TICK' });
              if (budgetExhausted && purchasesAvailable) setBuySheetTrigger('out_of_weeks');
            }}
            disabled={!!state.pendingEvent}
            style={styles.nextButton}
          />
        </View>

        {/* Held back while the spotlight is up, so the chrome never stacks two callouts. */}
        <HintSlot
          style={styles.budgetHint}
          hints={[
            {
              id: 'week-budget-dots',
              text: 'You get a few free weeks each day — the dots below. They refill tomorrow.',
              when: onLastFreeWeek && !spotlight.visible,
            },
            {
              id: 'out-of-weeks',
              text: `Out of weeks for today. Come back tomorrow — ${state.companyName} will be waiting.`,
              when: budgetExhausted && !spotlight.visible,
            },
          ]}
        />

        <View style={styles.budgetRow}>
          {budgetExhausted ? (
            purchasesAvailable ? (
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
            purchasesAvailable ? (
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

      {purchasesAvailable ? (
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
            { backgroundColor: i < weeksRemaining ? theme.text : theme.surfaceRaised },
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
  budgetHint: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
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
