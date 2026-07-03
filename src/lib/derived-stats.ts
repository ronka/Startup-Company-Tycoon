/** Presentation-layer roll-up of a GameState into the numbers screens display. */

import { weeklyStatsFor, type WeeklyStats } from '@/game/balance';
import type { GameState } from '@/game/types';

export interface DerivedStats extends WeeklyStats {
  insolvent: boolean;
}

export function deriveWeeklyStats(state: GameState): DerivedStats {
  return { ...weeklyStatsFor(state), insolvent: state.cash < 0 };
}
