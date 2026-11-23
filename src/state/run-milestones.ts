/**
 * Funnel checkpoints for `run_milestone`: which weeks of a run count as a
 * milestone, and the install's furthest week for the `max_week_reached` person
 * property. Pure, so the store's diff effect stays a thin caller.
 */

/** Weeks worth a `run_milestone` event. Week 1 is the first Next Week tap; 10 is roughly the first wall. */
export const RUN_MILESTONE_WEEKS = [1, 3, 5, 10, 20] as const;

/**
 * Milestones a run passed going from `prevWeek` to `week`, in order. A jump of
 * several weeks reports every milestone it skipped over; going backwards (a new
 * run) reports nothing.
 */
export function milestonesCrossed(prevWeek: number, week: number): number[] {
  if (week <= prevWeek) return [];
  return RUN_MILESTONE_WEEKS.filter((m) => m > prevWeek && m <= week);
}

/**
 * The furthest week this install has reached across every run. Used for a
 * `$set`, which overwrites — so a second run reaching week 3 must not regress
 * an earlier run's week 20.
 */
export function maxWeekReached(pastRunWeeks: readonly number[], currentWeek: number): number {
  return pastRunWeeks.reduce((max, weeks) => Math.max(max, weeks), currentWeek);
}
