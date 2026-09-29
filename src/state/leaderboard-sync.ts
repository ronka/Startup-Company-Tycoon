/**
 * The pure half of leaderboard publishing: what a run looks like on the wire,
 * the persisted opt-in preferences and upload queue, and when to ask. Its
 * impure twin is `leaderboard-provider.tsx`, which owns AsyncStorage, the
 * network, and analytics.
 *
 * Only display-safe fields ever leave the device: company name, week, stage,
 * outcome, and the money figures. No CEO name, no Apple ID, no email.
 */

import type { BoardOutcome, RunUpload } from '@/lib/leaderboard-api';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import type { GameOverReason, GameState } from '@/game/types';

/** Week the opt-in ask first appears — late enough that the player is invested. */
export const OPT_IN_PROMPT_WEEK = 5;
/** The ask is shown at most this many times; after that only HQ and Settings offer it. */
export const MAX_OPT_IN_PROMPTS = 2;
/** Weeks to wait before the second ask, when it lands on the same run as the first. */
export const OPT_IN_REPROMPT_GAP_WEEKS = 10;
/** Local memory of which runs were published, so opting out can unpublish them. */
export const MAX_TRACKED_RUNS = 50;

/** The server's name limit and forbidden characters (`parseRunInput` on the website). */
const NAME_MAX = 48;
const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f<>]/g;

export type OptIn = 'unset' | 'in' | 'out';

/** A run's upload minus the revision, which is assigned only at send time. */
export type RunSnapshot = Omit<RunUpload, 'revision'>;

export interface LeaderboardPrefs {
  optIn: OptIn;
  /** How many times the automatic ask has been shown, across all runs. */
  promptsShown: number;
  /** The run and week the last ask was shown on; null if never. */
  lastPrompt: { runId: string; week: number } | null;
  /** Latest snapshot per run still waiting to reach the server. */
  unsent: Record<string, RunSnapshot>;
  /** Last revision sent per run (the server requires strictly increasing ones). */
  revisions: Record<string, number>;
  /** Runs the server accepted, newest last — what opting out unpublishes. */
  published: string[];
  /** Runs still to unpublish after an opt-out that didn't fully reach the server. */
  pendingDeletes: string[];
  /** The run whose HQ rank card the player closed; it stays hidden for that run only. */
  rankCardDismissedFor: string | null;
}

export function initialLeaderboardPrefs(): LeaderboardPrefs {
  return {
    optIn: 'unset',
    promptsShown: 0,
    lastPrompt: null,
    unsent: {},
    revisions: {},
    published: [],
    pendingDeletes: [],
    rankCardDismissedFor: null,
  };
}

/** Tolerant load: any missing or malformed field falls back to its default. */
export function normalizePrefs(raw: unknown): LeaderboardPrefs {
  const base = initialLeaderboardPrefs();
  if (raw == null || typeof raw !== 'object') return base;
  const r = raw as Partial<LeaderboardPrefs>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    optIn: r.optIn === 'in' || r.optIn === 'out' ? r.optIn : 'unset',
    promptsShown: typeof r.promptsShown === 'number' ? r.promptsShown : 0,
    lastPrompt:
      r.lastPrompt && typeof r.lastPrompt.runId === 'string' && typeof r.lastPrompt.week === 'number'
        ? { runId: r.lastPrompt.runId, week: r.lastPrompt.week }
        : null,
    unsent: r.unsent && typeof r.unsent === 'object' ? r.unsent : {},
    revisions: r.revisions && typeof r.revisions === 'object' ? r.revisions : {},
    published: strings(r.published),
    pendingDeletes: strings(r.pendingDeletes),
    rankCardDismissedFor: typeof r.rankCardDismissedFor === 'string' ? r.rankCardDismissedFor : null,
  };
}

const OUTCOME_FOR: Record<GameOverReason, BoardOutcome> = {
  bankruptcy: 'bankrupt',
  acquired: 'acquired',
  ipo: 'ipo',
};

export function publicCompanyName(name: string): string {
  return name.replace(FORBIDDEN_NAME_CHARS, '').trim().slice(0, NAME_MAX).trim();
}

/**
 * The founder stake the board ranks this run by: equity × valuation while
 * running, the final score once it's over (0 for bankruptcy).
 */
export function boardStakeFor(state: GameState): number {
  if (state.gameOver) return Math.max(0, Math.round(state.finalScore ?? 0));
  return Math.max(0, Math.round(deriveWeeklyStats(state).stake));
}

/**
 * The run as the board should show it, or `null` when it can't be published
 * (week 0, or a name that sanitizes to nothing). While running, the server
 * checks `round(valuation × equity)` against the stake to ±1, so equity is
 * rounded to its 4-decimal column first and the stake derived from that.
 */
export function snapshotFor(state: GameState): RunSnapshot | null {
  const companyName = publicCompanyName(state.companyName);
  if (!companyName || state.week < 1) return null;
  const week = Math.min(state.week, 520);

  if (state.gameOver) {
    const outcome = OUTCOME_FOR[state.gameOver];
    return {
      companyName,
      week,
      stage: state.stage,
      outcome,
      founderStake: outcome === 'bankrupt' ? 0 : boardStakeFor(state),
      valuation: null,
      founderEquity: null,
      publish: true,
    };
  }

  const valuation = Math.max(0, Math.round(deriveWeeklyStats(state).valuation));
  const founderEquity = Math.round(Math.min(1, Math.max(0, state.founderEquity)) * 10_000) / 10_000;
  return {
    companyName,
    week,
    stage: state.stage,
    outcome: 'running',
    founderStake: Math.round(valuation * founderEquity),
    valuation,
    founderEquity,
    publish: true,
  };
}

function sameSnapshot(a: RunSnapshot | undefined, b: RunSnapshot): boolean {
  return (
    a !== undefined &&
    a.companyName === b.companyName &&
    a.week === b.week &&
    a.stage === b.stage &&
    a.outcome === b.outcome &&
    a.founderStake === b.founderStake &&
    a.valuation === b.valuation &&
    a.founderEquity === b.founderEquity
  );
}

/**
 * Queue the run's latest snapshot, replacing any older unsent one for the same
 * run. Returns `prefs` unchanged (same object) when there's nothing new, so
 * callers can skip a write.
 */
export function enqueueSnapshot(
  prefs: LeaderboardPrefs,
  runId: string,
  snapshot: RunSnapshot,
  lastSent?: RunSnapshot,
): LeaderboardPrefs {
  const queued = prefs.unsent[runId];
  if (sameSnapshot(queued, snapshot)) return prefs;
  if (!queued && sameSnapshot(lastSent, snapshot)) return prefs;
  return { ...prefs, unsent: { ...prefs.unsent, [runId]: snapshot } };
}

/** The next revision for a run: one past the last one sent. */
export function nextRevision(prefs: LeaderboardPrefs, runId: string): number {
  return (prefs.revisions[runId] ?? 0) + 1;
}

/**
 * Record a send's outcome. `ok` and `conflict` both drop the snapshot from the
 * queue (a conflict means the server already holds something newer, so this
 * one can never land); `ok` also remembers the run for a later opt-out.
 * `snapshot` is what was sent — if a newer one was queued meanwhile, it stays.
 */
export function recordSend(
  prefs: LeaderboardPrefs,
  runId: string,
  snapshot: RunSnapshot,
  revision: number,
  result: 'ok' | 'conflict',
): LeaderboardPrefs {
  const unsent = { ...prefs.unsent };
  if (sameSnapshot(unsent[runId], snapshot)) delete unsent[runId];
  const revisions = {
    ...prefs.revisions,
    [runId]: Math.max(revision, prefs.revisions[runId] ?? 0),
  };
  let published = prefs.published;
  if (result === 'ok' && !published.includes(runId)) {
    published = [...published, runId].slice(-MAX_TRACKED_RUNS);
  }
  // Keep revisions only for runs we still know about, so the map can't grow forever.
  const keep = new Set([...published, ...Object.keys(unsent), runId]);
  for (const id of Object.keys(revisions)) if (!keep.has(id)) delete revisions[id];
  return { ...prefs, unsent, revisions, published };
}

/** Opting in. Queued uploads start from the current run only — nothing older is backfilled. */
export function optedIn(prefs: LeaderboardPrefs): LeaderboardPrefs {
  return { ...prefs, optIn: 'in' };
}

/** Opting out: stop uploading and schedule every published run for removal. */
export function optedOut(prefs: LeaderboardPrefs): LeaderboardPrefs {
  const pendingDeletes = Array.from(new Set([...prefs.pendingDeletes, ...prefs.published]));
  return { ...prefs, optIn: 'out', unsent: {}, published: [], pendingDeletes };
}

export function recordDelete(prefs: LeaderboardPrefs, runId: string): LeaderboardPrefs {
  return {
    ...prefs,
    pendingDeletes: prefs.pendingDeletes.filter((id) => id !== runId),
  };
}

/**
 * Whether the automatic opt-in ask is due right now: an undecided player, a
 * live run at week 5 or later, and asks left. The second ask waits
 * `OPT_IN_REPROMPT_GAP_WEEKS` on the same run, or comes at week 5 of the next.
 */
export function shouldPromptOptIn(prefs: LeaderboardPrefs, state: GameState | null): boolean {
  if (!state || state.gameOver || state.pendingEvent || !state.runId) return false;
  if (prefs.optIn !== 'unset' || prefs.promptsShown >= MAX_OPT_IN_PROMPTS) return false;
  if (state.week < OPT_IN_PROMPT_WEEK) return false;
  const last = prefs.lastPrompt;
  if (last === null || last.runId !== state.runId) return true;
  return state.week >= last.week + OPT_IN_REPROMPT_GAP_WEEKS;
}

export function recordPromptShown(prefs: LeaderboardPrefs, runId: string, week: number): LeaderboardPrefs {
  return {
    ...prefs,
    promptsShown: prefs.promptsShown + 1,
    lastPrompt: { runId, week },
  };
}
