/**
 * Thin React store wrapping the pure engine. The UI dispatches GameActions;
 * this delegates to the engine reducer and autosaves the serialized GameState
 * to AsyncStorage after every change. It holds no game logic of its own.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from 'react';

import { newGame, reduce, tickMany } from '@/game/engine';
import { standupCardForStreak } from '@/game/events/standup';
import type { GameAction, GameState } from '@/game/types';
import { initialStreak, updateStreak, type StreakState } from '@/state/daily-streak';
import {
  canSpendWeek,
  dateKey,
  initialWeekBudget,
  refreshWeekBudget,
  spendWeek,
  spendWeeks,
  type WeekBudget,
} from '@/state/week-budget';

export const STORAGE_KEY = 'startup-tycoon/save/v1';
export const WEEK_BUDGET_STORAGE_KEY = 'startup-tycoon/week-budget/v1';
export const STREAK_STORAGE_KEY = 'startup-tycoon/streak/v1';

type StoreAction =
  | GameAction
  | { type: 'HYDRATE'; state: GameState | null }
  | { type: 'SET_STATE'; state: GameState };

/** Exported for testing the store-layer dispatch path without rendering a `GameProvider`. */
export function storeReducer(state: GameState | null, action: StoreAction): GameState | null {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;
    case 'SET_STATE':
      return action.state;
    case 'NEW_GAME':
      return newGame(action.seed);
    default:
      return state === null ? state : reduce(state, action);
  }
}

interface GameContextValue {
  /** Current run, or null when no game exists (fresh install / clean slate). */
  state: GameState | null;
  /**
   * State as it was immediately before the most recent TICK, for "vs last
   * week" deltas and animations. Null until a tick has happened this
   * session; unaffected by non-tick actions (hiring, answering events, ...)
   * so the UI's delta baseline only shifts on an actual week advancing.
   * UI-only — never touches the pure engine's GameState shape.
   */
  previousState: GameState | null;
  /** True until the initial AsyncStorage load resolves. */
  loading: boolean;
  dispatch: (action: GameAction) => void;
  /**
   * Advance up to `weeks` at once, stopping early per `tickMany`'s rules
   * (game over, a decision card, or a notable week). A no-op while a
   * decision is already pending or the run has ended — same gating as TICK.
   */
  fastForward: (weeks: number) => void;
  startNewGame: (seed?: number) => void;
  /** Wipe the autosave and clear in-memory state. */
  clearSave: () => void;
  /**
   * The daily week budget (PRD F12): null until the initial load resolves.
   * `TICK`/`fastForward` are rejected once `weeksRemaining` hits 0, unless
   * `devFreePlay` is on. Everything else (hiring, raising, answering a
   * decision, browsing tabs) stays fully usable at zero.
   */
  weekBudget: WeekBudget | null;
  /** Dev-only escape hatch so playtesting is never rate-limited. Not persisted. */
  devFreePlay: boolean;
  setDevFreePlay: (freePlay: boolean) => void;
  /** Daily-play streak (PRD F12); null until the initial load resolves. */
  streak: StreakState | null;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, null);
  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekBudget, setWeekBudget] = useState<WeekBudget | null>(null);
  const [devFreePlay, setDevFreePlay] = useState(false);
  // Null (not `initialStreak`) until the load resolves: null also doubles as
  // "no streak was ever saved", which the standup-injection effect below
  // treats as this player's very first session, distinct from "already
  // credited today".
  const [streak, setStreak] = useState<StreakState | null>(null);

  // Load the autosave (and the daily week budget + streak, refreshed against
  // "now") once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          dispatch({ type: 'HYDRATE', state: JSON.parse(raw) as GameState });
        }
      } catch (err) {
        console.warn('[game-store] failed to load save', err);
      }
      try {
        const raw = await AsyncStorage.getItem(WEEK_BUDGET_STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as WeekBudget) : null;
        const refreshed = refreshWeekBudget(saved ?? initialWeekBudget(new Date()), new Date());
        if (!cancelled) setWeekBudget(refreshed);
      } catch (err) {
        console.warn('[game-store] failed to load week budget', err);
        if (!cancelled) setWeekBudget(initialWeekBudget(new Date()));
      }
      try {
        const raw = await AsyncStorage.getItem(STREAK_STORAGE_KEY);
        if (!cancelled && raw) setStreak(JSON.parse(raw) as StreakState);
      } catch (err) {
        console.warn('[game-store] failed to load streak', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave after every change (once the initial load has settled).
  useEffect(() => {
    if (loading) return;
    if (state === null) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((err) =>
      console.warn('[game-store] failed to save', err),
    );
  }, [state, loading]);

  // Persist the week budget alongside the save whenever it changes.
  useEffect(() => {
    if (loading || weekBudget === null) return;
    AsyncStorage.setItem(WEEK_BUDGET_STORAGE_KEY, JSON.stringify(weekBudget)).catch((err) =>
      console.warn('[game-store] failed to save week budget', err),
    );
  }, [weekBudget, loading]);

  // Persist the streak whenever it changes.
  useEffect(() => {
    if (loading || streak === null) return;
    AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(streak)).catch((err) =>
      console.warn('[game-store] failed to save streak', err),
    );
  }, [streak, loading]);

  // Morning Standup injection (Task 15): the first time this local day sees
  // a live, uninterrupted run (a game exists, isn't over, and has no other
  // decision card already pending — never clobber a real one), credit the
  // streak and drop the day's Standup card straight into `pendingEvent`,
  // reusing the exact same DecisionModal/ANSWER_EVENT path as any drawn
  // card. Runs on every state change, but the date-key guard makes it a
  // true no-op the rest of the day.
  useEffect(() => {
    if (loading || !state || state.gameOver || state.pendingEvent) return;
    const today = dateKey(new Date());
    if (streak !== null && streak.lastPlayedDate === today) return;
    const updatedStreak = streak === null ? initialStreak(new Date()) : updateStreak(streak, new Date());
    setStreak(updatedStreak);
    dispatch({ type: 'SET_STATE', state: { ...state, pendingEvent: standupCardForStreak(updatedStreak.streakDays) } });
  }, [loading, state, streak]);

  const dispatchWithSnapshot = (action: GameAction) => {
    if (action.type === 'TICK') {
      // Mirrors tick()'s own frozen conditions so the delta baseline only
      // shifts when a tick will actually advance the week.
      if (!state || state.gameOver || state.pendingEvent) return;
      // Store-layer-only rate limit (PRD F12) — the engine never sees this.
      if (!devFreePlay && weekBudget && !canSpendWeek(weekBudget)) return;
      setPreviousState(state);
      if (!devFreePlay && weekBudget) setWeekBudget(spendWeek(weekBudget));
      dispatch(action);
      return;
    }
    dispatch(action);
  };

  const fastForward = (weeks: number) => {
    if (!state || state.gameOver || state.pendingEvent) return;
    const allowance =
      !devFreePlay && weekBudget ? Math.min(weeks, weekBudget.weeksRemaining) : weeks;
    if (allowance <= 0) return;
    const result = tickMany(state, allowance);
    const consumed = result.week - state.week;
    setPreviousState(state);
    if (!devFreePlay && weekBudget) setWeekBudget(spendWeeks(weekBudget, consumed));
    dispatch({ type: 'SET_STATE', state: result });
  };

  const value: GameContextValue = {
    state,
    previousState,
    loading,
    dispatch: dispatchWithSnapshot,
    fastForward,
    startNewGame: (seed?: number) => {
      setPreviousState(null);
      dispatch({ type: 'NEW_GAME', seed });
    },
    clearSave: () => {
      setPreviousState(null);
      dispatch({ type: 'HYDRATE', state: null });
    },
    weekBudget,
    devFreePlay,
    setDevFreePlay,
    streak,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
