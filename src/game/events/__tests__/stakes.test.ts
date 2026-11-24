import { describe, expect, it } from 'vitest';

import { BOOM_DECK } from '../boom';
import { RECKONING_DECK } from '../reckoning';
import { SCRAPPY_DECK } from '../scrappy';
import { FALLBACK_STAKES_LINE, stakeScore, stakesLineFor } from '../stakes';
import type { EventCard } from '../types';

const byId = (id: string) => [...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK].find((card) => card.id === id)!;

describe('stakesLineFor', () => {
  it('names the share slice and morale on First Big Customer', () => {
    expect(stakesLineFor(byId('scrappy-first-big-customer'))).toBe(
      "A 2-point slice of the market, and the team's morale, are on the line.",
    );
  });

  it('names share and cash on Pricing Pressure', () => {
    expect(stakesLineFor(byId('scrappy-pricing-pressure'))).toBe('A 2-point slice of the market, and cash, are on the line.');
  });

  it('names cash, morale, and quality on the Talent Poaching War', () => {
    const line = stakesLineFor(byId('boom-talent-poaching-war'));
    expect(line).toBe('Cash, morale, and quality are on the line.');
  });

  it('counts a timed effect as stake', () => {
    // The Shortcut: +25 quality now, a 4-week quality drag later — quality is the story.
    expect(stakesLineFor(byId('scrappy-tech-debt-shortcut'))).toBe('Quality is on the line.');
  });

  it('never quotes a number tied to a choice, or a choice label', () => {
    for (const card of [...SCRAPPY_DECK, ...BOOM_DECK, ...RECKONING_DECK].filter((c) => c.kind === 'decision')) {
      const line = stakesLineFor(card);
      // Only the share slice may carry a number, and it's a magnitude, not a direction.
      expect(line.replace(/A [\d.]+-point slice/, '')).not.toMatch(/\d/);
      for (const choice of card.choices ?? []) expect(line).not.toContain(choice.label);
    }
  });

  it('falls back to a generic line when nothing measurable moves', () => {
    const card: EventCard = {
      id: 'x',
      era: 'scrappy',
      kind: 'decision',
      title: 'X',
      flavor: '',
      choices: [{ label: 'A', effects: { setsFlag: 'f' } }],
    };
    expect(stakesLineFor(card)).toBe(FALLBACK_STAKES_LINE);
    expect(stakeScore(card)).toBe(0);
  });

  it('handles a one-choice card', () => {
    const card: EventCard = {
      id: 'x',
      era: 'scrappy',
      kind: 'decision',
      title: 'X',
      flavor: '',
      choices: [{ label: 'Only', effects: { deltas: [{ stat: 'cash', amount: -30_000 }] } }],
    };
    expect(stakesLineFor(card)).toBe('Cash is on the line.');
  });

  it('is deterministic and ignores the sign of a swing', () => {
    const up = byId('scrappy-crunch-or-coast');
    expect(stakesLineFor(up)).toBe(stakesLineFor(structuredClone(up)));
    const flipped: EventCard = {
      ...up,
      choices: up.choices!.map((c) => ({
        ...c,
        effects: { ...c.effects, deltas: c.effects.deltas!.map((d) => ({ ...d, amount: -d.amount })) },
      })),
    };
    expect(stakesLineFor(flipped)).toBe(stakesLineFor(up));
  });
});
