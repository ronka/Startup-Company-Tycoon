/**
 * End-state detection and scoring. Kept separate from the tick so game-over
 * rules can grow (acquisition, IPO) without touching the economy.
 */

import { BANKRUPTCY_FUSE_WEEKS, IPO_SUSTAIN_WEEKS, founderStakeFor } from './balance';
import { GameOverReason, GameState, Stage } from './types';

/**
 * Detect whether the run has ended this tick. Bankruptcy fires once
 * `weeksInTheRed` reaches the fuse length — three consecutive weeks of
 * negative cash — regardless of whether a round is still raisable; passive
 * play must be able to lose. Acquisition and IPO are player/event-initiated
 * (see `GO_PUBLIC` in `engine.ts` and Task 3's acquisition offers) so they
 * never fire from this automatic check.
 */
export function checkGameOver(state: GameState): GameOverReason | null {
  if (state.weeksInTheRed >= BANKRUPTCY_FUSE_WEEKS) return 'bankruptcy';
  return null;
}

/**
 * Whether `GO_PUBLIC` is currently allowed: growth stage, the IPO window
 * open (era-dependent — see Task 5), and revenue sustained above the bar
 * for `IPO_SUSTAIN_WEEKS` running.
 */
export function isIpoEligible(
  stage: Stage,
  ipoWindowOpen: boolean,
  weeksRevenueAboveIpoBar: number,
): boolean {
  return stage === 'growth' && ipoWindowOpen && weeksRevenueAboveIpoBar >= IPO_SUSTAIN_WEEKS;
}

/** Score for a run ending with `reason`: founder take-home at exit, or $0 for bankruptcy. */
export function scoreFor(reason: GameOverReason, founderEquity: number, exitValuation: number): number {
  if (reason === 'bankruptcy') return 0;
  return founderStakeFor(founderEquity, exitValuation);
}
