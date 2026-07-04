/**
 * Timeline event data. Pure data + a couple of pure helpers — same purity
 * rules as the rest of `src/game/`. Adding a card means adding one object
 * literal to a deck file (e.g. `scrappy.ts`); nothing here or in `engine.ts`
 * needs to change.
 */

export type Era = 'scrappy' | 'boom' | 'reckoning';

/** The GameState fields an event is allowed to move. */
export type EventStat = 'cash' | 'morale' | 'hype' | 'productQuality' | 'marketShare';

/** An immediate, additive change to one stat. */
export interface StatDelta {
  stat: EventStat;
  amount: number;
}

/** A multiplier on a stat that decays back to normal after `weeksLeft` ticks. */
export interface TimedEffect {
  stat: EventStat;
  multiplier: number;
  weeksLeft: number;
}

/**
 * Choosing this ends the run as `acquired`: the offer price is
 * `valuationMultiplier` × the valuation at the moment the card is answered
 * (see `acquisitionOfferValuationFor` in `balance.ts`), scored via
 * `scoreFor` like any other exit.
 */
export interface AcquisitionOffer {
  valuationMultiplier: number;
}

export interface EventEffects {
  deltas?: StatDelta[];
  timedEffect?: TimedEffect;
  /** Present only on the "accept" choice of an acquisition-offer card. */
  acquisitionOffer?: AcquisitionOffer;
  /**
   * Sets a simple story flag on `GameState.storyFlags` when this effect
   * bundle applies. On a decision card, different choices can set different
   * flags (or none), so a follow-up card's availability can depend on which
   * choice was taken — see `EventCard.requiresFlag`.
   */
  setsFlag?: string;
  /**
   * Rerolls the candidate offer for every open (not yet hired) C-level seat.
   * Used by the Morning Standup's golden-streak tier (Task 15) — a fresh
   * batch of options is often worth more than a flat stat bump once a run is
   * mid-search for a CTO/CMO/CFO.
   */
  refreshCandidates?: boolean;
}

export interface EventChoice {
  label: string;
  effects: EventEffects;
}

export interface EventCard {
  id: string;
  era: Era;
  kind: 'news' | 'decision';
  title: string;
  flavor: string;
  /** 'news' cards only — applied automatically the week they're drawn. */
  effects?: EventEffects;
  /** 'decision' cards only — 2–3 choices, each with its own effects. */
  choices?: EventChoice[];
  /** Only drawable once this story flag has been set by an earlier card. */
  requiresFlag?: string;
  /**
   * Filler cards (small mechanism, repeatable pool) are drawn once an era's
   * unique deck is exhausted; unlike unique cards, they're never added to
   * `drawnEventIds` so the same one can come up again.
   */
  repeatable?: boolean;
}

/** A resolved event or weekly-digest note, newest first in `GameState.newsLog`. */
export interface NewsEntry {
  week: number;
  title: string;
  flavor: string;
  /** Present only when a decision card was answered. */
  choiceLabel?: string;
  /**
   * `'digest'` marks weekly-digest threshold crossings; `'era'` marks an era
   * transition (Scrappy → Boom → Reckoning) — both style distinctly from
   * drawn event cards, and `'era'` renders full-width. `'trend'` marks a tech
   * trend wave phase change (see `trendPhaseChangeNewsEntry` in trends.ts).
   */
  kind?: 'digest' | 'era' | 'trend';
}
