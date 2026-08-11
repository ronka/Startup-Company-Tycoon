/**
 * First-run hint selection policy — pure, so it can be tested without RN infra.
 * The rendering and persistence live in `components/game/first-run-hint.tsx`.
 */

export interface HintDef {
  id: string;
  text: string;
  /** Eligibility gate; defaults to always. Lets a screen declare *when* a hint applies instead of branching around it. */
  when?: boolean;
}

/**
 * Sentinel id standing for "the player has finished a run, so the whole
 * first-run pass is over".
 *
 * It lives in the same seen-set as real hint ids on purpose: it then persists,
 * loads, and clears through exactly the same machinery, with no second storage
 * key to keep in sync. In particular `resetAllHints()` un-retires it for free,
 * so Settings → Replay intro and the debug "Reset first-run hints" keep working
 * without either of them knowing this flag exists.
 *
 * Double-underscored so it can never collide with a real hint id.
 */
export const ALL_HINTS_RETIRED_ID = '__all_retired__';

/**
 * Whether the first-run pass is retired for good. Deliberately a whole-pass
 * switch rather than per-hint: the hints teach the game, and a player who has
 * reached an ending has been taught it.
 */
export function hintsRetired(seen: ReadonlySet<string>): boolean {
  return seen.has(ALL_HINTS_RETIRED_ID);
}

/**
 * The first hint that is both unseen and currently eligible — array order is
 * priority. Pure and total: given a larger `seen` set it simply returns the
 * next hint, which is what makes a hint slot advance on dismiss with no latched
 * holder to get stuck in.
 *
 * Returns nothing at all once the pass is retired, which is what lets every
 * `HintSlot` in the app go quiet after the first completed run without any of
 * them testing for it.
 */
export function pickActiveHint(hints: HintDef[], seen: ReadonlySet<string>): HintDef | undefined {
  if (hintsRetired(seen)) return undefined;
  return hints.find((hint) => !seen.has(hint.id) && hint.when !== false);
}
