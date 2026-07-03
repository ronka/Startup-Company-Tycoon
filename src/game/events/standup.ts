/**
 * Morning Standup: a daily reward card the store injects directly into
 * `pendingEvent` on the first session of each day (Task 15) — same
 * `EventCard`/`ANSWER_EVENT` machinery as any drawn decision card, just
 * bypassing the era-deck draw. The pool offered scales with the player's
 * daily-play streak; `era` on these cards is nominal (never era-gated).
 */

import { Era, EventCard } from './types';

export type StandupTier = 'base' | 'upgraded' | 'golden' | 'rare';

/** Streak-day thresholds, forgiving per the PRD's grace-day rule (see `src/state/daily-streak.ts`). */
export const STANDUP_UPGRADED_STREAK_DAYS = 3;
export const STANDUP_GOLDEN_STREAK_DAYS = 7;
export const STANDUP_RARE_STREAK_DAYS = 14;

/** Set by the rare tier's "clean terms" choice; consumed and cleared by the next `RAISE_ROUND` (see `engine.ts`). */
export const CLEAN_RAISE_TERMS_FLAG = 'clean-raise-terms';

const NOMINAL_ERA: Era = 'scrappy';

export function standupTierForStreak(streakDays: number): StandupTier {
  if (streakDays >= STANDUP_RARE_STREAK_DAYS) return 'rare';
  if (streakDays >= STANDUP_GOLDEN_STREAK_DAYS) return 'golden';
  if (streakDays >= STANDUP_UPGRADED_STREAK_DAYS) return 'upgraded';
  return 'base';
}

const STANDUP_CARDS: Record<StandupTier, EventCard> = {
  base: {
    id: 'daily-standup-base',
    era: NOMINAL_ERA,
    kind: 'decision',
    title: 'Morning Standup',
    flavor: 'Quick sync before the week kicks off — what does the team lean into today?',
    choices: [
      { label: 'Grab a quick win (+$5,000 cash)', effects: { deltas: [{ stat: 'cash', amount: 5_000 }] } },
      { label: 'Check in on the team (+5 morale)', effects: { deltas: [{ stat: 'morale', amount: 5 }] } },
      { label: 'Post a customer story (+0.1 hype)', effects: { deltas: [{ stat: 'hype', amount: 0.1 }] } },
    ],
  },
  upgraded: {
    id: 'daily-standup-upgraded',
    era: NOMINAL_ERA,
    kind: 'decision',
    title: 'Morning Standup',
    flavor: 'The team is in a groove — a few days of momentum in a row now.',
    choices: [
      { label: 'Grab a quick win (+$10,000 cash)', effects: { deltas: [{ stat: 'cash', amount: 10_000 }] } },
      { label: 'Check in on the team (+10 morale)', effects: { deltas: [{ stat: 'morale', amount: 10 }] } },
      { label: 'Post a customer story (+0.2 hype)', effects: { deltas: [{ stat: 'hype', amount: 0.2 }] } },
    ],
  },
  golden: {
    id: 'daily-standup-golden',
    era: NOMINAL_ERA,
    kind: 'decision',
    title: 'Morning Standup — Golden Streak',
    flavor: 'A full week of daily check-ins. The team offers something bigger today.',
    choices: [
      {
        label: 'Refresh every open leadership search',
        effects: { refreshCandidates: true },
      },
      { label: 'Grab a quick win (+$20,000 cash)', effects: { deltas: [{ stat: 'cash', amount: 20_000 }] } },
      { label: 'Check in on the team (+15 morale)', effects: { deltas: [{ stat: 'morale', amount: 15 }] } },
    ],
  },
  rare: {
    id: 'daily-standup-rare',
    era: NOMINAL_ERA,
    kind: 'decision',
    title: 'Morning Standup — Two Weeks Strong',
    flavor: 'Two weeks of daily discipline. Investors notice consistency too.',
    choices: [
      {
        label: 'Bank clean terms for the next raise',
        effects: { setsFlag: CLEAN_RAISE_TERMS_FLAG },
      },
      { label: 'Grab a quick win (+$25,000 cash)', effects: { deltas: [{ stat: 'cash', amount: 25_000 }] } },
      { label: 'Check in on the team (+15 morale)', effects: { deltas: [{ stat: 'morale', amount: 15 }] } },
    ],
  },
};

/** The Standup card to inject for today's session, given the player's current streak length. */
export function standupCardForStreak(streakDays: number): EventCard {
  return STANDUP_CARDS[standupTierForStreak(streakDays)];
}
