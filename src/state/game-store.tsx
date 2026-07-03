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
import type { GameAction, GameState } from '@/game/types';

export const STORAGE_KEY = 'startup-tycoon/save/v1';

type StoreAction = GameAction | { type: 'HYDRATE'; state: GameState | null };

function storeReducer(state: GameState | null, action: StoreAction): GameState | null {
  switch (action.type) {
    case 'HYDRATE':
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
  /** True until the initial AsyncStorage load resolves. */
  loading: boolean;
  dispatch: (action: GameAction) => void;
  startNewGame: (seed?: number) => void;
  /** Wipe the autosave and clear in-memory state. */
  clearSave: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, null);
  const [loading, setLoading] = useState(true);

  // Load the autosave once on mount.
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

  const value: GameContextValue = {
    state,
    loading,
    dispatch,
    startNewGame: (seed?: number) => dispatch({ type: 'NEW_GAME', seed }),
    clearSave: () => dispatch({ type: 'HYDRATE', state: null }),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
