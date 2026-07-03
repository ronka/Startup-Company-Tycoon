/**
 * Weekly digest: compares a "before" and "after" snapshot of the same tick
 * and emits a `NewsEntry` for each notable threshold crossing. Pure and
 * deterministic — no RNG involved, so it needs no seed.
 */

import { BRIDGE_RUNWAY_THRESHOLD_WEEKS } from './balance';
import { NewsEntry } from './events/types';
import { Rival } from './types';

/** Morale bands worth calling out when crossed, in either direction. */
const MORALE_BANDS = [30, 50, 70];
/** Minimum per-tick share movement (vs one rival) worth surfacing. */
const SHARE_MOVE_THRESHOLD = 0.01;

export interface WeeklySnapshot {
  revenue: number;
  burn: number;
  runway: number;
  morale: number;
  rivals: Rival[];
}

export function buildDigestEntries(before: WeeklySnapshot, after: WeeklySnapshot, week: number): NewsEntry[] {
  const entries: NewsEntry[] = [];

  const wasProfitable = before.revenue >= before.burn;
  const isProfitable = after.revenue >= after.burn;
  if (wasProfitable !== isProfitable) {
    entries.push(
      isProfitable
        ? { week, kind: 'digest', title: 'Profitable this week', flavor: 'Revenue now covers burn.' }
        : { week, kind: 'digest', title: 'Slipped into the red', flavor: 'Burn now exceeds revenue.' },
    );
  }

  const wasOverRunwayThreshold = before.runway >= BRIDGE_RUNWAY_THRESHOLD_WEEKS;
  const isOverRunwayThreshold = after.runway >= BRIDGE_RUNWAY_THRESHOLD_WEEKS;
  if (wasOverRunwayThreshold !== isOverRunwayThreshold) {
    entries.push(
      isOverRunwayThreshold
        ? { week, kind: 'digest', title: 'Runway back over 8 weeks', flavor: 'Breathing room returns.' }
        : {
            week,
            kind: 'digest',
            title: 'Runway under 8 weeks',
            flavor: 'Bridge-round territory — plan ahead.',
          },
    );
  }

  for (const band of MORALE_BANDS) {
    if (before.morale < band && after.morale >= band) {
      entries.push({
        week,
        kind: 'digest',
        title: `Morale climbed past ${band}`,
        flavor: 'The team is feeling it.',
      });
    } else if (before.morale >= band && after.morale < band) {
      entries.push({
        week,
        kind: 'digest',
        title: `Morale dropped below ${band}`,
        flavor: 'Something is wearing the team down.',
      });
    }
  }

  after.rivals.forEach((rival, index) => {
    const beforeShare = before.rivals[index]?.marketShare ?? rival.marketShare;
    const delta = rival.marketShare - beforeShare;
    if (Math.abs(delta) >= SHARE_MOVE_THRESHOLD) {
      entries.push(
        delta > 0
          ? {
              week,
              kind: 'digest',
              title: `${rival.name} gained ground`,
              flavor: `Lost share to ${rival.name} this week.`,
            }
          : {
              week,
              kind: 'digest',
              title: `Took share from ${rival.name}`,
              flavor: `Gained ground on ${rival.name} this week.`,
            },
      );
    }
  });

  return entries;
}
