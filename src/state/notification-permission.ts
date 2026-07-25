/**
 * Owns the one-shot notification permission ask (Task 16). Lives here rather
 * than in `notification-manager.tsx` because two unrelated components need it,
 * and that module installs the app-wide `setNotificationHandler` at import
 * time — importing it just to reach this function would drag that side effect
 * along with it. Non-React logic belongs in `src/state/`, so the components
 * can stay components.
 *
 * Unlike its `src/state/` neighbours `notification-content.ts` and
 * `notification-schedule.ts`, this module is deliberately *not* pure: talking
 * to the OS permission dialog, AsyncStorage, and analytics is the entire job.
 * It sits here for ownership, not for testability.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { EVENTS, track } from '@/analytics/events';

const PERMISSION_REQUESTED_KEY = 'startup-tycoon/notifications/permission-requested';

const IS_WEB = Platform.OS === 'web';

/**
 * Which moment spent the OS's single permission shot. A union rather than a
 * bare string because the whole point of the prop is comparing grant rates
 * between these two buckets — a typo would silently corrupt that comparison.
 */
export type PermissionTrigger = 'daily_wall' | 'second_launch';

/** Guards the OS's one-shot dialog against two callers in the same launch —
 * see `requestNotificationPermissionOnce`. */
let permissionAskStarted = false;

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
export async function requestNotificationPermissionOnce(trigger: PermissionTrigger): Promise<void> {
  if (IS_WEB) return;
  // Synchronous latch, checked before the first `await`: the AsyncStorage read
  // below is async, so on a second launch that opens straight into an exhausted
  // budget both callers (the wall and the fallback) would see "not requested"
  // and each log a row. iOS shows no second dialog, but the duplicate rows would
  // wreck the grant-rate-by-`trigger` comparison this prop exists for. Never
  // reset — the OS shot is spent for this launch either way.
  if (permissionAskStarted) return;
  permissionAskStarted = true;
  const alreadyRequested = (await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY)) === 'true';
  if (alreadyRequested) return;
  await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
  const result = await Notifications.requestPermissionsAsync().catch(() => null);
  track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { granted: result?.granted ?? null, trigger });
}
