import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { notificationContentFor } from '@/state/notification-content';
import { useGame } from '@/state/game-store';

/** A fixed identifier means scheduling a new one always cancels the last — never more than one pending. */
const NOTIFICATION_ID = 'startup-tycoon-daily-nudge';
/** How far out the re-engagement nudge fires once scheduled. */
const REENGAGEMENT_DELAY_SECONDS = 20 * 60 * 60;
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
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title: content.title, body: content.body, data: { url: '/hq' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: REENGAGEMENT_DELAY_SECONDS,
    },
  });
  track(EVENTS.REENGAGEMENT_NOTIFICATION_SCHEDULED, { delay_seconds: REENGAGEMENT_DELAY_SECONDS });
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

  // First-ever launch only records that a session happened; the opt-in
  // prompt itself waits for the *next* one, so it never appears on first launch.
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
      const alreadyRequested = (await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY)) === 'true';
      if (alreadyRequested) return;
      await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
      const result = await Notifications.requestPermissionsAsync().catch(() => null);
      track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { granted: result?.granted ?? null });
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
