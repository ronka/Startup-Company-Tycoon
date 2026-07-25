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
  // own morning, matching how `dateKey` in `week-budget.ts` decides when the
  // daily budget refreshes. The two must agree on what "a day" means.
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
