import { describe, expect, it } from 'vitest';

import { FAILURE_COOLDOWN_MS, isBlocked, OPEN_GATE, recordFailure } from '../purchase-failure-gate';

describe('purchase failure gate', () => {
  it('stays open after a single failure', () => {
    const gate = recordFailure(OPEN_GATE, 1000);
    expect(isBlocked(gate, 1000)).toBe(false);
  });

  it('blocks after two consecutive failures', () => {
    const gate = recordFailure(recordFailure(OPEN_GATE, 1000), 2000);
    expect(isBlocked(gate, 2000)).toBe(true);
  });

  it('reopens once the cooldown has passed', () => {
    const gate = recordFailure(recordFailure(OPEN_GATE, 1000), 2000);
    expect(isBlocked(gate, 2000 + FAILURE_COOLDOWN_MS - 1)).toBe(true);
    expect(isBlocked(gate, 2000 + FAILURE_COOLDOWN_MS)).toBe(false);
  });

  it('starts a fresh streak when a failure lands after the cooldown', () => {
    const tripped = recordFailure(recordFailure(OPEN_GATE, 1000), 2000);
    const later = 2000 + FAILURE_COOLDOWN_MS;
    const gate = recordFailure(tripped, later);
    expect(gate.consecutiveFailures).toBe(1);
    expect(isBlocked(gate, later)).toBe(false);
  });
});
