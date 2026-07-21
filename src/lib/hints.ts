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
 * The first hint that is both unseen and currently eligible — array order is
 * priority. Pure and total: given a larger `seen` set it simply returns the
 * next hint, which is what makes a hint slot advance on dismiss with no latched
 * holder to get stuck in.
 */
export function pickActiveHint(hints: HintDef[], seen: ReadonlySet<string>): HintDef | undefined {
  return hints.find((hint) => !seen.has(hint.id) && hint.when !== false);
}
