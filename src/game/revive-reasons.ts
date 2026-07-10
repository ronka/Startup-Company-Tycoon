/**
 * Silly, purely-cosmetic flavor for the bankruptcy bailout IAP (revive): a
 * random windfall story shown when the player is offered — and takes — a
 * revive. The cash a revive grants is fixed in the engine (the `REVIVE`
 * action restores `STARTING_CASH`); these strings never affect the amount,
 * they only set the tone and annotate the news log.
 */
export const REVIVE_REASONS: readonly string[] = [
  'Your uncle died and left you his entire fortune.',
  'You won a small-town lottery you forgot you entered.',
  'A mysterious benefactor wired money to your account.',
  'Your childhood coin collection turned out to be worth a fortune.',
  'A long-lost startup you angel-invested in finally exited.',
  'You found a briefcase of cash in your storage unit.',
  'Grandma remortgaged the house to believe in your dream.',
  'A crypto wallet you abandoned in 2013 just... came back.',
  'Your rival felt bad and quietly Venmo’d you a rescue.',
  'You sold your vintage sneaker collection to a whale.',
];

/** Pick a random windfall reason. `random` is injectable for deterministic tests. */
export function randomReviveReason(random: () => number = Math.random): string {
  return REVIVE_REASONS[Math.floor(random() * REVIVE_REASONS.length)];
}
