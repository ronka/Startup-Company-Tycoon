/**
 * Timings for the round-closed celebration (`src/components/game/round-celebration.tsx`),
 * kept in a plain module so the store can wait for the party without importing a component.
 */

/** Waits for the term sheet sheet to slide away, so the confetti isn't hidden behind it. */
export const ROUND_CELEBRATION_START_DELAY_MS = 350;
/** The card stays up this long unless tapped away. */
export const ROUND_CELEBRATION_AUTO_DISMISS_MS = 3800;
/** When the whole party is over: anything else that wants the screen after a raise waits this long. */
export const ROUND_CELEBRATION_TOTAL_MS = ROUND_CELEBRATION_START_DELAY_MS + ROUND_CELEBRATION_AUTO_DISMISS_MS;
