/**
 * The chapter clock. The free-week bank holds 10 weeks (`WEEKS_BANK_CAP`), so
 * a fresh run's walls land on weeks 10, 20, 30, … — those are the chapter
 * endings. Pure arithmetic on the week number; no clock, no state.
 *
 * Arc 0 is weeks 1–10, arc 1 is weeks 11–20, and so on. Week 0 (a brand-new
 * run before its first tick) belongs to arc 0.
 */

/** Weeks per chapter. Matches the free-week bank on purpose: one full bank = one chapter. */
export const ARC_LENGTH_WEEKS = 10;
/** The mid-chapter beat lands this many weeks into an arc (week 15, 25, …). */
export const ARC_MID_OFFSET_WEEKS = 5;

export type ArcIndex = number;

/** Which chapter a week belongs to: 0 for weeks 0–10, 1 for 11–20, … */
export function arcIndexForWeek(week: number): ArcIndex {
  return Math.max(0, Math.floor((Math.max(week, 1) - 1) / ARC_LENGTH_WEEKS));
}

/** First week of an arc: 1, 11, 21, … */
export function arcStartWeek(arcIndex: ArcIndex): number {
  return arcIndex * ARC_LENGTH_WEEKS + 1;
}

/** The chapter's last week, where its capstone cliffhanger is pinned: 10, 20, 30, … */
export function arcCapstoneWeek(arcIndex: ArcIndex): number {
  return (arcIndex + 1) * ARC_LENGTH_WEEKS;
}

/** The mid-chapter week: 15 for arc 1, 25 for arc 2, … (arc 0's first ladder has no midpoint). */
export function arcMidWeek(arcIndex: ArcIndex): number {
  return arcIndex * ARC_LENGTH_WEEKS + ARC_MID_OFFSET_WEEKS;
}

/** Week 10, 20, 30, … — the weeks a chapter-ending capstone is due. */
export function isCapstoneWeek(week: number): boolean {
  return week >= ARC_LENGTH_WEEKS && week % ARC_LENGTH_WEEKS === 0;
}

/** Week 15, 25, 35, … — the mid-chapter beat. Arc 0 has none: the guided ladder owns those weeks. */
export function isMidpointWeek(week: number): boolean {
  return week > ARC_LENGTH_WEEKS && week % ARC_LENGTH_WEEKS === ARC_MID_OFFSET_WEEKS;
}
