/**
 * Leaderboard publishing — the impure twin of `leaderboard-sync.ts`. Owns the
 * persisted opt-in preferences, the upload queue's network loop, the HQ rank
 * lookup, and the one shared join sheet's open/closed state.
 *
 * Nothing here ever blocks play: every request is fire-and-forget, failures
 * leave the snapshot queued for the next week, the next foreground, or a
 * one-minute retry, and a website that doesn't serve a route yet just means
 * the rank stays hidden.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { accountAvailable, sessionToken } from '@/account';
import { EVENTS, track } from '@/analytics/events';
import { deleteRun, fetchBoardRank, putRun, type BoardRank } from '@/lib/leaderboard-api';
import { useGame } from '@/state/game-store';
import {
  boardStakeFor,
  enqueueSnapshot,
  initialLeaderboardPrefs,
  nextRevision,
  normalizePrefs,
  optedIn,
  optedOut,
  recordDelete,
  recordPromptShown,
  recordSend,
  shouldPromptOptIn,
  snapshotFor,
  type LeaderboardPrefs,
  type RunSnapshot,
} from '@/state/leaderboard-sync';

export const LEADERBOARD_STORAGE_KEY = 'startup-tycoon/leaderboard/v1';

/** Batch a burst of state changes (a tick lands several) into one upload. */
const UPLOAD_DEBOUNCE_MS = 1_500;
const RETRY_MS = 60_000;
const RANK_DEBOUNCE_MS = 800;

export type JoinSource = 'week5' | 'hq' | 'settings' | 'board';

interface LeaderboardContextValue {
  /** Null until loaded. */
  prefs: LeaderboardPrefs | null;
  /** Whether joining is possible on this build at all (iOS custom builds with Sign in with Apple). */
  canJoin: boolean;
  /** Where the current run stands (or would stand) on the public board; null when unknown. */
  rank: BoardRank | null;
  /**
   * Actually publishing: opted in *and* signed in. Opt-in without a session
   * (after a sign-out) uploads nothing, so the UI must not claim it does.
   */
  joined: boolean;
  /** True when the automatic week-5 ask is due. The game chrome decides the moment. */
  promptDue: boolean;
  /** The join sheet's trigger, or null while it's closed. */
  joinSource: JoinSource | null;
  openJoin: (source: JoinSource) => void;
  /** Closes the sheet without joining. */
  dismissJoin: (reason: 'dismissed' | 'cancelled' | 'error') => void;
  /** Sign in if needed, then opt in and publish the current run. */
  join: () => Promise<'joined' | 'cancelled' | 'error'>;
  /** Stop publishing and unpublish everything this device put up. */
  leave: () => void;
  /** Whether the player closed the HQ rank card for the current run. */
  rankCardDismissed: boolean;
  /** Hide the HQ rank card until the next run. */
  dismissRankCard: () => void;
}

const LeaderboardContext = createContext<LeaderboardContextValue | null>(null);

export function LeaderboardProvider({ children }: { children: ReactNode }) {
  const { state, loading, account, signInWithApple } = useGame();
  const [prefs, setPrefsState] = useState<LeaderboardPrefs | null>(null);
  // Synchronous mirror so the async upload loop always reads (and writes over)
  // the latest prefs rather than the render it started in.
  const prefsRef = useRef<LeaderboardPrefs | null>(null);
  // What last reached the server per run, in memory only — keeps an unchanged
  // state (a hire that didn't move the stake) from re-queueing an upload.
  const lastSentRef = useRef<Record<string, RunSnapshot>>({});
  const flushingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tagged with the run it was fetched for, so a new run never shows the last one's rank.
  const [rankFor, setRankFor] = useState<{ runId: string | null; rank: BoardRank } | null>(null);
  const [rankNonce, setRankNonce] = useState(0);
  const [joinSource, setJoinSource] = useState<JoinSource | null>(null);

  const applyPrefs = useCallback((updater: (prev: LeaderboardPrefs) => LeaderboardPrefs) => {
    const prev = prefsRef.current ?? initialLeaderboardPrefs();
    const next = updater(prev);
    if (next === prev) return;
    prefsRef.current = next;
    setPrefsState(next);
    AsyncStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(next)).catch((err) =>
      console.warn('[leaderboard] failed to save prefs', err),
    );
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(LEADERBOARD_STORAGE_KEY)
      .then((raw) => normalizePrefs(raw ? JSON.parse(raw) : null))
      .catch(() => initialLeaderboardPrefs())
      .then((loaded) => {
        prefsRef.current = loaded;
        setPrefsState(loaded);
      });
  }, []);

  // `flush` and `scheduleFlush` call each other; the ref breaks the cycle so
  // both keep stable identities.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const scheduleFlush = useCallback((delay: number) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushRef.current().catch((err) => console.warn('[leaderboard] flush failed', err));
    }, delay);
  }, []);

  /** Push every queued snapshot and pending unpublish. One pass at a time. */
  const flush = useCallback(async () => {
    if (flushingRef.current || !accountAvailable) return;
    const current = prefsRef.current;
    if (!current || (Object.keys(current.unsent).length === 0 && current.pendingDeletes.length === 0)) return;
    const token = await sessionToken();
    if (!token) return;

    flushingRef.current = true;
    let retryLater = false;
    try {
      for (const runId of [...(prefsRef.current?.pendingDeletes ?? [])]) {
        const result = await deleteRun(token, runId);
        if (result === 'ok' || result === 'conflict') applyPrefs((p) => recordDelete(p, runId));
        else if (result === 'retry') retryLater = true;
        else return; // unauthorized — nothing more will land with this token
      }

      if (prefsRef.current?.optIn !== 'in') return;
      for (const [runId, snapshot] of Object.entries(prefsRef.current.unsent)) {
        const revision = nextRevision(prefsRef.current ?? initialLeaderboardPrefs(), runId);
        const { result, status } = await putRun(token, runId, { ...snapshot, revision });
        if (result !== 'ok') track(EVENTS.LEADERBOARD_PUBLISH_FAILED, { status, result });
        if (result === 'retry') {
          retryLater = true;
          continue;
        }
        if (result === 'unauthorized') {
          // The session is gone (account deleted elsewhere, token revoked).
          // Back to undecided, so joining again re-runs sign-in.
          applyPrefs((p) => ({ ...p, optIn: 'unset', unsent: {} }));
          return;
        }
        const firstPublish = result === 'ok' && !prefsRef.current?.published.includes(runId);
        applyPrefs((p) => recordSend(p, runId, snapshot, revision, result));
        if (result === 'ok') {
          lastSentRef.current[runId] = snapshot;
          if (firstPublish)
            track(EVENTS.LEADERBOARD_RUN_PUBLISHED, {
              outcome: snapshot.outcome,
              week: snapshot.week,
            });
          setRankNonce((n) => n + 1);
        }
      }
    } finally {
      flushingRef.current = false;
      if (retryLater) scheduleFlush(RETRY_MS);
      // Anything queued while this pass was running goes out next.
      else if (Object.keys(prefsRef.current?.unsent ?? {}).length > 0 && prefsRef.current?.optIn === 'in') {
        scheduleFlush(UPLOAD_DEBOUNCE_MS);
      }
    }
  }, [applyPrefs, scheduleFlush]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    },
    [],
  );

  // Queue the current run whenever what the board would show changes.
  const optIn = prefs?.optIn ?? null;
  const signedIn = account.status === 'signed-in';
  const joined = optIn === 'in' && signedIn;
  useEffect(() => {
    if (loading || !joined || !state?.runId) return;
    const snapshot = snapshotFor(state);
    if (!snapshot) return;
    const runId = state.runId;
    applyPrefs((p) => enqueueSnapshot(p, runId, snapshot, lastSentRef.current[runId]));
    // A run just ending goes out right away — the player may start a new one next.
    scheduleFlush(state.gameOver ? 0 : UPLOAD_DEBOUNCE_MS);
  }, [state, loading, joined, applyPrefs, scheduleFlush]);

  // Publishing is tied to the account that consented. Signing out (or deleting
  // the account, which also removes its rows server-side) ends it: a later
  // sign-in — possibly a brand-new account — has to consent again. `published`
  // is kept so opting out after signing back in still unpublishes old runs.
  const wasSignedInRef = useRef(false);
  useEffect(() => {
    if (wasSignedInRef.current && !signedIn) {
      applyPrefs((p) => (p.optIn === 'in' ? { ...p, optIn: 'unset', unsent: {} } : p));
      lastSentRef.current = {};
    }
    wasSignedInRef.current = signedIn;
  }, [signedIn, applyPrefs]);

  // Retry whatever's still queued on launch (once prefs load) and on every return to the foreground.
  const prefsLoaded = prefs !== null;
  useEffect(() => {
    if (!prefsLoaded) return;
    scheduleFlush(0);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        scheduleFlush(0);
        setRankNonce((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, [prefsLoaded, scheduleFlush]);

  // Rank lookup for the HQ card — for everyone, opted in or not. Nothing is uploaded.
  const runId = state?.runId ?? null;
  const stake = state ? boardStakeFor(state) : null;
  useEffect(() => {
    if (loading || stake === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // The run id only goes along once the player has joined — before that it
      // could only ever be off the board, and it stays off the website's logs.
      fetchBoardRank(stake, joined ? runId : null, controller.signal)
        .then((next) => setRankFor({ runId, rank: next }))
        // Keep the last good rank through a blip; a stale #7 beats a flicker.
        .catch(() => {});
    }, RANK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loading, stake, runId, joined, rankNonce]);
  const rank = state && rankFor && rankFor.runId === runId ? rankFor.rank : null;

  const openJoin = useCallback(
    (source: JoinSource) => {
      if (!accountAvailable) return;
      // Any showing counts as this run's ask, whoever opened it — otherwise the
      // automatic week-5 ask re-presents the same sheet a beat after the player
      // closed one they opened themselves.
      if (state?.runId) {
        const id = state.runId;
        const week = state.week;
        applyPrefs((p) => recordPromptShown(p, id, week));
      }
      track(EVENTS.LEADERBOARD_OPTIN_PROMPT_SHOWN, {
        source,
        rank: rank?.rank ?? null,
      });
      setJoinSource(source);
    },
    [applyPrefs, state, rank],
  );

  const dismissJoin = useCallback(
    (reason: 'dismissed' | 'cancelled' | 'error') => {
      if (joinSource)
        track(EVENTS.LEADERBOARD_OPTIN_DECLINED, {
          source: joinSource,
          reason,
        });
      setJoinSource(null);
    },
    [joinSource],
  );

  const join = useCallback(async (): Promise<'joined' | 'cancelled' | 'error'> => {
    if (!accountAvailable) return 'error';
    if (account.status !== 'signed-in') {
      const outcome = await signInWithApple();
      if (outcome !== 'signed-in') return outcome;
    }
    applyPrefs(optedIn);
    if (state?.runId) {
      const snapshot = snapshotFor(state);
      const id = state.runId;
      if (snapshot) applyPrefs((p) => enqueueSnapshot(p, id, snapshot));
    }
    track(EVENTS.LEADERBOARD_OPTIN_ACCEPTED, {
      source: joinSource ?? 'unknown',
      $set: { leaderboard_opt_in: true },
    });
    setJoinSource(null);
    scheduleFlush(0);
    return 'joined';
  }, [account.status, signInWithApple, applyPrefs, state, joinSource, scheduleFlush]);

  const leave = useCallback(() => {
    applyPrefs(optedOut);
    lastSentRef.current = {};
    track(EVENTS.LEADERBOARD_OPTOUT, { $set: { leaderboard_opt_in: false } });
    scheduleFlush(0);
    setRankNonce((n) => n + 1);
  }, [applyPrefs, scheduleFlush]);

  const dismissRankCard = useCallback(() => {
    if (!state?.runId) return;
    const id = state.runId;
    track(EVENTS.LEADERBOARD_TEASER_DISMISSED, { opted_in: joined, rank: rank?.rank ?? null });
    applyPrefs((p) => ({ ...p, rankCardDismissedFor: id }));
  }, [applyPrefs, state, joined, rank]);

  const value: LeaderboardContextValue = {
    prefs,
    canJoin: accountAvailable,
    rank,
    joined,
    // `!loading`: the save hydrates well before the launch pipeline settles, and
    // the daily standup card lands after it — asking any earlier would put the
    // sheet up just in time for that card to present on top of it.
    promptDue: accountAvailable && !loading && prefs !== null && shouldPromptOptIn(prefs, state),
    joinSource,
    openJoin,
    dismissJoin,
    join,
    leave,
    rankCardDismissed: !!state?.runId && prefs?.rankCardDismissedFor === state.runId,
    dismissRankCard,
  };

  return <LeaderboardContext.Provider value={value}>{children}</LeaderboardContext.Provider>;
}

export function useLeaderboard(): LeaderboardContextValue {
  const ctx = useContext(LeaderboardContext);
  if (!ctx) throw new Error('useLeaderboard must be used within a LeaderboardProvider');
  return ctx;
}
