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

import { newGame, reduce } from '@/game/engine';
import { standupCardForStreak } from '@/game/events/standup';
import type { GameAction, GameState } from '@/game/types';
import { initialStreak, updateStreak, type StreakState } from '@/state/daily-streak';
import {
  canSpendWeek,
  dateKey,
  initialWeekBudget,
  refreshWeekBudget,
  spendWeek,
  type WeekBudget,
} from '@/state/week-budget';

export const STORAGE_KEY = 'startup-tycoon/save/v3';
export const WEEK_BUDGET_STORAGE_KEY = 'startup-tycoon/week-budget/v1';
export const STREAK_STORAGE_KEY = 'startup-tycoon/streak/v1';
export const PROFILE_STORAGE_KEY = 'startup-tycoon/profile/v1';

/** The player's own profile — set once, survives every `NEW_GAME` (unlike `GameState`, which is fully replaced). */
export interface PlayerProfile {
  ceoName: string;
}

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
      return newGame(action.companyName, action.seed);
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
  startNewGame: (companyName: string, seed?: number) => void;
  /** Wipe the autosave and clear in-memory state. */
  clearSave: () => void;
  /**
   * Full factory reset: wipes the current run *and* the player's profile (CEO
   * name), streak, and week budget, and removes their persisted keys. Unlike
   * `clearSave`, the next onboarding starts from scratch — both name and
   * company are asked again.
   */
  resetAll: () => void;
  /**
   * The player's own profile (CEO name): null until the initial load resolves,
   * and also doubles as "never set" — this player's very first run ever.
   * Outlives `NEW_GAME`; not cleared by `clearSave()`.
   */
  profile: PlayerProfile | null;
  /** Sets the CEO name once and persists it; never asked again after this. */
  setCeoName: (name: string) => void;
  /**
   * The daily week budget (PRD F12): null until the initial load resolves.
   * `TICK` is rejected once `weeksRemaining` hits 0, unless
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
  // Null until the load resolves; also doubles as "no profile was ever saved".
  const [profile, setProfileState] = useState<PlayerProfile | null>(null);

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
      }
      try {
        const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (!cancelled && raw) setProfileState(JSON.parse(raw) as PlayerProfile);
      } catch (err) {
        console.warn('[game-store] failed to load profile', err);
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

  // Persist the profile whenever it changes. Guarded against null so a save
  // never clobbers an already-stored profile before the load resolves.
  useEffect(() => {
    if (loading || profile === null) return;
    AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)).catch((err) =>
      console.warn('[game-store] failed to save profile', err),
    );
  }, [profile, loading]);

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
    // Defer the injection to a later frame instead of dispatching in the same
    // commit that cleared `pendingEvent`. When the player answers a card that
    // was hydrated as pending, `pendingEvent` flips true→false → the
    // DecisionModal starts dismissing; injecting the Standup card synchronously
    // flips it false→true mid-dismiss, and iOS hangs the modal (present-while-
    // dismiss on the same <Modal> — see docs/bug-stuck-decision-modal.md). The
    // timeout lets the dismiss animation finish first. The effect re-runs (and
    // clears this timer) on every state change, so the captured `state` is
    // always current when the timer fires — no stale-closure SET_STATE.
    const timer = setTimeout(() => {
      const updatedStreak = streak === null ? initialStreak(new Date()) : updateStreak(streak, new Date());
      setStreak(updatedStreak);
      dispatch({ type: 'SET_STATE', state: { ...state, pendingEvent: standupCardForStreak(updatedStreak.streakDays) } });
    }, 400);
    return () => clearTimeout(timer);
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

  const value: GameContextValue = {
    state,
    previousState,
    loading,
    dispatch: dispatchWithSnapshot,
    startNewGame: (companyName: string, seed?: number) => {
      setPreviousState(null);
      dispatch({ type: 'NEW_GAME', companyName, seed });
    },
    clearSave: () => {
      setPreviousState(null);
      dispatch({ type: 'HYDRATE', state: null });
    },
    resetAll: () => {
      setPreviousState(null);
      setProfileState(null);
      setStreak(null);
      setWeekBudget(initialWeekBudget(new Date()));
      // State→null lets the autosave effect remove the save key, and the fresh
      // week budget is written by its own effect. Profile and streak are
      // guarded against null-persist, so their keys never auto-clear — remove
      // them here.
      dispatch({ type: 'HYDRATE', state: null });
      Promise.all([
        AsyncStorage.removeItem(PROFILE_STORAGE_KEY),
        AsyncStorage.removeItem(STREAK_STORAGE_KEY),
      ]).catch(() => {});
    },
    weekBudget,
    devFreePlay,
    setDevFreePlay,
    streak,
    profile,
    setCeoName: (name: string) => setProfileState({ ceoName: name }),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
