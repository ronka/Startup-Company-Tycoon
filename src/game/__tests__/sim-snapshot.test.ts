import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { STRATEGIES, runSim } from '../../../scripts/sim-core';

/**
 * Balance regression guard (designer-feedback plan, Phase 0.4): every sim bot
 * on fixed seeds, fingerprinted by its summary line, a hash of the printed
 * week-by-week trace, and a hash of the exact final `GameState` (the printed
 * trace rounds money, so on its own it would miss small changes). Any engine
 * or balance change that moves a number fails this test.
 *
 * Unlock schedules and chapters must leave these runs byte-identical — they
 * start with neither set. When a balance change is intended, inspect the
 * diff with `npm run sim <strategy> <seed>` and update with
 * `npx vitest run -u src/game/__tests__/sim-snapshot.test.ts`.
 */
const SEEDS = [100, 777, 12345] as const;

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

describe('sim balance snapshot', () => {
  for (const strategy of STRATEGIES) {
    it(strategy, () => {
      const runs = SEEDS.map((seed) => {
        const { lines, summary, final } = runSim(strategy, seed);
        return `${summary} trace=${hash(lines.join('\n'))} state=${hash(JSON.stringify(final))}`;
      });
      expect(runs).toMatchSnapshot();
    });
  }
});
