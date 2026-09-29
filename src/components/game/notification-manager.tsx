import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import {
  notificationContentFor,
  progressReminderContentFor,
  weeksBackContentFor,
} from '@/state/notification-content';
import { requestNotificationPermissionOnce } from '@/state/notification-permission';
import {
  REENGAGEMENT_HOUR,
  REMINDER_SEQUENCE,
  secondsUntilReminder,
  secondsUntilWeeksBack,
} from '@/state/notification-schedule';
import { useGame } from '@/state/game-store';
import { isWeekBudgetExhausted, weekBankFullAt, type PurchasedWeeksPool, type WeekBudget } from '@/state/week-budget';

const HAS_LAUNCHED_BEFORE_KEY = 'startup-tycoon/notifications/has-launched-before';
/** Fixed, so each backgrounding replaces the one pending bank-full nudge rather than stacking. */
const WEEKS_BACK_ID = 'startup-tycoon-weeks-back';

const IS_WEB = Platform.OS === 'web';

if (!IS_WEB) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function scheduleReengagementNotification(state: Parameters<typeof notificationContentFor>[0]) {
  if (IS_WEB) return;
  // Fixed identifiers per slot mean each pass replaces the whole sequence —
  // never more than three pending, and never a stale one left behind.
  await Promise.all(
    REMINDER_SEQUENCE.map((r) => Notifications.cancelScheduledNotificationAsync(r.id).catch(() => {})),
  );
  const nextMorning = notificationContentFor(state);
  const later = progressReminderContentFor(state);
  if (!nextMorning || !later) return; // no active run to point back at — nothing to schedule
  // Absolute local-morning targets, not fixed offsets from now: this runs on
  // *every* backgrounding, and a relative delay meant a player who opened the
  // app twice in an evening pushed their nudge past the next-day slot it was
  // meant to land in. Re-deriving the same 09:00 instants keeps rescheduling
  // genuinely idempotent.
  const now = new Date();
  const scheduled = REMINDER_SEQUENCE.map((reminder) => ({
    reminder,
    content: reminder.day === 1 ? nextMorning : later,
    seconds: secondsUntilReminder(now, REENGAGEMENT_HOUR, reminder.day),
  }));
  await Promise.all(
    scheduled.map(({ reminder, content, seconds }) =>
      Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: content.title, body: content.body, data: { url: '/hq', reminder_day: reminder.day } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
        },
      }),
    ),
  );
  // Logged only where the notifications can actually be delivered. Scheduling
  // without permission is harmless, but counting it made this event fire for
  // the 69 players who had denied it, so it said nothing about delivery.
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return;
  track(EVENTS.REENGAGEMENT_NOTIFICATION_SCHEDULED, {
    delay_seconds: scheduled[0].seconds,
    target_hour: REENGAGEMENT_HOUR,
    agenda_kind: nextMorning.kind,
    reminders: scheduled.length,
  });
}

/**
 * The "your sprint's ready" nudge, for the moment the free-week bank is full
 * again. Only for a player at the wall — both pools empty — since that's the
 * player with nothing to do until then; one mid-sprint would be told about
 * weeks they never ran out of. Quiet hours and the 09:00 nudge can each veto
 * it (`secondsUntilWeeksBack`).
 */
async function scheduleWeeksBackNotification(
  state: Parameters<typeof weeksBackContentFor>[0],
  weekBudget: WeekBudget | null,
  purchasedWeeks: PurchasedWeeksPool | null,
  devFreePlay: boolean,
) {
  if (IS_WEB) return;
  await Notifications.cancelScheduledNotificationAsync(WEEKS_BACK_ID).catch(() => {});
  const content = weeksBackContentFor(state);
  const fullAt = weekBudget ? weekBankFullAt(weekBudget) : null;
  if (!content || !fullAt || !isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay)) return;
  const timing = secondsUntilWeeksBack(new Date(), fullAt);
  if ('seconds' in timing) {
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKS_BACK_ID,
      content: { title: content.title, body: content.body, data: { url: '/hq', reminder_kind: 'weeks_back' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: timing.seconds },
    });
  }
  // Same rule as the sequence above: only counted where it can be delivered.
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return;
  track(EVENTS.WEEKS_BACK_NOTIFICATION_SCHEDULED, {
    delay_seconds: 'seconds' in timing ? timing.seconds : null,
    skipped: 'skipped' in timing ? timing.skipped : null,
  });
}

/**
 * Invisible, app-wide manager for Task 16's local re-engagement push:
 * requests permission as a fallback (deferred to the session after the very
 * first launch, per PRD), reschedules the day 1 / 3 / 7 reminder sequence
 * and the bank-full nudge whenever the app backgrounds, and deep-links back
 * into the run on tap. A no-op everywhere
 * on web — `expo-notifications` has no web backend, and permission prompts
 * would be meaningless there anyway.
 */
export function NotificationManager() {
  const { state, weekBudget, purchasedWeeks, devFreePlay } = useGame();
  // The most recent inputs, so the AppState listener schedules from what is
  // true now rather than whatever was current when it was registered.
  const latest = useRef({ state, weekBudget, purchasedWeeks, devFreePlay });
  useEffect(() => {
    latest.current = { state, weekBudget, purchasedWeeks, devFreePlay };
  }, [state, weekBudget, purchasedWeeks, devFreePlay]);

  // Tapping a delivered notification (cold start or from background) deep-links in.
  useEffect(() => {
    if (IS_WEB) return;

    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      const reminderDay = notification.request.content.data?.reminder_day;
      const reminderKind = notification.request.content.data?.reminder_kind;
      if (typeof url === 'string') {
        track(EVENTS.NOTIFICATION_OPENED, {
          url,
          reminder_day: typeof reminderDay === 'number' ? reminderDay : null,
          reminder_kind: typeof reminderKind === 'string' ? reminderKind : 'agenda',
        });
        router.push(url as Parameters<typeof router.push>[0]);
      }
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) redirect(response.notification);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      redirect(response.notification),
    );
    return () => subscription.remove();
  }, []);

  // *Fallback* opt-in path, for players who never tapped "Notify me when weeks are back"
  // on the end-of-day panel — the primary ask (`NotificationPermissionAsk`,
  // mounted by `game-chrome.tsx`), where the player has just felt the reason
  // for it. Most players never reach this one: it needs a second launch, and the
  // first-ever launch only records that a session happened so the prompt can
  // never appear on first run.
  useEffect(() => {
    if (IS_WEB) return;
    let cancelled = false;

    (async () => {
      const hasLaunchedBefore = (await AsyncStorage.getItem(HAS_LAUNCHED_BEFORE_KEY)) === 'true';
      if (!hasLaunchedBefore) {
        await AsyncStorage.setItem(HAS_LAUNCHED_BEFORE_KEY, 'true');
        return;
      }
      if (cancelled) return;
      await requestNotificationPermissionOnce('second_launch');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Reschedule the reminder sequence and the bank-full nudge, with fresh
  // state-derived content, every time the app leaves the foreground.
  useEffect(() => {
    if (IS_WEB) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'background' && next !== 'inactive') return;
      const current = latest.current;
      scheduleReengagementNotification(current.state).catch(() => {});
      scheduleWeeksBackNotification(
        current.state,
        current.weekBudget,
        current.purchasedWeeks,
        current.devFreePlay,
      ).catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  return null;
}
