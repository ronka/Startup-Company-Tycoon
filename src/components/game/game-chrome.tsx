import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { purchasesAvailable } from '@/purchases';
import { EVENTS, track } from '@/analytics/events';
import { ActionTip } from '@/components/game/action-tip';
import { BuyWeeksSheet } from '@/components/game/buy-weeks-sheet';
import { CliffhangerBanner } from '@/components/game/cliffhanger-banner';
import { DayCompleteSheet } from '@/components/game/day-complete-sheet';
import { DecisionModal } from '@/components/game/decision-modal';
import { NotificationPermissionAsk } from '@/components/game/notification-permission-ask';
import { WeekInReviewSheet, type RivalShareMove } from '@/components/game/week-in-review-sheet';
import { WeekTicker } from '@/components/game/week-ticker';
import { Spacing } from '@/constants/theme';
import { isNotableWeek } from '@/game/digest';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { actionNowFor, cliffhangerTeaserFor, tomorrowAgendaFor, type ActionNow } from '@/state/day-close';
import type { useBuyWeeksFlow } from '@/state/buy-weeks-flow';
import { useGame } from '@/state/game-store';
import { useLeaderboard } from '@/state/leaderboard-provider';
import { notificationAskSpentOnDateKey } from '@/state/notification-permission';
import { notificationAskSettled } from '@/state/review-ask';
import { reportReviewSuppressed, requestReviewOnce } from '@/state/store-review';
import { dateKey, isWeekBudgetExhausted } from '@/state/week-budget';

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
 * The week-5 leaderboard ask arms slower than the closing panel, so when both
 * are due the panel wins the frame (its becoming visible cancels this timer)
 * and the ask waits for it to close.
 */
const LEADERBOARD_ASK_ARM_MS = 700;
/**
 * Backstop for "Pull an all-nighter": the paywall normally opens on the
 * sheet's `onDismissed`, and this only fires if that never arrives. Long
 * enough to clear the sheet's slide-out.
 */
const BUY_AFTER_SHEET_FALLBACK_MS = 700;

/**
 * Streak length at which coming back counts as a genuine "I like this" signal
 * worth spending a review ask on. Two is barely a habit; three is a player who
 * chose to return twice.
 */
const REVIEW_STREAK_DAYS = 3;

/**
 * Persistent chrome shared by every game tab (Task 12): the pending-decision
 * modal, the wall's 💡 tip, and the post-tick
 * recap (a full Week in Review sheet on notable weeks, a compact dismissible
 * ticker on quiet ones — Task 13). Rendered once in `(game)/_layout.tsx`
 * rather than per-screen so its two `Modal`s never stack duplicates across
 * tabs that stay mounted in the background.
 */
export function GameChrome({ buyWeeks }: { buyWeeks: ReturnType<typeof useBuyWeeksFlow> }) {
  const {
    state,
    previousState,
    dispatch,
    weekBudget,
    purchasedWeeks,
    creditPurchase,
    devFreePlay,
    streak,
  } = useGame();
  const leaderboard = useLeaderboard();
  const insets = useSafeAreaInsets();
  const [reviewedWeek, setReviewedWeek] = useState<number | null>(null);
  const [tickerDismissedWeek, setTickerDismissedWeek] = useState<number | null>(null);
  // Week whose recap has "settled" — armed a beat after its tick's decision
  // card (if any) is answered, so the recap never presents into the same frame
  // the DecisionModal is dismissing (present-while-dismiss hangs iOS — see
  // docs/bug-stuck-decision-modal.md).
  const [recapArmedWeek, setRecapArmedWeek] = useState<number | null>(null);
  // Which local calendar day the closing panel has already been shown for.
  // Persisted (see the load effect below) because the player who just hit the
  // wall is precisely the player about to kill the app — in-memory state alone
  // would re-show the panel on the next cold start, same day.
  const [dayCompleteShownFor, setDayCompleteShownFor] = useState<string | null>(null);
  const [dayCompleteLoaded, setDayCompleteLoaded] = useState(false);
  const [dayCompleteVisible, setDayCompleteVisible] = useState(false);
  // Whether the closing panel may offer "Notify me when weeks are back": only while the
  // install's one OS permission shot is unspent. Checked when the panel opens.
  const [reminderOfferable, setReminderOfferable] = useState(false);
  // Set when the player taps "Notify me when weeks are back", which closes the panel and
  // then mounts the permission ask below. Asking only after the tap (instead of
  // on any dismissal, as before) means the system dialog never appears
  // unannounced; asking after the close keeps it out of the frame the sheet is
  // dismissing in.
  const [reminderOptedIn, setReminderOptedIn] = useState(false);
  // Set by "Pull an all-nighter": the paywall waits for the closing panel to
  // finish sliding away. Presenting it in the same frame the panel starts
  // dismissing is the iOS present-while-dismiss case — UIKit drops the
  // paywall, nothing appears, and the tap looks dead.
  const [buyAfterSheet, setBuyAfterSheet] = useState(false);

  // Store-layer daily week budget (PRD F12) plus the IAP-purchased pool — a
  // no-op while either is still resolving (null), so play is never blocked
  // by a slow AsyncStorage read. Derived above the early return below because
  // the closing-panel effects key off it and hooks can't run conditionally.
  const budgetExhausted = isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay);

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
  const actionNow = useMemo(() => actionNowFor(state), [state]);
  // The card the wall pinned for next week — the cliffhanger (see `PIN_CLIFFHANGER`).
  const cliffhanger = useMemo(() => cliffhangerTeaserFor(state), [state]);

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
    !buyAfterSheet && // …or on one that is about to open
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
      track(EVENTS.DAY_COMPLETE_SHOWN, {
        agenda_kind: agenda?.kind ?? null,
        action_kind: actionNow?.kind ?? null,
        teaser_card_id: cliffhanger?.cardId ?? null,
        week: dayCompleteWeek,
      });
      notificationAskSpentOnDateKey()
        .then((spentOn) => setReminderOfferable(Platform.OS !== 'web' && spentOn === null))
        .catch(() => {});
    }, DAY_COMPLETE_ARM_MS);
    return () => clearTimeout(timer);
  }, [dayCompleteDue, dayCompleteShownFor, agenda, actionNow, cliffhanger, dayCompleteWeek]);

  const pendingWeek =
    state !== null && !state.gameOver && previousState !== null && !state.pendingEvent
      ? state.week
      : null;
  useEffect(() => {
    if (pendingWeek === null) return;
    const timer = setTimeout(() => setRecapArmedWeek(pendingWeek), 350);
    return () => clearTimeout(timer);
  }, [pendingWeek]);

  // The week-5 "join the leaderboard" ask. Same rule as every other surface
  // here: it waits for the decision card, the week's recap, the closing panel,
  // and any buy-weeks sheet to be off screen before it presents.
  const leaderboardAskDue =
    leaderboard.promptDue &&
    state !== null &&
    !state.pendingEvent &&
    leaderboard.joinSource === null &&
    !buyWeeks.isOpen &&
    !buyAfterSheet &&
    !dayCompleteVisible &&
    (previousState === null || recapArmedWeek === state.week) &&
    !(previousState !== null && notable && state.week !== reviewedWeek);
  const { open: openBuyWeeks } = buyWeeks;
  useEffect(() => {
    if (!buyAfterSheet) return;
    const timer = setTimeout(() => {
      setBuyAfterSheet(false);
      openBuyWeeks('out_of_weeks');
    }, BUY_AFTER_SHEET_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [buyAfterSheet, openBuyWeeks]);

  const { openJoin } = leaderboard;
  useEffect(() => {
    if (!leaderboardAskDue) return;
    const timer = setTimeout(() => openJoin('week5'), LEADERBOARD_ASK_ARM_MS);
    return () => clearTimeout(timer);
  }, [leaderboardAskDue, openJoin]);

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

      {/* The daily wall is the one moment the player has just felt why a nudge
          is worth allowing. Mounting is the ask, and it waits for both the
          player's "Notify me when weeks are back" tap and the panel's dismissal: 24% of
          players granted the old unannounced dialog here, and presenting it
          into the sheet's frame hangs iOS (docs/bug-stuck-decision-modal.md). */}
      {reminderOptedIn ? <NotificationPermissionAsk trigger="reminder_optin" /> : null}

      {/* At the wall: what next week brings (the cliffhanger), and the one
          thing still worth doing while the Hud's Next Week chip counts down to
          the next free week. */}
      {budgetExhausted && (cliffhanger || actionNow) ? (
        <View style={[styles.chrome, { paddingBottom: insets.bottom + Spacing.two }]}>
          {cliffhanger ? (
            <CliffhangerBanner
              companyName={state.companyName}
              teaser={cliffhanger}
              weekBudget={weekBudget}
              onFindOut={
                purchasesAvailable
                  ? () => {
                      track(EVENTS.CLIFFHANGER_FIND_OUT_TAPPED, { teaser_card_id: cliffhanger.cardId, week: state.week });
                      openBuyWeeks('cliffhanger');
                    }
                  : undefined
              }
            />
          ) : null}
          {actionNow ? <ActionTip action={actionNow} onPress={() => openActionTip(actionNow, 'wall')} /> : null}
        </View>
      ) : null}

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
        actionTip={actionNow}
        onActionTip={
          actionNow
            ? () => {
                setDayCompleteVisible(false);
                track(EVENTS.DAY_COMPLETE_DISMISSED, { action: 'action_tip' });
                openActionTip(actionNow, 'day_complete');
              }
            : undefined
        }
        onBuyWeeks={
          purchasesAvailable
            ? () => {
                setDayCompleteVisible(false);
                track(EVENTS.DAY_COMPLETE_DISMISSED, { action: 'buy_weeks' });
                setBuyAfterSheet(true);
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
        onDismissed={() => {
          if (!buyAfterSheet) return;
          setBuyAfterSheet(false);
          openBuyWeeks('out_of_weeks');
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

/** Jumps to where the 💡 tip's action is taken. A tab switch, not a modal, so it's safe mid-dismissal. */
function openActionTip(action: ActionNow, surface: 'wall' | 'day_complete'): void {
  track(EVENTS.ACTION_TIP_TAPPED, { kind: action.kind, surface });
  router.navigate(action.href);
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

const styles = StyleSheet.create({
  chrome: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
