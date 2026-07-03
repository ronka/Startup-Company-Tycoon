/** Presentation-layer roll-up of a GameState into the numbers screens display. */

import { founderStakeFor, weeklyStatsFor, type WeeklyStats } from '@/game/balance';
import type { GameState } from '@/game/types';

export interface DerivedStats extends WeeklyStats {
  insolvent: boolean;
  /** Founder take-home at the current valuation — the run's score-in-progress. */
  stake: number;
}

export function deriveWeeklyStats(state: GameState): DerivedStats {
  const stats = weeklyStatsFor(state);
  return { ...stats, insolvent: state.cash < 0, stake: founderStakeFor(state.founderEquity, stats.valuation) };
}
