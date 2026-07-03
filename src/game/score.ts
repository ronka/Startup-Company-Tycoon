/**
 * End-state detection and scoring. Kept separate from the tick so game-over
 * rules can grow (acquisition, IPO) without touching the economy.
 */

import { BANKRUPTCY_FUSE_WEEKS } from './balance';
import { GameOverReason, GameState } from './types';

/**
 * Detect whether the run has ended this tick. Bankruptcy fires once
 * `weeksInTheRed` reaches the fuse length — three consecutive weeks of
 * negative cash — regardless of whether a round is still raisable; passive
 * play must be able to lose. Later tasks add the acquisition / IPO exits.
 */
export function checkGameOver(state: GameState): GameOverReason | null {
  if (state.weeksInTheRed >= BANKRUPTCY_FUSE_WEEKS) return 'bankruptcy';
  return null;
}
