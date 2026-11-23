import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getWeeksPriceTeaser, purchasesAvailable, type PriceTeaser } from '@/purchases';
import { EVENTS, track } from '@/analytics/events';
import { ActionTip } from '@/components/game/action-tip';
import { BuyWeeksSheet } from '@/components/game/buy-weeks-sheet';
import { CliffhangerBanner } from '@/components/game/cliffhanger-banner';
import { DayCompleteSheet } from '@/components/game/day-complete-sheet';
import { DecisionModal } from '@/components/game/decision-modal';
import { FirstSessionAskSheet } from '@/components/game/first-session-ask-sheet';
import { NotificationPermissionAsk } from '@/components/game/notification-permission-ask';
import { WeekInReviewSheet, type RivalShareMove } from '@/components/game/week-in-review-sheet';
import { WeekTicker } from '@/components/game/week-ticker';
import { Spacing } from '@/constants/theme';
import { isNotableWeek } from '@/game/digest';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { actionNowFor, cliffhangerTeaserFor, tomorrowAgendaFor, type ActionNow } from '@/state/day-close';
import type { BuyWeeksSource, BuyWeeksTrigger, useBuyWeeksFlow } from '@/state/buy-weeks-flow';
import { firstSessionAskDue } from '@/state/first-session-ask';
import { DAY_COMPLETE_STORAGE_KEY, useGame } from '@/state/game-store';
import { useLeaderboard } from '@/state/leaderboard-provider';
import {
  firstSessionSoftAskShown,
  markFirstSessionSoftAskShown,
  notificationAskSpentOnDateKey,
} from '@/state/notification-permission';
import { missionsReviewOnRecapDismiss, notificationAskSettled } from '@/state/review-ask';
import { reportReviewSuppressed, requestReviewOnce } from '@/state/store-review';
import { dateKey, FIRST_ALL_NIGHTER_WEEKS, isWeekBudgetExhausted } from '@/state/week-budget';

/**
 * Local calendar day the end-of-day panel was last shown for. This module is
 * the only writer; the store reads it once, as "has this install ever hit a
 * wall" (the free first all-nighter).
 */
const DAY_COMPLETE_KEY = DAY_COMPLETE_STORAGE_KEY;
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
 * A Next Week tap at the wall brings the closing panel back. Nothing is
 * dismissing at that moment, so the beat is short — just off the tap's own
 * commit (the blocked TICK).
 */
const CHIP_REOPEN_ARM_MS = 150;
/**
 * The first-session soft ask arms slower than the closing panel (350) and the
 * leaderboard ask (700), so either of those wins a tie and this one waits for
 * it to clear rather than racing it.
 */
const FIRST_SESSION_ASK_ARM_MS = 900;
/** Same role as `BUY_AFTER_SHEET_FALLBACK_MS`, for the OS dialog after the soft ask (Android has no `onDismissed`). */
const PERMISSION_AFTER_SHEET_FALLBACK_MS = 700;
/**
 * The `missions_complete` review ask fires this long after the Week in Review
 * is dismissed — clear of the sheet's slide-out, and of the 350ms beat other
 * surfaces arm on. Every guard is re-checked when it fires.
 */
const MISSIONS_REVIEW_ARM_MS = 1200;

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
export function GameChrome({
  buyWeeks,
  wallTapRequest = 0,
}: {
  buyWeeks: ReturnType<typeof useBuyWeeksFlow>;
  /** Bumped by every Next Week tap at the wall (see `(tabs)/_layout.tsx`): bring the closing panel back. */
  wallTapRequest?: number;
}) {
  const {
    state,
    previousState,
    dispatch,
    weekBudget,
    purchasedWeeks,
    creditPurchase,
    devFreePlay,
    streak,
    firstAllNighterOffered,
    claimFirstAllNighter,
    missionsReviewArmed,
    settleMissionsReview,
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
  // Set by "Pull an all-nighter" / "Find out now": the paywall waits for the
  // closing panel to finish sliding away. Presenting it in the same frame the
  // panel starts dismissing is the iOS present-while-dismiss case — UIKit
  // drops the paywall, nothing appears, and the tap looks dead. Carries the
  // trigger and source the paywall will report.
  const [buyAfterSheet, setBuyAfterSheet] = useState<{ trigger: BuyWeeksTrigger; source: BuyWeeksSource } | null>(
    null,
  );
  // How the closing panel currently on screen was opened: on its own at the
  // wall, or brought back by a Next Week tap. Becomes the paywall's `source`.
  const [dayCompleteSource, setDayCompleteSource] = useState<'auto' | 'chip'>('auto');
  // The live price the cliffhanger buttons quote; null until (and unless) it loads.
  const [priceTeaser, setPriceTeaser] = useState<PriceTeaser | null>(null);
  // First-session soft ask. The two reads are null until they land.
  const [permissionUnspent, setPermissionUnspent] = useState<boolean | null>(null);
  const [softAskShown, setSoftAskShown] = useState<boolean | null>(null);
  const [softAskVisible, setSoftAskVisible] = useState(false);
  // "Yes" was tapped: the OS dialog waits for the sheet to finish closing.
  const [softAskAccepted, setSoftAskAccepted] = useState(false);
  // The sheet is gone; mounting `NotificationPermissionAsk` is the OS ask.
  const [firstSessionPermissionAsk, setFirstSessionPermissionAsk] = useState(false);
  // The `missions_complete` review ask is on its timer. The state mirrors the
  // ref so the soft ask can wait on it during render.
  const missionsReviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [missionsReviewPending, setMissionsReviewPending] = useState(false);

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
    if (Platform.OS === 'web') return;
    notificationAskSpentOnDateKey()
      .then((spentOn) => setPermissionUnspent(spentOn === null))
      .catch(() => setPermissionUnspent(false));
    firstSessionSoftAskShown()
      .then(setSoftAskShown)
      .catch(() => setSoftAskShown(true));
  }, []);

  useEffect(
    () => () => {
      if (missionsReviewTimerRef.current) clearTimeout(missionsReviewTimerRef.current);
    },
    [],
  );

  // Hoisted above the early return because the closing-panel gate below needs
  // them and hooks can't run conditionally.
  const weekEntries = state ? state.newsLog.filter((entry) => entry.week === state.week) : [];
  const notable = isNotableWeek(weekEntries);
  // A round signed after this week's tick adds a news entry that would make the
  // week "notable" and pop the full recap over the round-closed confetti. The
  // celebration already covers it, so no recap is owed.
  const roundJustClosed =
    state !== null && previousState !== null && state.roundsRaised !== previousState.roundsRaised;
  // The full Week in Review is still owed for this week: every later surface waits on it.
  const recapOwed =
    state !== null && previousState !== null && notable && state.week !== reviewedWeek && !roundJustClosed;
  const agenda = useMemo(() => tomorrowAgendaFor(state), [state]);
  const actionNow = useMemo(() => actionNowFor(state), [state]);
  // The card the wall pinned for next week — the cliffhanger (see `PIN_CLIFFHANGER`).
  const cliffhanger = useMemo(() => cliffhangerTeaserFor(state), [state]);

  // The cliffhanger buttons quote a live store price from the offering they
  // open. Fetched once, the first time the wall has a cliffhanger to sell;
  // null (any failure) keeps the plain "Find out now".
  const wantsPriceTeaser = purchasesAvailable && budgetExhausted && cliffhanger !== null && priceTeaser === null;
  useEffect(() => {
    if (!wantsPriceTeaser) return;
    let cancelled = false;
    getWeeksPriceTeaser('cliffhanger')
      .then((teaser) => {
        if (!cancelled && teaser) setPriceTeaser(teaser);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wantsPriceTeaser]);

  // The soft ask owns the screen from the moment it opens until the OS dialog
  // it leads to has been requested.
  const softAskBusy = softAskVisible || softAskAccepted;

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
    !softAskBusy && // the first-session soft ask, or the OS dialog after it
    // The tick that spent the last week still owes the player its recap:
    // `WeekInReviewSheet` arms 350ms *after* this panel would otherwise open,
    // and would present straight into it. The recap is the earlier beat, so
    // the panel waits for it to be dismissed rather than racing it.
    !recapOwed;
  const dayCompleteWeek = state?.week ?? null;

  // Opens the closing panel and latches today, from either door: the
  // once-a-day auto open below, or a Next Week tap at the wall. The clock is
  // read here rather than during render — `week-budget.ts` keeps `Date` out of
  // derivations on purpose, and the day must be latched when it's shown.
  const showDayComplete = useEffectEvent((source: 'auto' | 'chip') => {
    const today = dateKey(new Date());
    setDayCompleteShownFor(today);
    AsyncStorage.setItem(DAY_COMPLETE_KEY, today).catch(() => {});
    setDayCompleteSource(source);
    setDayCompleteVisible(true);
    track(EVENTS.DAY_COMPLETE_SHOWN, {
      agenda_kind: agenda?.kind ?? null,
      action_kind: actionNow?.kind ?? null,
      teaser_card_id: cliffhanger?.cardId ?? null,
      week: dayCompleteWeek,
      source,
      all_nighter_offer: firstAllNighterOffered,
      // The all-nighter gift replaces the priced button, so no price is shown then.
      price_shown: agenda?.kind === 'cliffhanger' && priceTeaser !== null && !firstAllNighterOffered,
    });
    notificationAskSpentOnDateKey()
      .then((spentOn) => setReminderOfferable(Platform.OS !== 'web' && spentOn === null))
      .catch(() => {});
  });

  useEffect(() => {
    if (!dayCompleteDue) return;
    // Armed rather than immediate: see `DAY_COMPLETE_ARM_MS`.
    const timer = setTimeout(() => {
      if (dayCompleteShownFor === dateKey(new Date())) return;
      showDayComplete('auto');
    }, DAY_COMPLETE_ARM_MS);
    return () => clearTimeout(timer);
  }, [dayCompleteDue, dayCompleteShownFor]);

  // A Next Week tap at the wall brings the panel back, under the same ordering
  // rules as the auto open — minus the once-a-day latch, since the player
  // asked for it. A tap while another surface owns the screen is dropped (the
  // chip is covered by most of them anyway).
  const wallReopenAllowed = dayCompleteDue && !dayCompleteVisible;
  const handledWallTapRef = useRef(wallTapRequest);
  useEffect(() => {
    if (wallTapRequest === handledWallTapRef.current) return;
    handledWallTapRef.current = wallTapRequest;
    if (!wallReopenAllowed) return;
    const timer = setTimeout(() => showDayComplete('chip'), CHIP_REOPEN_ARM_MS);
    return () => clearTimeout(timer);
  }, [wallTapRequest, wallReopenAllowed]);

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
    !softAskBusy &&
    (previousState === null || recapArmedWeek === state.week) &&
    !recapOwed;
  const { open: openBuyWeeks } = buyWeeks;
  useEffect(() => {
    if (!buyAfterSheet) return;
    const timer = setTimeout(() => {
      setBuyAfterSheet(null);
      openBuyWeeks(buyAfterSheet.trigger, { source: buyAfterSheet.source });
    }, BUY_AFTER_SHEET_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [buyAfterSheet, openBuyWeeks]);

  // The first-session soft ask: once the player is a few weeks in and this
  // week's recap has settled, with nothing else on screen or queued. It
  // yields to the leaderboard ask (`promptDue`), which in turn waits on it.
  const atWall = budgetExhausted;
  const roundCelebrating = roundJustClosed;
  const softAskInputs = {
    week: state?.week ?? 0,
    permissionUnspent,
    softAskShown,
    isWeb: Platform.OS === 'web',
    atWall,
    otherSurfaceBusy:
      state === null ||
      state.gameOver !== null ||
      state.pendingEvent !== null ||
      buyWeeks.isOpen ||
      buyAfterSheet !== null ||
      dayCompleteVisible ||
      leaderboard.promptDue ||
      leaderboard.joinSource !== null ||
      roundCelebrating ||
      missionsReviewPending,
  };
  const softAskDue =
    !softAskBusy &&
    firstSessionAskDue({
      ...softAskInputs,
      recapSettled: previousState !== null && state !== null && recapArmedWeek === state.week && !recapOwed,
    });
  const softAskWeek = state?.week ?? null;
  useEffect(() => {
    if (!softAskDue) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // Re-read the shot right before presenting: the wall's "Notify me" may
      // have spent it since the mount-time read.
      notificationAskSpentOnDateKey()
        .then((spentOn) => {
          if (cancelled) return;
          if (spentOn !== null) {
            setPermissionUnspent(false);
            return;
          }
          setSoftAskShown(true);
          markFirstSessionSoftAskShown().catch(() => {});
          setSoftAskVisible(true);
          track(EVENTS.FIRST_SESSION_ASK_SHOWN, { week: softAskWeek });
        })
        .catch(() => {});
    }, FIRST_SESSION_ASK_ARM_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [softAskDue, softAskWeek]);

  // What the missions review timer re-checks when it fires.
  const missionsReviewBusy =
    state === null ||
    state.gameOver !== null ||
    state.pendingEvent !== null ||
    budgetExhausted ||
    buyWeeks.isOpen ||
    buyAfterSheet !== null ||
    dayCompleteVisible ||
    softAskBusy ||
    leaderboard.joinSource !== null;
  const missionsReviewBusyRef = useRef(missionsReviewBusy);
  useEffect(() => {
    missionsReviewBusyRef.current = missionsReviewBusy;
  });

  // Backstop for "Yes": the OS dialog normally mounts on the sheet's
  // `onDismissed` (iOS only); this covers platforms where that never fires.
  useEffect(() => {
    if (!softAskAccepted || firstSessionPermissionAsk) return;
    const timer = setTimeout(() => {
      setFirstSessionPermissionAsk(true);
      setSoftAskAccepted(false);
    }, PERMISSION_AFTER_SHEET_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [softAskAccepted, firstSessionPermissionAsk]);

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
  const showReview = hasUnseenTick && recapOwed;
  const showTicker = hasUnseenTick && !notable && state.week !== tickerDismissedWeek;

  /**
   * The `missions_complete` review ask rides the first Week in Review dismissal
   * after the guided run's last mission. Never in the dismissal's own frame:
   * it waits `MISSIONS_REVIEW_ARM_MS`, then re-checks that nothing took the
   * screen meanwhile. When another surface owns this beat — the wall's closing
   * panel, the soft ask, a buy surface — it stays armed for the next recap.
   */
  function maybeAskForReviewAfterMissions(): void {
    if (!state || missionsReviewPending) return;
    const action = missionsReviewOnRecapDismiss({
      armed: missionsReviewArmed,
      insolvent,
      otherSurfaceDue:
        budgetExhausted ||
        state.pendingEvent !== null ||
        buyWeeks.isOpen ||
        buyAfterSheet !== null ||
        dayCompleteVisible ||
        softAskBusy ||
        leaderboard.promptDue ||
        leaderboard.joinSource !== null ||
        // The soft ask is about to take this very dismissal.
        firstSessionAskDue({ ...softAskInputs, recapSettled: true }),
    });
    if (action === 'suppress') {
      settleMissionsReview();
      reportReviewSuppressed('missions_complete', 'insolvent');
      return;
    }
    if (action !== 'ask') return;
    setMissionsReviewPending(true);
    missionsReviewTimerRef.current = setTimeout(() => {
      missionsReviewTimerRef.current = null;
      setMissionsReviewPending(false);
      // Something presented meanwhile: stay armed for the next recap.
      if (missionsReviewBusyRef.current) return;
      settleMissionsReview();
      requestReviewOnce('missions_complete');
    }, MISSIONS_REVIEW_ARM_MS);
  }

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
      {/* A yes on the first-session soft ask, mounted only once that sheet has
          slid away — same reason as above. */}
      {firstSessionPermissionAsk ? <NotificationPermissionAsk trigger="first_session" /> : null}

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
              priceTeaser={priceTeaser}
              onFindOut={
                purchasesAvailable
                  ? () => {
                      track(EVENTS.CLIFFHANGER_FIND_OUT_TAPPED, {
                        teaser_card_id: cliffhanger.cardId,
                        week: state.week,
                        price_shown: priceTeaser !== null,
                      });
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
        onDismiss={() => {
          setReviewedWeek(state.week);
          maybeAskForReviewAfterMissions();
        }}
      />

      <FirstSessionAskSheet
        visible={softAskVisible}
        companyName={state.companyName}
        onAccept={() => {
          track(EVENTS.FIRST_SESSION_ASK_ANSWERED, { accepted: true, week: state.week });
          setSoftAskAccepted(true);
          setSoftAskVisible(false);
        }}
        onDecline={() => {
          track(EVENTS.FIRST_SESSION_ASK_ANSWERED, { accepted: false, week: state.week });
          setSoftAskVisible(false);
        }}
        onDismissed={() => {
          if (!softAskAccepted) return;
          setFirstSessionPermissionAsk(true);
          setSoftAskAccepted(false);
        }}
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
                // "Find out now" opens the cliffhanger offering, so the price
                // it quoted is the price the paywall shows; "Pull an
                // all-nighter" keeps `out_of_weeks`.
                setBuyAfterSheet({
                  trigger: agenda?.kind === 'cliffhanger' ? 'cliffhanger' : 'out_of_weeks',
                  source: dayCompleteSource === 'chip' ? 'chip' : 'day_complete',
                });
              }
            : undefined
        }
        priceTeaser={priceTeaser}
        allNighterOffer={
          firstAllNighterOffered
            ? {
                weeks: FIRST_ALL_NIGHTER_WEEKS,
                onClaim: () => {
                  setDayCompleteVisible(false);
                  track(EVENTS.DAY_COMPLETE_DISMISSED, { action: 'first_all_nighter' });
                  claimFirstAllNighter();
                },
              }
            : null
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
          setBuyAfterSheet(null);
          openBuyWeeks(buyAfterSheet.trigger, { source: buyAfterSheet.source });
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
