import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { notificationContentFor } from '@/state/notification-content';
import { REENGAGEMENT_HOUR, secondsUntilNextLocalHour } from '@/state/notification-schedule';
import { useGame } from '@/state/game-store';

/** A fixed identifier means scheduling a new one always cancels the last — never more than one pending. */
const NOTIFICATION_ID = 'startup-tycoon-daily-nudge';
const HAS_LAUNCHED_BEFORE_KEY = 'startup-tycoon/notifications/has-launched-before';
const PERMISSION_REQUESTED_KEY = 'startup-tycoon/notifications/permission-requested';

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
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  const content = notificationContentFor(state);
  if (!content) return; // no active run to point back at — nothing to schedule
  // An absolute local-morning target, not a fixed offset from now: this runs on
  // *every* backgrounding, and a relative delay meant a player who opened the
  // app twice in an evening pushed their nudge past the next-day slot it was
  // meant to land in. Re-deriving the same 09:00 instant makes rescheduling
  // genuinely idempotent.
  const seconds = secondsUntilNextLocalHour(new Date(), REENGAGEMENT_HOUR);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title: content.title, body: content.body, data: { url: '/hq' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });
  track(EVENTS.REENGAGEMENT_NOTIFICATION_SCHEDULED, {
    delay_seconds: seconds,
    target_hour: REENGAGEMENT_HOUR,
  });
}

/**
 * Request notification permission once, ever. Safe to call from anywhere and
 * any number of times: the `PERMISSION_REQUESTED_KEY` flag makes every call
 * after the first a no-op, so callers never need to track whether the OS
 * prompt has already been spent. iOS only ever shows the system dialog once
 * per install — that single shot is why this is centralized here.
 *
 * `trigger` records *which* moment spent the shot, so the grant rate of the
 * daily-wall ask can be compared against the second-launch fallback's.
 */
export async function requestNotificationPermissionOnce(trigger: string): Promise<void> {
  if (IS_WEB) return;
  const alreadyRequested = (await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY)) === 'true';
  if (alreadyRequested) return;
  await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
  const result = await Notifications.requestPermissionsAsync().catch(() => null);
  track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { granted: result?.granted ?? null, trigger });
}

/**
 * Invisible, app-wide manager for Task 16's local re-engagement push:
 * requests permission (deferred to the session after the very first
 * launch, per PRD), reschedules a single state-aware nudge whenever the app
 * backgrounds, and deep-links back into the run on tap. A no-op everywhere
 * on web — `expo-notifications` has no web backend, and permission prompts
 * would be meaningless there anyway.
 */
export function NotificationManager() {
  const { state } = useGame();
  const stateRef = useRef(state);
  stateRef.current = state;

  // Tapping a delivered notification (cold start or from background) deep-links in.
  useEffect(() => {
    if (IS_WEB) return;

    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string') {
        track(EVENTS.NOTIFICATION_OPENED, { url });
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

  // *Fallback* opt-in path, for players who somehow never hit the daily wall —
  // the primary ask now fires at the wall itself (see `game-chrome.tsx`), where
  // the player has just felt the reason for it. Most players never reach this
  // one: it needs a second launch, and the first-ever launch only records that a
  // session happened so the prompt can never appear on first run.
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

  // Reschedule the single daily nudge, with fresh state-derived content,
  // every time the app leaves the foreground.
  useEffect(() => {
    if (IS_WEB) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'background' && next !== 'inactive') return;
      scheduleReengagementNotification(stateRef.current).catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  return null;
}
