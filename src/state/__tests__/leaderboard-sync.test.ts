import { describe, expect, it } from 'vitest';

import { newGame, reduce } from '@/game/engine';
import type { GameState } from '@/game/types';
import { isRunId, newRunId } from '@/lib/run-id';

import {
  MAX_OPT_IN_PROMPTS,
  OPT_IN_PROMPT_WEEK,
  OPT_IN_REPROMPT_GAP_WEEKS,
  enqueueSnapshot,
  initialLeaderboardPrefs,
  nextRevision,
  normalizePrefs,
  optedIn,
  optedOut,
  publicCompanyName,
  recordDelete,
  recordPromptShown,
  recordSend,
  shouldPromptOptIn,
  snapshotFor,
} from '../leaderboard-sync';

const RUN = '0b7f5c1e-3a2d-4c1b-9e8f-1a2b3c4d5e6f';

function runAt(week: number, overrides: Partial<GameState> = {}): GameState {
  return { ...newGame('Acme Rockets', 42), runId: RUN, week, ...overrides };
}

describe('newRunId', () => {
  it('makes distinct v4 UUIDs the server accepts', () => {
    const a = newRunId();
    expect(isRunId(a)).toBe(true);
    expect(a).not.toBe(newRunId());
  });
});

describe('snapshotFor', () => {
  it('skips week 0 and unusable names', () => {
    expect(snapshotFor(runAt(0))).toBeNull();
    expect(snapshotFor(runAt(3, { companyName: '<<>>' }))).toBeNull();
  });

  it('sends a running stake that matches valuation × 4-decimal equity to the dollar', () => {
    const snap = snapshotFor(runAt(3, { founderEquity: 0.873456 }))!;
    expect(snap.outcome).toBe('running');
    expect(snap.founderEquity).toBe(0.8735);
    expect(Math.abs(Math.round(snap.valuation! * snap.founderEquity!) - snap.founderStake)).toBeLessThanOrEqual(1);
  });

  it("maps endings to the server's outcome names and zeroes bankruptcy", () => {
    const bankrupt = snapshotFor(runAt(9, { gameOver: 'bankruptcy', finalScore: 0 }))!;
    expect(bankrupt).toMatchObject({ outcome: 'bankrupt', founderStake: 0, valuation: null, founderEquity: null });
    const ipo = snapshotFor(runAt(90, { gameOver: 'ipo', finalScore: 12_345_678.6 }))!;
    expect(ipo).toMatchObject({ outcome: 'ipo', founderStake: 12_345_679 });
    expect(snapshotFor(runAt(40, { gameOver: 'acquired', finalScore: 5 }))!.outcome).toBe('acquired');
  });

  it('only ever carries display-safe keys', () => {
    expect(Object.keys(snapshotFor(runAt(3))!).sort()).toEqual(
      ['companyName', 'founderEquity', 'founderStake', 'outcome', 'publish', 'stage', 'valuation', 'week'].sort(),
    );
  });
});

describe('publicCompanyName', () => {
  it('strips characters the server rejects and caps the length', () => {
    expect(publicCompanyName('  <b>Hi</b>\n ')).toBe('bHi/b');
    expect(publicCompanyName('x'.repeat(60))).toHaveLength(48);
  });
});

describe('upload queue', () => {
  const snap = snapshotFor(runAt(3))!;

  it('queues a new snapshot and ignores a repeat of the queued or last-sent one', () => {
    const queued = enqueueSnapshot(initialLeaderboardPrefs(), RUN, snap);
    expect(queued.unsent[RUN]).toEqual(snap);
    expect(enqueueSnapshot(queued, RUN, { ...snap })).toBe(queued);
    const empty = initialLeaderboardPrefs();
    expect(enqueueSnapshot(empty, RUN, snap, snap)).toBe(empty);
  });

  it('latest snapshot wins per run', () => {
    const later = { ...snap, week: 4 };
    const prefs = enqueueSnapshot(enqueueSnapshot(initialLeaderboardPrefs(), RUN, snap), RUN, later);
    expect(prefs.unsent[RUN]).toEqual(later);
  });

  it('increments revisions and clears only the snapshot that was sent', () => {
    let prefs = enqueueSnapshot(initialLeaderboardPrefs(), RUN, snap);
    const rev = nextRevision(prefs, RUN);
    expect(rev).toBe(1);
    // A newer snapshot queued while the first was in flight survives its ack.
    prefs = enqueueSnapshot(prefs, RUN, { ...snap, week: 4 });
    prefs = recordSend(prefs, RUN, snap, rev, 'ok');
    expect(prefs.unsent[RUN]?.week).toBe(4);
    expect(prefs.published).toEqual([RUN]);
    expect(nextRevision(prefs, RUN)).toBe(2);
  });

  it('drops a conflicting snapshot without marking the run published', () => {
    const prefs = recordSend(enqueueSnapshot(initialLeaderboardPrefs(), RUN, snap), RUN, snap, 1, 'conflict');
    expect(prefs.unsent).toEqual({});
    expect(prefs.published).toEqual([]);
  });
});

describe('opt out', () => {
  it('stops uploads and schedules every published run for removal', () => {
    let prefs = optedIn(initialLeaderboardPrefs());
    prefs = recordSend(enqueueSnapshot(prefs, RUN, snapshotFor(runAt(3))!), RUN, snapshotFor(runAt(3))!, 1, 'ok');
    prefs = enqueueSnapshot(prefs, RUN, snapshotFor(runAt(4))!);
    prefs = optedOut(prefs);
    expect(prefs.optIn).toBe('out');
    expect(prefs.unsent).toEqual({});
    expect(prefs.pendingDeletes).toEqual([RUN]);
    expect(recordDelete(prefs, RUN).pendingDeletes).toEqual([]);
  });
});

describe('shouldPromptOptIn', () => {
  const fresh = initialLeaderboardPrefs();

  it(`waits for week ${OPT_IN_PROMPT_WEEK} of a live, undecided run`, () => {
    expect(shouldPromptOptIn(fresh, runAt(OPT_IN_PROMPT_WEEK - 1))).toBe(false);
    expect(shouldPromptOptIn(fresh, runAt(OPT_IN_PROMPT_WEEK))).toBe(true);
    expect(shouldPromptOptIn(fresh, runAt(8, { gameOver: 'bankruptcy' }))).toBe(false);
    expect(shouldPromptOptIn({ ...fresh, optIn: 'in' }, runAt(8))).toBe(false);
    expect(shouldPromptOptIn({ ...fresh, optIn: 'out' }, runAt(8))).toBe(false);
  });

  it('asks again only after the gap on the same run, or on the next run', () => {
    const once = recordPromptShown(fresh, RUN, 5);
    expect(shouldPromptOptIn(once, runAt(5 + OPT_IN_REPROMPT_GAP_WEEKS - 1))).toBe(false);
    expect(shouldPromptOptIn(once, runAt(5 + OPT_IN_REPROMPT_GAP_WEEKS))).toBe(true);
    expect(shouldPromptOptIn(once, { ...runAt(5), runId: newRunId() })).toBe(true);
  });

  it(`stops after ${MAX_OPT_IN_PROMPTS} asks`, () => {
    const done = recordPromptShown(recordPromptShown(fresh, RUN, 5), RUN, 20);
    expect(shouldPromptOptIn(done, { ...runAt(50), runId: newRunId() })).toBe(false);
  });
});

describe('normalizePrefs', () => {
  it('tolerates garbage and partial records', () => {
    expect(normalizePrefs(null)).toEqual(initialLeaderboardPrefs());
    expect(normalizePrefs({ optIn: 'in', published: [RUN, 7] })).toMatchObject({ optIn: 'in', published: [RUN] });
    expect(normalizePrefs({ rankCardDismissedFor: RUN }).rankCardDismissedFor).toBe(RUN);
    expect(normalizePrefs({ rankCardDismissedFor: 3 }).rankCardDismissedFor).toBeNull();
  });
});

describe('revive', () => {
  it('keeps the run id across a revive', () => {
    const dead = runAt(9, { gameOver: 'bankruptcy', finalScore: 0 });
    expect(reduce(dead, { type: 'REVIVE', reason: 'x' }).runId).toBe(RUN);
  });
});
