/**
 * Weekly digest: compares a "before" and "after" snapshot of the same tick
 * and emits a `NewsEntry` for each notable threshold crossing. Pure and
 * deterministic — no RNG involved, so it needs no seed.
 */

import { BRIDGE_RUNWAY_THRESHOLD_WEEKS } from './balance';
import { Era, NewsEntry } from './events/types';
import { Rival } from './types';

const ERA_TRANSITION_COPY: Partial<Record<Era, { title: string; flavor: string }>> = {
  boom: {
    title: 'The Boom Begins',
    flavor: 'Money is everywhere. Everyone is raising, hiring, and hoping the music never stops.',
  },
  reckoning: {
    title: 'The Reckoning Arrives',
    flavor: 'The market turns. Cheap capital dries up, and weak players start getting culled.',
  },
};

/** A full-width news entry announcing an era transition (never fires for 'scrappy', the starting era). */
export function eraTransitionEntry(era: Era, week: number): NewsEntry | null {
  const copy = ERA_TRANSITION_COPY[era];
  if (!copy) return null;
  return { week, kind: 'era', title: copy.title, flavor: copy.flavor };
}

/** Morale bands worth calling out when crossed, in either direction. */
const MORALE_BANDS = [30, 50, 70];
/** Minimum net weekly share swing (your side, not any one rival) worth surfacing. */
const SHARE_MOVE_THRESHOLD = 0.01;
/** Hype multiples worth calling out as it spikes from an event and decays back toward the 1.0x baseline. */
const HYPE_BANDS = [1.2, 1.5, 2.0];

export interface WeeklySnapshot {
  revenue: number;
  burn: number;
  runway: number;
  morale: number;
  marketShare: number;
  rivals: Rival[];
  productQuality: number;
  hype: number;
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

  const yourShareDelta = after.marketShare - before.marketShare;
  if (Math.abs(yourShareDelta) >= SHARE_MOVE_THRESHOLD) {
    // One aggregate line rather than one entry per rival: name-match (a rival
    // slot can change occupant mid-tick — Task 11's collapse/entrant
    // dynamics) and call out whichever rival moved the most, opposite your
    // direction, as the cause behind the swing.
    let biggestContributor: Rival | null = null;
    let biggestDelta = 0;
    for (const rival of after.rivals) {
      const beforeRival = before.rivals.find((r) => r.name === rival.name);
      if (!beforeRival) continue;
      const rivalDelta = rival.marketShare - beforeRival.marketShare;
      if (!biggestContributor || Math.abs(rivalDelta) > Math.abs(biggestDelta)) {
        biggestContributor = rival;
        biggestDelta = rivalDelta;
      }
    }
    const pct = `${Math.abs(yourShareDelta * 100).toFixed(1)}%`;
    // Share moves because of the quality gap (`shareShiftFor` in engine.ts),
    // so the cause is literally your product quality vs. the biggest mover's.
    const cause = biggestContributor
      ? after.productQuality >= biggestContributor.productQuality
        ? `Your product quality outpaced ${biggestContributor.name}'s`
        : `${biggestContributor.name}'s product quality outpaced yours`
      : yourShareDelta > 0
        ? 'Broad gains across the market'
        : 'Broad losses across the market';
    entries.push({
      week,
      kind: 'digest',
      title: yourShareDelta > 0 ? `Gained ${pct} share this week` : `Lost ${pct} share this week`,
      flavor: `${cause} → ${yourShareDelta > 0 ? '+' : '-'}${pct} share.`,
    });
  }

  const hypeCrossing = crossedBand(before.hype, after.hype, HYPE_BANDS);
  if (hypeCrossing) {
    entries.push(
      hypeCrossing.direction === 'up'
        ? {
            week,
            kind: 'digest',
            title: `Hype spiked past ${hypeCrossing.band}x`,
            flavor: 'A boost is temporarily lifting revenue and valuation → higher hype multiplier.',
          }
        : {
            week,
            kind: 'digest',
            title: `Hype cooled below ${hypeCrossing.band}x`,
            flavor: 'Hype is decaying back toward its 1.0x neutral baseline → lower hype multiplier.',
          },
    );
  }

  return entries;
}

/** The highest band crossed between two values, and which direction it was crossed in. */
function crossedBand(
  before: number,
  after: number,
  bands: number[],
): { band: number; direction: 'up' | 'down' } | null {
  let crossed: { band: number; direction: 'up' | 'down' } | null = null;
  for (const band of bands) {
    if (before < band && after >= band) crossed = { band, direction: 'up' };
    else if (before >= band && after < band) crossed = { band, direction: 'down' };
  }
  return crossed;
}

/**
 * Whether a week's worth of resolved news entries (event cards, digest
 * threshold crossings, era transitions, attrition/rival beats — see
 * `engine.ts`'s `tick`) warrants the full Week in Review sheet rather than a
 * compact one-line ticker. The single tunable rule: any entry at all. Quiet
 * weeks produce zero entries by construction (every entry above already
 * gates on a real threshold), so this needs no separate notability logic.
 */
export function isNotableWeek(weekEntries: NewsEntry[]): boolean {
  return weekEntries.length > 0;
}
