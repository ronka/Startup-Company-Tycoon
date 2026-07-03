/** Applies an EventEffects bundle to a GameState. Shared by news auto-apply and ANSWER_EVENT. */

import { clamp } from '../balance';
import { generateCandidates } from '../clevels';
import { C_LEVEL_ROLES, GameState } from '../types';
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

  if (effects.setsFlag && !next.storyFlags.includes(effects.setsFlag)) {
    next = { ...next, storyFlags: [...next.storyFlags, effects.setsFlag] };
  }

  if (effects.refreshCandidates) {
    let rng = next.rng;
    const cLevels = { ...next.cLevels };
    for (const role of C_LEVEL_ROLES) {
      if (cLevels[role].hired) continue; // nothing to reroll for an already-filled seat
      const offer = generateCandidates(role, rng);
      rng = offer.rng;
      cLevels[role] = { hired: null, candidates: offer.candidates };
    }
    next = { ...next, cLevels, rng };
  }

  return next;
}
