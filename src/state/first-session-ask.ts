/**
 * The pure gate for the first-session notification soft ask: a one-time "your
 * investors check in every morning — want a heads-up?" sheet, shown once the
 * player is a few weeks into their first session, ahead of the OS dialog.
 *
 * Why a first-session ask at all: the only other asks are the wall's "Notify
 * me" button (most new players never reach the wall on day one) and the
 * unannounced second-launch fallback (which needs a second launch — the very
 * thing a 4–6% day-1 return rate says we rarely get).
 *
 * The impure half — AsyncStorage, the sheet, the OS dialog — lives in
 * `game-chrome.tsx` and `notification-permission.ts`.
 */

/** The first week the soft ask may appear: far enough in that the player has felt the loop. */
export const FIRST_SESSION_ASK_WEEK = 3;

export interface FirstSessionAskInput {
  /** The run's current week. */
  week: number;
  /** This week's recap has been shown and dismissed (or the week had none). */
  recapSettled: boolean;
  /** The OS permission shot is still unspent. `null` while the read is in flight. */
  permissionUnspent: boolean | null;
  /** This install already saw the soft ask. `null` while the read is in flight. */
  softAskShown: boolean | null;
  /** Web has no permission dialog to ask for. */
  isWeb: boolean;
  /**
   * Some other surface owns the screen or is about to: a decision card, a buy
   * surface, the closing panel, the leaderboard ask. The ask waits its turn
   * instead of presenting into their frame (docs/bug-stuck-decision-modal.md).
   */
  otherSurfaceBusy: boolean;
  /** The free-week wall: the closing panel owns that beat and carries its own "Notify me". */
  atWall: boolean;
}

export function firstSessionAskDue(input: FirstSessionAskInput): boolean {
  if (input.isWeb) return false;
  // Unknown is not "yes": both reads must land before anything presents.
  if (input.permissionUnspent !== true || input.softAskShown !== false) return false;
  if (input.week < FIRST_SESSION_ASK_WEEK) return false;
  if (!input.recapSettled || input.otherSurfaceBusy || input.atWall) return false;
  return true;
}
