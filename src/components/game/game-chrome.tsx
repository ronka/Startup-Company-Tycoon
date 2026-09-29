import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { purchasesAvailable } from '@/purchases';
import { EVENTS, track } from '@/analytics/events';
import { BuyWeeksSheet } from '@/components/game/buy-weeks-sheet';
import { DayCompleteSheet } from '@/components/game/day-complete-sheet';
import { DecisionModal } from '@/components/game/decision-modal';
import { HintSlot, useFirstRunHint } from '@/components/game/first-run-hint';
import { NotificationPermissionAsk } from '@/components/game/notification-permission-ask';
import { PrimaryButton } from '@/components/game/primary-button';
import { SpotlightHint } from '@/components/game/spotlight-hint';
import { ThemedText } from '@/components/themed-text';
import { WeekInReviewSheet, type RivalShareMove } from '@/components/game/week-in-review-sheet';
import { WeekTicker } from '@/components/game/week-ticker';
import { Spacing } from '@/constants/theme';
import { isNotableWeek } from '@/game/digest';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { tomorrowAgendaFor } from '@/state/day-close';
import { useBuyWeeksFlow } from '@/state/buy-weeks-flow';
import { useGame } from '@/state/game-store';
import { notificationAskSpentOnDateKey } from '@/state/notification-permission';
import { notificationAskSettled } from '@/state/review-ask';
import { reportReviewSuppressed, requestReviewOnce } from '@/state/store-review';
import {
  WEEKS_BANK_CAP,
  WEEKS_PER_DAY,
  dateKey,
  formatRefillCountdown,
  isWeekBudgetExhausted,
  nextWeekRefillAt,
} from '@/state/week-budget';

/** The budget state the wall was pressed in; see `wallTappedFor`. */
interface WallKey {
  weekBudget: unknown;
  purchasedWeeks: unknown;
}

/** Local calendar day the end-of-day panel was last shown for. This module owns the key outright. */
const DAY_COMPLETE_KEY = 'startup-tycoon/day-complete/last-shown';
/**
 * Same beat as `recapArmedWeek` below, for the same reason: the closing panel
 * is the last thing in the day, so it presents a frame *after* whatever it is
 * following (a recap being dismissed, a tick settling) rather than into it.
 * Present-while-dismiss hangs iOS — see docs/bug-stuck-decision-modal.md.
 */
const DAY_COMPLETE_ARM_MS = 350;

/**
 * Streak length at which coming back counts as a genuine "I like this" signal
 * worth spending a review ask on. Two is barely a habit; three is a player who
 * chose to return twice.
 */
const REVIEW_STREAK_DAYS = 3;

/**
 * Persistent chrome shared by every game tab (Task 12): the Next Week
 * control, the pending-decision modal, and the post-tick
 * recap (a full Week in Review sheet on notable weeks, a compact dismissible
 * ticker on quiet ones — Task 13). Rendered once in `(game)/_layout.tsx`
 * rather than per-screen so its two `Modal`s never stack duplicates across
 * tabs that stay mounted in the background.
 */
export function GameChrome() {
  const {
    state,
    previousState,
    dispatch,
    weekBudget,
    purchasedWeeks,
    creditPurchase,
    devFreePlay,
    setDevFreePlay,
    streak,
  } = useGame();
  const insets = useSafeAreaInsets();
  const [reviewedWeek, setReviewedWeek] = useState<number | null>(null);
  const [tickerDismissedWeek, setTickerDismissedWeek] = useState<number | null>(null);
  // Week whose recap has "settled" — armed a beat after its tick's decision
  // card (if any) is answered, so the recap never presents into the same frame
  // the DecisionModal is dismissing (present-while-dismiss hangs iOS — see
  // docs/bug-stuck-decision-modal.md).
  const [recapArmedWeek, setRecapArmedWeek] = useState<number | null>(null);
  // The one-time "this is the whole game" callout over Next Week. Retired by
  // the first tick, so pressing the button counts as reading it.
  const spotlight = useFirstRunHint('next-week-spotlight');
  // Which local calendar day the closing panel has already been shown for.
  // Persisted (see the load effect below) because the player who just hit the
  // wall is precisely the player about to kill the app — in-memory state alone
  // would re-show the panel on the next cold start, same day.
  const [dayCompleteShownFor, setDayCompleteShownFor] = useState<string | null>(null);
  const [dayCompleteLoaded, setDayCompleteLoaded] = useState(false);
  const [dayCompleteVisible, setDayCompleteVisible] = useState(false);
  // Whether the closing panel may offer "Remind me at 9am": only while the
  // install's one OS permission shot is unspent. Checked when the panel opens.
  const [reminderOfferable, setReminderOfferable] = useState(false);
  // Set when the player taps "Remind me at 9am", which closes the panel and
  // then mounts the permission ask below. Asking only after the tap (instead of
  // on any dismissal, as before) means the system dialog never appears
  // unannounced; asking after the close keeps it out of the frame the sheet is
  // dismissing in.
  const [reminderOptedIn, setReminderOptedIn] = useState(false);
  // Latched by the first press at the wall, for the budget state it was
  // pressed in. From then on the Next Week control becomes a refill countdown
  // rather than a button: on 1.0.4-19, wall players pressed it about 5.3 times
  // each even after the copy said "come back tomorrow". The first press is
  // still dispatched, since it's what records `week_advance_blocked`. Keyed
  // to the two budget objects rather than cleared by an effect, so a refill
  // or a purchase (each replaces one) hands the button straight back.
  const [wallTappedFor, setWallTappedFor] = useState<WallKey | null>(null);

  // Store-layer daily week budget (PRD F12) plus the IAP-purchased pool — a
  // no-op while either is still resolving (null), so play is never blocked
  // by a slow AsyncStorage read. Derived above the early return below because
  // the closing-panel effects key off it and hooks can't run conditionally.
  const budgetExhausted = isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay);
  const wallTapped =
    budgetExhausted &&
    wallTappedFor !== null &&
    wallTappedFor.weekBudget === weekBudget &&
    wallTappedFor.purchasedWeeks === purchasedWeeks;

  // The whole buy-weeks flow — presenting the paywall, falling back to the
  // sheet, crediting and reporting — lives in `useBuyWeeksFlow`. The chrome
  // only says when it was asked for and where the sheet goes.
  const buyWeeks = useBuyWeeksFlow(state !== null && !state.gameOver);

  useEffect(() => {
    AsyncStorage.getItem(DAY_COMPLETE_KEY)
      .then((value) => setDayCompleteShownFor(value))
      .catch(() => {})
      .finally(() => setDayCompleteLoaded(true));
  }, []);

  // Hoisted above the early return because the closing-panel gate below needs
  // them and hooks can't run conditionally.
  const weekEntries = state ? state.newsLog.filter((entry) => entry.week === state.week) : [];
  const notable = isNotableWeek(weekEntries);
  const agenda = useMemo(() => tomorrowAgendaFor(state), [state]);

  // Every condition that has to hold before the day can be closed out. The
  // ordering ones are what matter: each names another surface that owns the
  // screen first, because iOS hangs when one modal presents into a frame
  // another is presenting or dismissing (docs/bug-stuck-decision-modal.md).
  const dayCompleteDue =
    state !== null &&
    !state.gameOver && // no live run — the chrome renders nothing at all
    dayCompleteLoaded && // don't flash before we know whether today is spent
    budgetExhausted &&
    !state.pendingEvent && // DecisionModal owns the screen
    !buyWeeks.isOpen && // never stack on a buy-weeks surface
    // The tick that spent the last week still owes the player its recap:
    // `WeekInReviewSheet` arms 350ms *after* this panel would otherwise open,
    // and would present straight into it. The recap is the earlier beat, so
    // the panel waits for it to be dismissed rather than racing it.
    !(previousState !== null && notable && state.week !== reviewedWeek);
  const dayCompleteWeek = state?.week ?? null;

  useEffect(() => {
    if (!dayCompleteDue) return;
    // Armed rather than immediate, and the clock is read here rather than
    // during render — `week-budget.ts` keeps `Date` out of derivations on
    // purpose, and the day must be latched at the moment it's actually shown.
    const timer = setTimeout(() => {
      const today = dateKey(new Date());
      if (dayCompleteShownFor === today) return;
      setDayCompleteShownFor(today);
      AsyncStorage.setItem(DAY_COMPLETE_KEY, today).catch(() => {});
      setDayCompleteVisible(true);
      track(EVENTS.DAY_COMPLETE_SHOWN, { agenda_kind: agenda?.kind ?? null, week: dayCompleteWeek });
      notificationAskSpentOnDateKey()
        .then((spentOn) => setReminderOfferable(Platform.OS !== 'web' && spentOn === null))
        .catch(() => {});
    }, DAY_COMPLETE_ARM_MS);
    return () => clearTimeout(timer);
  }, [dayCompleteDue, dayCompleteShownFor, agenda, dayCompleteWeek]);

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

  const { burn, revenue, valuation, stake, insolvent } = deriveWeeklyStats(state);

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

  // Only pitch "advance a week" while advancing is actually possible. The Next
  // Week button deliberately stays pressable at the wall (see its handler), so
  // this gates the spotlight alone.
  const showSpotlight = spotlight.visible && !state.pendingEvent && !budgetExhausted;
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
        {showSpotlight ? (
          <SpotlightHint text="This is the whole game → advance a week" onDismiss={spotlight.dismiss} />
        ) : null}

        {/* The daily wall is the one moment the player has just felt why a nudge
            is worth allowing. Mounting is the ask, and it waits for both the
            player's "Remind me at 9am" tap and the panel's dismissal: 24% of
            players granted the old unannounced dialog here, and presenting it
            into the sheet's frame hangs iOS (docs/bug-stuck-decision-modal.md). */}
        {reminderOptedIn ? <NotificationPermissionAsk trigger="reminder_optin" /> : null}

        <View style={styles.footer}>
          {wallTapped ? (
            <View style={styles.wallFooter}>
              <RefillCountdown setWallTappedFor={setWallTappedFor} />
              {purchasesAvailable ? (
                <PrimaryButton
                  label="Get more weeks"
                  variant="secondary"
                  onPress={() => buyWeeks.open('out_of_weeks')}
                  style={styles.wallButton}
                />
              ) : null}
            </View>
          ) : (
          <PrimaryButton
            label={
              budgetExhausted
                ? purchasesAvailable
                  ? 'Get more weeks'
                  : 'See you tomorrow'
                : 'Next Week →'
            }
            onPress={() => {
              if (spotlight.visible) spotlight.dismiss();
              // Dispatched even when the daily budget is spent: the store's TICK
              // gate swallows it and captures WEEK_ADVANCE_BLOCKED, which is the
              // only signal that tells a hit-the-wall player apart from one who
              // drifted off before reaching it. Where purchases exist, the press
              // also opens the week-pack sheet.
              dispatch({ type: 'TICK' });
              if (budgetExhausted) setWallTappedFor({ weekBudget, purchasedWeeks });
              if (budgetExhausted && purchasesAvailable) buyWeeks.open('out_of_weeks');
            }}
            disabled={!!state.pendingEvent}
            style={styles.nextButton}
          />
          )}
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
              text: `${WEEKS_PER_DAY} free weeks refill at local midnight. Come back tomorrow — ${state.companyName} will be waiting.`,
              when: budgetExhausted && !spotlight.visible,
            },
          ]}
        />

        <View style={styles.budgetRow}>
          {!budgetExhausted && weekBudget ? (
            purchasesAvailable ? (
              <Pressable onPress={() => buyWeeks.open('hud')} accessibilityRole="button">
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

      <DayCompleteSheet
        visible={dayCompleteVisible}
        companyName={state.companyName}
        week={state.week}
        stake={stake}
        agenda={agenda}
        onBuyWeeks={
          purchasesAvailable
            ? () => {
                setDayCompleteVisible(false);
                track(EVENTS.DAY_COMPLETE_DISMISSED, { action: 'buy_weeks' });
                buyWeeks.open('out_of_weeks');
              }
            : undefined
        }
        onRemindMe={
          reminderOfferable
            ? () => {
                setDayCompleteVisible(false);
                track(EVENTS.REMINDER_OPTIN_TAPPED, { agenda_kind: agenda?.kind ?? null });
                track(EVENTS.DAY_COMPLETE_DISMISSED, { action: 'remind_me' });
                setReminderOptedIn(true);
                // The review ask reads the permission shot's day and stands
                // down when it was spent today, so this can't stack two dialogs.
                maybeAskForReviewAtWall(streak?.streakDays ?? 0, insolvent);
              }
            : undefined
        }
        onDismiss={() => {
          setDayCompleteVisible(false);
          track(EVENTS.DAY_COMPLETE_DISMISSED, { action: 'dismiss' });
          maybeAskForReviewAtWall(streak?.streakDays ?? 0, insolvent);
        }}
      />

      {purchasesAvailable ? (
        <BuyWeeksSheet
          visible={buyWeeks.sheetTrigger !== null}
          trigger={buyWeeks.sheetTrigger ?? 'hud'}
          onClose={buyWeeks.closeSheet}
          onPurchased={creditPurchase}
        />
      ) : null}
    </>
  );
}

/**
 * The review ask that rides the closing panel's dismissal — a player on a streak,
 * having just read what's waiting tomorrow.
 *
 * It shares that beat with `NotificationPermissionAsk` above, and only one of them
 * may take it: two OS dialogs presenting into the same frame is what hangs iOS
 * (docs/bug-stuck-decision-modal.md). The notification ask wins outright — it is
 * one-shot-per-install and it feeds the re-engagement loop — so this one runs only
 * once that shot was spent on an *earlier* day. On the very first wall day, when
 * the notification dialog is about to appear right here, the stored day is null and
 * `notificationAskSettled` correctly reads false.
 *
 * Async and fire-and-forget: the panel is already dismissing, and nothing about
 * closing it should wait on a storage read.
 */
function maybeAskForReviewAtWall(streakDays: number, insolvent: boolean): void {
  if (streakDays < REVIEW_STREAK_DAYS) return;
  // A streak kept up while the company is bleeding out isn't the good mood it
  // looks like from the streak counter alone.
  if (insolvent) {
    reportReviewSuppressed('day_streak', 'insolvent');
    return;
  }
  notificationAskSpentOnDateKey()
    .then((spentOn) => {
      if (!notificationAskSettled(spentOn, dateKey(new Date()))) {
        reportReviewSuppressed('day_streak', 'notification_ask_same_day');
        return;
      }
      requestReviewOnce('day_streak');
    })
    .catch(() => {});
}

/**
 * Time left until the free weeks refill, shown in place of the Next Week
 * button once the player has pressed into the wall. Deliberately not
 * pressable, so there's nothing left to retry.
 *
 * The clock is read in effects, never during render (the same rule
 * `week-budget.ts` follows). Clearing the latch at midnight hands the button
 * back, so the player can take the refilled weeks without relaunching.
 */
function RefillCountdown({ setWallTappedFor }: { setWallTappedFor: Dispatch<SetStateAction<WallKey | null>> }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const refillAt = nextWeekRefillAt(new Date()).getTime();
    const update = () => {
      const remaining = refillAt - Date.now();
      if (remaining <= 0) {
        setWallTappedFor(null);
        return;
      }
      setLabel(formatRefillCountdown(remaining));
    };
    const timer = setInterval(update, 15_000);
    // First read deferred a tick rather than run synchronously in the effect.
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [setWallTappedFor]);

  return (
    <View style={styles.countdown} accessibilityRole="text">
      <ThemedText type="smallBold">Free weeks refill in {label ?? '…'}</ThemedText>
    </View>
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
  wallFooter: {
    flex: 1,
    gap: Spacing.two,
  },
  wallButton: {
    paddingVertical: Spacing.two,
  },
  countdown: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
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
