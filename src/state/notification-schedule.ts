/**
 * Decides *when* the re-engagement nudge should fire (its message is chosen
 * separately by `notification-content.ts`). Pure and clock-free — every
 * function takes `now` as an explicit argument rather than reading the clock
 * itself — so it's testable with a fixed `Date` instead of mocking global
 * time, the same convention `week-budget.ts` follows.
 */

/** Local hour (24h) the daily nudge should land on. */
export const REENGAGEMENT_HOUR = 9;

/**
 * Seconds from `now` until the next local `hour` o'clock. Always strictly
 * positive: if `now` is already past `hour` today, it targets tomorrow. Because
 * the result is derived from an absolute wall-clock target rather than a fixed
 * offset, re-computing it repeatedly through an evening always names the same
 * instant — rescheduling is idempotent.
 */
export function secondsUntilNextLocalHour(now: Date, hour: number): number {
  // Local-time constructor on purpose: the nudge should land on the player's
  // own morning, on the same local calendar `dateKey` in `week-budget.ts` uses.
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  // `<=`, not `<`: landing exactly on the hour must roll to tomorrow, never
  // return 0 — a zero-second trigger would fire immediately.
  if (target.getTime() <= now.getTime()) {
    // Incrementing the date component (rather than adding 86400s) lets the
    // Date constructor handle month/year rollover and DST shifts for us.
    target.setDate(target.getDate() + 1);
  }
  return Math.round((target.getTime() - now.getTime()) / 1000);
}

/**
 * The re-engagement sequence: the next local 09:00 (day 1), then two days and
 * six days after it (day 3 and day 7). One notification left a player who
 * skipped day 2 uncontacted for good.
 *
 * Each has a fixed identifier, so rescheduling on every backgrounding replaces
 * the whole set rather than stacking duplicates. `day1` keeps the original
 * single nudge's identifier, so installs updating from it replace that pending
 * nudge instead of receiving it alongside the new one.
 */
export const REMINDER_SEQUENCE = [
  { id: 'startup-tycoon-daily-nudge', day: 1 },
  { id: 'startup-tycoon-reminder-day3', day: 3 },
  { id: 'startup-tycoon-reminder-day7', day: 7 },
] as const;

export type ReminderDay = (typeof REMINDER_SEQUENCE)[number]['day'];

/**
 * Seconds from `now` until local `hour` o'clock on sequence day `day`, where
 * day 1 is whatever `secondsUntilNextLocalHour` targets. Stepped by calendar
 * date rather than by 86 400 s, for the same DST reason as that function.
 */
export function secondsUntilReminder(now: Date, hour: number, day: number): number {
  const first = new Date(now.getTime() + secondsUntilNextLocalHour(now, hour) * 1000);
  const target = new Date(first.getFullYear(), first.getMonth(), first.getDate() + (day - 1), hour, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 1000);
}

/** Local hours (24h) the "weeks are back" nudge stays quiet in: from 22:00 until 08:00. */
export const QUIET_HOURS = { start: 22, end: 8 } as const;

/**
 * Closer than this to the 09:00 nudge and the "weeks are back" one is dropped:
 * two notifications inside an hour of each other read as spam.
 */
export const WEEKS_BACK_MIN_GAP_SECONDS = 60 * 60;

/** Why `secondsUntilWeeksBack` declined to schedule — the event's `skipped` prop. */
export type WeeksBackSkip = 'passed' | 'quiet_hours' | 'near_morning_nudge';

/**
 * Seconds from `now` until the free-week bank is full again (`fullAt`), or
 * why that instant isn't worth a notification. A bank that fills overnight, or
 * right beside the 09:00 nudge, is left to that nudge — it lands after the
 * weeks are back anyway.
 */
export function secondsUntilWeeksBack(
  now: Date,
  fullAt: Date,
): { seconds: number } | { skipped: WeeksBackSkip } {
  const seconds = Math.round((fullAt.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return { skipped: 'passed' };
  const hour = fullAt.getHours();
  if (hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end) return { skipped: 'quiet_hours' };
  if (Math.abs(seconds - secondsUntilNextLocalHour(now, REENGAGEMENT_HOUR)) < WEEKS_BACK_MIN_GAP_SECONDS) {
    return { skipped: 'near_morning_nudge' };
  }
  return { seconds };
}
