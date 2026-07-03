/**
 * End-state detection and scoring. Kept separate from the tick so game-over
 * rules can grow (acquisition, IPO) without touching the economy.
 */

import { hasRoundsAvailable } from './balance';
import { GameOverReason, GameState } from './types';

/**
 * Detect whether the run has ended this tick. Bankruptcy only ends the run
 * once cash is negative *and* every round (seed/A/B) has been raised — while
 * a round is still on the table, the player still has a lifeline. Later
 * tasks add the acquisition / IPO exits.
 */
export function checkGameOver(state: GameState): GameOverReason | null {
  if (state.cash < 0 && !hasRoundsAvailable(state.roundsRaised)) return 'bankruptcy';
  return null;
}
