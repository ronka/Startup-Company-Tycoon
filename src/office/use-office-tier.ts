import { useState } from 'react';

import { OFFICES } from './maps';
import { advanceTierHold, initialTierHold, pickOfficeTier, type TierHold } from './select-office';

const CAPACITIES = OFFICES.map((o) => ({ tier: o.map.tier, capacity: o.map.capacity }));

/**
 * The office tier to show, with hysteresis: it's fed once per data refresh
 * (`refreshKey`, the game week) so a company hovering at a threshold doesn't
 * flicker between two offices. Kept in component state, never in the save.
 */
export function useOfficeTier(employees: number, wealth: number, refreshKey: number) {
  const [state, setState] = useState<{ hold: TierHold; key: number }>(() => ({
    hold: initialTierHold(pickOfficeTier(employees, wealth, CAPACITIES)),
    key: refreshKey,
  }));
  // Derive-during-render: advance once per new refresh key.
  if (state.key !== refreshKey) {
    const next = { hold: advanceTierHold(state.hold, employees, wealth, CAPACITIES), key: refreshKey };
    setState(next);
    return next.hold.shown;
  }
  return state.hold.shown;
}
