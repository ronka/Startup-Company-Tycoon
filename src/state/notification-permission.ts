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
import { dateKey } from '@/state/week-budget';

const PERMISSION_REQUESTED_KEY = 'startup-tycoon/notifications/permission-requested';
/**
 * The local calendar day (`dateKey`) the one shot was spent on. Written alongside
 * `PERMISSION_REQUESTED_KEY` purely so the store-review ask can tell "the dialog
 * already happened, on an earlier day" from "the dialog is about to happen in this
 * very beat" — the two share the closing panel's dismissal, and stacking two OS
 * dialogs there is what hangs iOS. See `notificationAskSettled` in `review-ask.ts`.
 */
const PERMISSION_REQUESTED_DAY_KEY = 'startup-tycoon/notifications/permission-requested-day';

/**
 * Stands in for the spent-on day of installs that requested permission before
 * `PERMISSION_REQUESTED_DAY_KEY` existed. Any real `dateKey` sorts after it, so
 * those installs read as "settled long ago" rather than being blocked forever by a
 * missing key they never had the chance to write.
 */
const LEGACY_SPENT_DAY = '1970-01-01';

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
  // Day first, *then* the requested flag, and neither swallows its error. The flag
  // is the source of truth for "the shot is spent"; if the day write fails and the
  // flag were already set, the store-review gate would read this install as
  // "spent long ago" and could stack its dialog onto this very beat. Writing in
  // this order means a failure leaves the ask un-spent and simply retried.
  await AsyncStorage.setItem(PERMISSION_REQUESTED_DAY_KEY, dateKey(new Date()));
  await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
  const result = await Notifications.requestPermissionsAsync().catch(() => null);
  track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { granted: result?.granted ?? null, trigger });
}

/**
 * The local calendar day the OS permission shot was spent on, or `null` if it never
 * has been. Read by the store-review gate, which must not stack its own system
 * dialog onto the beat this one owns — see `notificationAskSettled`.
 *
 * The reconciliation matters: an install that requested permission before the day
 * key shipped has `PERMISSION_REQUESTED_KEY` set and no day, which is "spent, long
 * ago" — not "never spent". Returning `null` there would block the review ask on
 * exactly the oldest, most-engaged installs.
 */
export async function notificationAskSpentOnDateKey(): Promise<string | null> {
  if (IS_WEB) return null;
  try {
    // `PERMISSION_REQUESTED_KEY` is checked first and is authoritative: a day key
    // without it means an interrupted write, not a spent shot, and must read as
    // "never" so the review gate stays closed. Only once the shot is confirmed
    // spent does the day refine *when* — falling back to the legacy sentinel for
    // installs that predate the day key.
    const requested = (await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY)) === 'true';
    if (!requested) return null;
    const day = await AsyncStorage.getItem(PERMISSION_REQUESTED_DAY_KEY);
    return day ?? LEGACY_SPENT_DAY;
  } catch {
    return null;
  }
}
