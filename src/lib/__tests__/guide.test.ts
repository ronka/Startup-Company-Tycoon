import { describe, expect, it } from 'vitest';

import { newGame } from '@/game/engine';
import type { EventCard } from '@/game/events/types';
import type { GameState } from '@/game/types';
import { guideStep, guideTabFor } from '@/lib/guide';

const team = (devs: number, sales: number, support = 0) => ({ devs, sales, support });

const run = (overrides: Partial<GameState> = {}): GameState => ({
  ...newGame('Test Co', 1),
  unlockSchedule: 'guided-ui',
  questsDone: [],
  ...overrides,
});

describe('guideStep', () => {
  it('sends you to the Team tab, then to the + that hires a developer', () => {
    expect(guideStep(run(), 'hq')).toMatchObject({ target: { kind: 'tab', tab: 'team' }, text: 'Tap Team to hire a developer' });
    expect(guideStep(run(), 'team')).toMatchObject({ target: { kind: 'hire', role: 'devs' } });
  });

  it('then points at the salesperson +', () => {
    expect(guideStep(run({ pendingHeadcount: team(1, 0) }), 'team')?.target).toEqual({ kind: 'hire', role: 'sales' });
  });

  it('points at Next Week once only playing weeks moves the mission', () => {
    const step = guideStep(run({ pendingHeadcount: team(1, 1) }), 'team');
    expect(step).toMatchObject({ target: { kind: 'next-week' }, text: '🎯 0/1 customer · Tap Next Week', label: null });
  });

  it('dims the Next Week tooltip out of free weeks', () => {
    expect(guideStep(run({ pendingHeadcount: team(1, 1) }), 'hq', { atWall: true })).toMatchObject({ dimmed: true });
  });

  it('goes to Money and then Raise when cash runs low', () => {
    const short = run({ pendingHeadcount: team(2, 1), headcount: team(2, 1), cash: 100_000, week: 3 });
    expect(guideStep(short, 'hq')?.target).toEqual({ kind: 'tab', tab: 'money' });
    expect(guideStep(short, 'money')?.target).toEqual({ kind: 'raise' });
  });

  it('points at what just unlocked until you open its tab', () => {
    const state = run({ pendingHeadcount: team(1, 1) });
    expect(guideStep(state, 'hq', { freshUnlocks: ['focus'] })?.target).toEqual({ kind: 'tab', tab: 'market' });
    expect(guideStep(state, 'market', { freshUnlocks: ['focus'] })?.target).toEqual({ kind: 'next-week' });
  });

  it('stays quiet for a waiting card, outside a guided run, and once the ladder is done', () => {
    const card: EventCard = { id: 'x', era: 'scrappy', kind: 'decision', title: 'X', flavor: '', choices: [] };
    expect(guideStep(run({ pendingEvent: card }), 'hq')).toBeNull();
    expect(guideStep(newGame('Test Co', 1), 'hq')).toBeNull();
    const done = run({
      pendingHeadcount: team(1, 1),
      questsDone: ['hire-dev', 'hire-sales', 'first-customer', 'five-customers', 'income', 'customers'],
    });
    expect(guideStep(done, 'hq')).toBeNull();
  });
});

describe('guideTabFor', () => {
  it('reads the tab from the pathname', () => {
    expect(guideTabFor('/team')).toBe('team');
    expect(guideTabFor('/market')).toBe('market');
    expect(guideTabFor('/')).toBe('hq');
    expect(guideTabFor('/hq')).toBe('hq');
  });
});
