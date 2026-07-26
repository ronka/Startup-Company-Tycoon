/**
 * The pure half of the App Store review ask: how many asks are left, whether the
 * cooldown has elapsed, and whether the notification permission dialog has cleared
 * out of the way. Its impure twin is `store-review.ts`, which owns AsyncStorage,
 * `expo-store-review` and analytics — the same split `notification-content.ts` /
 * `notification-schedule.ts` (pure) and `notification-permission.ts` (impure) use.
 *
 * The whole reason this logic is worth isolating: iOS gives **no callback** for
 * `requestReview()`. We never learn whether the sheet appeared, whether it was
 * throttled, or what the player did. So the app-side budget has to be conservative
 * by construction and provable by test, because nothing at runtime will ever tell
 * us it was wrong.
 */

/**
 * Asks allowed per install, ever. Deliberately below the OS's own (undisclosed,
 * silently-enforced) yearly cap: if the OS throttle is what ends up deciding, we
 * have already spent asks on moments we didn't choose.
 */
export const MAX_REVIEW_ASKS = 2;

/** Days that must pass between the first ask and the second. */
export const REVIEW_COOLDOWN_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which moment spent an ask. A union rather than a bare string for the same reason
 * `PermissionTrigger` is one: the point of the prop is comparing these buckets, and
 * a typo would silently corrupt that comparison.
 */
export type ReviewTrigger = 'run_ended_best' | 'funding_round' | 'day_streak';

/** Why an eligible-looking trigger didn't get to ask. */
export type ReviewSuppressedReason =
  | 'cap_reached'
  | 'cooldown'
  | 'unavailable'
  | 'notification_ask_same_day'
  | 'purchase_failed'
  | 'insolvent'
  | 'modal_busy';

export interface ReviewAskRecord {
  /** How many times the native sheet has been requested, ever. */
  askCount: number;
  /** Epoch ms of the most recent request, or null when we've never asked. */
  lastAskedAtMs: number | null;
}

export function initialReviewAskRecord(): ReviewAskRecord {
  return { askCount: 0, lastAskedAtMs: null };
}

/**
 * Parses a persisted record, degrading to a fresh one on anything unexpected.
 * A corrupt blob means "ask once more" rather than "never ask again" — over-asking
 * by one is bounded by the OS anyway, while a hard failure would silently disable
 * the whole feature with no signal that it had.
 */
export function parseReviewAskRecord(raw: string | null): ReviewAskRecord {
  if (!raw) return initialReviewAskRecord();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return initialReviewAskRecord();
    const { askCount, lastAskedAtMs } = parsed as Partial<ReviewAskRecord>;
    return {
      askCount: typeof askCount === 'number' && Number.isFinite(askCount) && askCount >= 0 ? askCount : 0,
      lastAskedAtMs: typeof lastAskedAtMs === 'number' && Number.isFinite(lastAskedAtMs) ? lastAskedAtMs : null,
    };
  } catch {
    return initialReviewAskRecord();
  }
}

/**
 * Whether another ask is allowed: under the lifetime cap, and past the cooldown
 * since the last one. Returns the blocking reason instead of a bare boolean so the
 * caller can log *which* rule bit — with no OS callback, that log is the only way
 * to tell a working gate from a broken one.
 */
export function reviewAskBlockedBy(
  record: ReviewAskRecord,
  nowMs: number,
): 'cap_reached' | 'cooldown' | null {
  if (record.askCount >= MAX_REVIEW_ASKS) return 'cap_reached';
  if (record.lastAskedAtMs !== null && nowMs - record.lastAskedAtMs < REVIEW_COOLDOWN_DAYS * DAY_MS) {
    return 'cooldown';
  }
  return null;
}

export function canAskForReview(record: ReviewAskRecord, nowMs: number): boolean {
  return reviewAskBlockedBy(record, nowMs) === null;
}

/** The record as it should be after an ask at `nowMs`. */
export function recordReviewAsk(record: ReviewAskRecord, nowMs: number): ReviewAskRecord {
  return { askCount: record.askCount + 1, lastAskedAtMs: nowMs };
}

/**
 * True when the notification permission dialog is out of the way: its one shot was
 * spent on an *earlier* day than `todayKey`.
 *
 * This exists because the daily-wall trigger shares its slot with
 * `NotificationPermissionAsk` (see `game-chrome.tsx`), and two OS dialogs in one
 * beat is the failure mode: iOS hangs when one modal presents into a frame another
 * is presenting (docs/bug-stuck-decision-modal.md), and the notification ask is
 * one-shot-per-install feeding the retention loop, so it wins the collision.
 *
 * `null` — never spent — is **not** settled, and that direction matters. The
 * notification ask mounts on the very wall dismissal the review ask would use, so
 * "never asked" means "about to ask, right here". Installs that spent the shot
 * before this date key existed are reconciled by
 * `notificationAskSpentOnDateKey()`, which hands back a long-ago key rather than
 * `null` so they aren't blocked forever.
 *
 * A *date* comparison rather than an in-launch latch, because the latch cannot
 * survive a cold start and, in this app, is set on every wall dismissal whether or
 * not a dialog actually appeared.
 */
export function notificationAskSettled(spentOnDateKey: string | null, todayKey: string): boolean {
  if (spentOnDateKey === null) return false;
  return spentOnDateKey < todayKey;
}
