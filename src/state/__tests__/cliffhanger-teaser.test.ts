import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import type { EventCard } from '../../game/events/types';
import type { GameState } from '../../game/types';
import { cliffhangerTeaserFor, teaserForCard } from '../day-close';
import { notificationContentFor, NOTIFICATION_TITLE_MAX } from '../notification-content';

function healthy(overrides: Partial<GameState> = {}): GameState {
  return { ...newGame('Acme', 1), cash: 50_000_000, ...overrides };
}

const card = (overrides: Partial<EventCard>): EventCard => ({
  id: 'test-card',
  era: 'scrappy',
  kind: 'decision',
  title: 'Test Card',
  flavor: 'Full flavor text that the wall must never print.',
  choices: [
    { label: 'Go left', effects: { deltas: [{ stat: 'cash', amount: 20_000 }] } },
    { label: 'Go right', effects: { deltas: [{ stat: 'morale', amount: -10 }] } },
  ],
  ...overrides,
});

describe('cliffhangerTeaserFor (the real pinned card)', () => {
  it('carries title, teaser, the two locked choices, and stakes for First Big Customer', () => {
    expect(cliffhangerTeaserFor(healthy({ cliffhangerCardId: 'scrappy-first-big-customer' }))).toEqual({
      cardId: 'scrappy-first-big-customer',
      line: 'A company ten times your size just asked for a call. They want something — by Friday.',
      title: 'First Big Customer',
      teaser: 'A company ten times your size just asked for a call. They want something — by Friday.',
      choiceA: 'Take the deal, crunch the week',
      choiceB: 'Decline, protect the roadmap',
      stakes: "A 2-point slice of the market, and the team's morale, are on the line.",
    });
  });

  it('is null with nothing pinned, with a decision on screen, or once the run is over', () => {
    expect(cliffhangerTeaserFor(null)).toBeNull();
    expect(cliffhangerTeaserFor(healthy())).toBeNull();
    expect(cliffhangerTeaserFor(healthy({ cliffhangerCardId: 'nope-not-a-card' }))).toBeNull();
    expect(
      cliffhangerTeaserFor(healthy({ cliffhangerCardId: 'scrappy-first-big-customer', gameOver: 'bankruptcy' })),
    ).toBeNull();
  });

  it('reads a generated (crisis) card carried on the state', () => {
    const crisis = card({ id: 'crisis-arc-3', title: 'The Cash Cliff', teaser: 'The bank called.' });
    const teaser = cliffhangerTeaserFor(healthy({ cliffhangerCardId: crisis.id, pinnedCard: crisis }));
    expect(teaser?.title).toBe('The Cash Cliff');
    expect(teaser?.choiceA).toBe('Go left');
  });
});

describe('teaserForCard', () => {
  it('falls back to the title when a card has no teaser', () => {
    const teaser = teaserForCard(card({ teaser: undefined }));
    expect(teaser.teaser).toBe('Test Card');
    expect(teaser.line).toBe('Test Card is coming.');
  });

  it('shows only the first two choices', () => {
    const three = card({
      choices: [
        { label: 'One', effects: {} },
        { label: 'Two', effects: {} },
        { label: 'Three', effects: {} },
      ],
    });
    const teaser = teaserForCard(three);
    expect([teaser.choiceA, teaser.choiceB]).toEqual(['One', 'Two']);
    expect(JSON.stringify(teaser)).not.toContain('Three');
  });

  it('handles a one-choice card', () => {
    const teaser = teaserForCard(card({ choices: [{ label: 'Only way', effects: {} }] }));
    expect(teaser.choiceA).toBe('Only way');
    expect(teaser.choiceB).toBeNull();
  });

  it('never leaks the flavor text or per-choice numbers', () => {
    const teaser = teaserForCard(card({ teaser: 'Something is up.' }));
    const text = JSON.stringify(teaser);
    expect(text).not.toContain('Full flavor text');
    expect(text).not.toMatch(/20,?000|-10/);
  });
});

describe('cliffhanger push copy', () => {
  it("names the card in the title when it fits, and keeps the teaser as the body", () => {
    const content = notificationContentFor(healthy({ cliffhangerCardId: 'scrappy-pricing-pressure' }));
    expect(content?.title).toBe('Acme: Pricing Pressure');
    expect(content?.body).toBe("Your biggest prospect is ready to sign — at a price you won't like.");
  });

  it('falls back to the plain title when the company name makes it too long', () => {
    const name = 'An Extremely Long Startup Name Incorporated';
    const content = notificationContentFor({ ...healthy({ cliffhangerCardId: 'scrappy-pricing-pressure' }), companyName: name });
    expect(content?.title).toBe(`${name}: next week`);
    expect(`${name}: Pricing Pressure`.length).toBeGreaterThan(NOTIFICATION_TITLE_MAX);
  });
});
