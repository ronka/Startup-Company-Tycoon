/** Applies an EventEffects bundle to a GameState. Shared by news auto-apply and ANSWER_EVENT. */

import { clamp } from '../balance';
import { GameState } from '../types';
import { EventEffects } from './types';

export function applyEventEffects(state: GameState, effects: EventEffects): GameState {
  let next = state;

  for (const delta of effects.deltas ?? []) {
    switch (delta.stat) {
      case 'cash':
        next = { ...next, cash: next.cash + delta.amount };
        break;
      case 'morale':
        next = { ...next, morale: clamp(next.morale + delta.amount, 0, 100) };
        break;
      case 'hype':
        next = { ...next, hype: Math.max(0, next.hype + delta.amount) };
        break;
      case 'productQuality':
        next = { ...next, productQuality: Math.max(0, next.productQuality + delta.amount) };
        break;
      case 'marketShare':
        next = { ...next, marketShare: clamp(next.marketShare + delta.amount, 0, 1) };
        break;
    }
  }

  if (effects.timedEffect) {
    next = { ...next, activeTimedEffects: [...next.activeTimedEffects, effects.timedEffect] };
  }

  return next;
}
