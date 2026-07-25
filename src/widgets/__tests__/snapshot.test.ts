import { describe, expect, it } from 'vitest';

import { newGame } from '../../game/engine';
import type { GameState } from '../../game/types';
import { deriveWeeklyStats } from '../../lib/derived-stats';
import { formatMoney, formatWeeks } from '../../lib/format';
import { LOW_RUNWAY_WARNING_WEEKS } from '../../state/notification-content';
import {
  WEEKS_BANK_CAP,
  WEEKS_PER_DAY,
  type PurchasedWeeksPool,
  type WeekBudget,
} from '../../state/week-budget';
import { nextLocalMidnight, widgetSnapshot, widgetTimeline } from '../snapshot';

const NOW = new Date(2026, 6, 21, 14, 30); // local time, mid-afternoon

const budget = (weeksRemaining: number, now = NOW): WeekBudget => ({
  lastSessionDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  weeksRemaining,
});

const purchased = (weeksRemaining: number): PurchasedWeeksPool => ({
  weeksRemaining,
  grantedTransactionIds: [],
});

/** Plenty of cash, huge burn — a live run staring down the runway warning. */
const brokeRun = (): GameState => ({
  ...newGame('Acme', 1),
  cash: 1_000,
  headcount: { devs: 50, sales: 50, support: 50 },
  pendingHeadcount: { devs: 50, sales: 50, support: 50 },
});

describe('widgetSnapshot', () => {
  it('reports the empty state when there is no save', () => {
    const snap = widgetSnapshot(null, budget(3), purchased(0));
    expect(snap.status).toBe('none');
    expect(snap.companyName).toBe('');
    expect(snap.outcomeLabel).toBe('');
    // Weeks still count — a player with weeks banked and no run has something to spend them on.
    expect(snap.weeksReady).toBe(3);
  });

  it('mirrors a live run', () => {
    const state: GameState = { ...newGame('Acme', 1), week: 34, cash: 250_000 };
    const snap = widgetSnapshot(state, budget(4), purchased(0));
    const stats = deriveWeeklyStats(state);
    expect(snap.status).toBe('run');
    expect(snap.companyName).toBe('Acme');
    expect(snap.week).toBe(34);
    // Formatting runs through src/lib/format.ts here, in the app process — the
    // widget extension cannot reach it (see the note in snapshot.ts).
    expect(snap.cashLabel).toBe(formatMoney(250_000));
    expect(snap.runwayLabel).toBe(formatWeeks(stats.runway));
    expect(snap.valuationLabel).toBe(formatMoney(stats.valuation));
    expect(snap.decisionPending).toBe(false);
    expect(snap.outcomeLabel).toBe('');
    expect(snap.scoreLabel).toBe('');
  });

  it('flags a pending decision', () => {
    const state: GameState = {
      ...newGame('Acme', 1),
      pendingEvent: {
        id: 'x',
        era: 'scrappy',
        kind: 'decision',
        title: 'Series A term sheet',
        flavor: '...',
        choices: [{ label: 'Sign', effects: {} }],
      },
    };
    expect(widgetSnapshot(state, budget(1), purchased(0)).decisionPending).toBe(true);
  });

  it('marks runway critical at or below the warning line', () => {
    expect(deriveWeeklyStats(brokeRun()).runway).toBeLessThanOrEqual(LOW_RUNWAY_WARNING_WEEKS);
    expect(widgetSnapshot(brokeRun(), budget(1), purchased(0)).runwayCritical).toBe(true);
  });

  it('marks runway critical whenever cash has gone negative', () => {
    // Negative cash makes `runwayWeeks` return a negative number rather than a
    // small one, so the threshold alone would not necessarily catch it.
    const state: GameState = { ...newGame('Acme', 1), cash: -20_000 };
    const snap = widgetSnapshot(state, budget(1), purchased(0));
    expect(snap.cashNegative).toBe(true);
    expect(snap.runwayCritical).toBe(true);
  });

  it('renders an infinite runway as a glyph, never as raw Infinity', () => {
    // Revenue past burn => `runwayWeeks` returns Infinity, which would not
    // survive the JSON trip to the widget extension. Formatting it here means
    // no non-finite number ever crosses.
    const state: GameState = { ...newGame('Acme', 1), customers: 50_000_000, cash: 1_000_000 };
    const snap = widgetSnapshot(state, budget(1), purchased(0));
    expect(deriveWeeklyStats(state).runway).toBe(Infinity);
    expect(snap.runwayLabel).toBe('∞');
    expect(snap.runwayCritical).toBe(false);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('shows outcome and score, not live numbers, once the run is over', () => {
    const state: GameState = {
      ...newGame('Acme', 1),
      week: 61,
      cash: 4_000_000,
      gameOver: 'acquired',
      finalScore: 4_200_000,
    };
    const snap = widgetSnapshot(state, budget(2), purchased(0));
    expect(snap.status).toBe('over');
    expect(snap.outcomeLabel).toBe('Acquired');
    expect(snap.outcomeWon).toBe(true);
    expect(snap.scoreLabel).toBe(formatMoney(4_200_000));
    expect(snap.companyName).toBe('Acme');
    expect(snap.week).toBe(61);
    // A dead run's cash/runway/valuation are meaningless — deliberately blank.
    expect(snap.cashLabel).toBe('');
    expect(snap.runwayLabel).toBe('');
    expect(snap.valuationLabel).toBe('');
  });

  it('shows no score at all for a bankruptcy', () => {
    // A bankruptcy scores 0; "Bankrupt · $0" is a worse read than "Bankrupt".
    const state: GameState = { ...newGame('Acme', 1), gameOver: 'bankruptcy', finalScore: null };
    const snap = widgetSnapshot(state, budget(0), purchased(0));
    expect(snap.outcomeLabel).toBe('Bankrupt');
    expect(snap.outcomeWon).toBe(false);
    expect(snap.scoreLabel).toBe('');
  });

  it('labels an IPO exit', () => {
    const state: GameState = { ...newGame('Acme', 1), gameOver: 'ipo', finalScore: 12_000_000 };
    const snap = widgetSnapshot(state, budget(0), purchased(0));
    expect(snap.outcomeLabel).toBe('IPO');
    expect(snap.outcomeWon).toBe(true);
    expect(snap.scoreLabel).toBe(formatMoney(12_000_000));
  });

  it('emits only bridge-safe primitives', () => {
    // The props cross into the widget extension as a serialized dictionary.
    const snap = widgetSnapshot(brokeRun(), budget(2), purchased(1));
    for (const [key, value] of Object.entries(snap)) {
      const ok = typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
      expect(ok, `${key} is not bridge-safe: ${String(value)}`).toBe(true);
    }
  });

  it('combines the free and purchased week pools', () => {
    const snap = widgetSnapshot(newGame('Acme', 1), budget(0), purchased(6));
    // Free-only would read "0 ready" to a player who has already paid for six.
    expect(snap.weeksReady).toBe(6);
    expect(widgetSnapshot(newGame('Acme', 1), budget(3), purchased(6)).weeksReady).toBe(9);
  });

  it('treats pools that have not loaded yet as empty', () => {
    expect(widgetSnapshot(newGame('Acme', 1), null, null).weeksReady).toBe(0);
  });
});

describe('nextLocalMidnight', () => {
  it('is the upcoming local midnight, not a UTC one', () => {
    const midnight = nextLocalMidnight(NOW);
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getDate()).toBe(22);
    expect(midnight.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('does not mutate the date it is given', () => {
    const now = new Date(NOW);
    nextLocalMidnight(now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});

describe('widgetTimeline', () => {
  it('is exactly two entries: now, and next local midnight', () => {
    const entries = widgetTimeline(newGame('Acme', 1), budget(2), purchased(0), NOW);
    expect(entries).toHaveLength(2);
    expect(entries[0].date.getTime()).toBe(NOW.getTime());
    expect(entries[1].date.getTime()).toBe(nextLocalMidnight(NOW).getTime());
  });

  it('forecasts the midnight grant on the second entry', () => {
    const entries = widgetTimeline(newGame('Acme', 1), budget(2), purchased(0), NOW);
    expect(entries[0].props.weeksReady).toBe(2);
    expect(entries[1].props.weeksReady).toBe(2 + WEEKS_PER_DAY);
  });

  it('clamps the forecast at the bank cap', () => {
    const nearCap = WEEKS_BANK_CAP - 1;
    const entries = widgetTimeline(newGame('Acme', 1), budget(nearCap), purchased(0), NOW);
    expect(entries[1].props.weeksReady).toBe(WEEKS_BANK_CAP);
  });

  it('leaves purchased weeks out of the cap, on top of the forecast', () => {
    // The daily refresh never touches the purchased pool, so it rides above the cap intact.
    const entries = widgetTimeline(newGame('Acme', 1), budget(WEEKS_BANK_CAP), purchased(6), NOW);
    expect(entries[0].props.weeksReady).toBe(WEEKS_BANK_CAP + 6);
    expect(entries[1].props.weeksReady).toBe(WEEKS_BANK_CAP + 6);
  });

  it('still forecasts with no run, so an idle tile stays truthful', () => {
    const entries = widgetTimeline(null, budget(1), purchased(0), NOW);
    expect(entries[0].props.status).toBe('none');
    expect(entries[1].props.weeksReady).toBe(1 + WEEKS_PER_DAY);
  });

  it('survives pools that have not loaded yet', () => {
    const entries = widgetTimeline(newGame('Acme', 1), null, null, NOW);
    expect(entries[0].props.weeksReady).toBe(0);
    expect(entries[1].props.weeksReady).toBe(0);
  });
});
