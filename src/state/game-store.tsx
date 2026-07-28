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
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { EVENTS, gameProps, track } from '@/analytics/events';
import { posthog } from '@/analytics/posthog';
import { newGame, reduce } from '@/game/engine';
import { standupCardForStreak, standupTierForStreak } from '@/game/events/standup';
import { ROUND_ORDER, type FocusId, type GameAction, type GameState } from '@/game/types';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { configurePurchases, reconcileOnLaunch, syncPostHogAttribute } from '@/purchases';
import { initialStreak, updateStreak, type StreakState } from '@/state/daily-streak';
import { initialRunHistory, isNewBest, recordRun, type RunHistory } from '@/state/run-history';
import { reportReviewSuppressed, requestReviewOnce } from '@/state/store-review';
import {
  canRedeemRevive,
  creditReviveTransaction,
  creditReviveTransactions,
  grantReviveToken,
  initialRevivePool,
  consumeReviveToken,
  type RevivePool,
} from '@/state/revive';
import {
  creditTransaction,
  creditTransactions,
  dateKey,
  grantPurchasedWeeks,
  initialPurchasedWeeksPool,
  initialWeekBudget,
  isWeekBudgetExhausted,
  refreshWeekBudget,
  spendWeekFromPools,
  type PurchasedWeeksPool,
  type WeekBudget,
} from '@/state/week-budget';
import { useWidgetSync } from '@/widgets/sync';

export const STORAGE_KEY = 'startup-tycoon/save/v3';
export const WEEK_BUDGET_STORAGE_KEY = 'startup-tycoon/week-budget/v1';
export const PURCHASED_WEEKS_STORAGE_KEY = 'startup-tycoon/purchased-weeks/v1';
export const REVIVE_STORAGE_KEY = 'startup-tycoon/revive/v1';
export const STREAK_STORAGE_KEY = 'startup-tycoon/streak/v1';
export const PROFILE_STORAGE_KEY = 'startup-tycoon/profile/v1';
export const RUN_HISTORY_STORAGE_KEY = 'startup-tycoon/run-history/v1';

/**
 * The revision of the intro story this build ships. Bump it when the intro is
 * revamped enough that existing players should see it again; profiles stamped
 * with an older version replay the full sequence.
 */
export const ONBOARDING_VERSION = 2;

/** The player's own profile — set once, survives every `NEW_GAME` (unlike `GameState`, which is fully replaced). */
export interface PlayerProfile {
  ceoName: string;
  /**
   * Which intro revision this player has completed. Absent (legacy profiles,
   * or after "Replay intro") means they've never seen the current one, so the
   * full story sequence plays instead of jumping straight to name entry.
   */
  onboardingVersion?: number;
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
      return newGame(action.companyName, action.seed, action.focus);
    default:
      return state === null ? state : reduce(state, action);
  }
}

/**
 * Emit the analytics event for a single non-TICK game action, tagged with the
 * action's own params and the run context as it stood just before the action.
 * TICK is handled separately (rate-limit + post-tick diff); this covers every
 * other player decision from one place.
 */
/**
 * Delay before the funding-round review ask, matching the chrome's own arming
 * delays: a raise can land in the same frame a decision card or recap is
 * presenting, and iOS hangs when one modal presents into another's transition
 * (docs/bug-stuck-decision-modal.md).
 */
const FUNDING_REVIEW_ARM_MS = 350;

/**
 * A Series A or B raise is the app's best-populated success beat — most runs that
 * survive the early weeks reach one, unlike a finished run or a long streak.
 *
 * `state` here is the **pre-action** snapshot (see `dispatchWithSnapshot`), so
 * `ROUND_ORDER[state.roundsRaised]` names the round being raised right now. Matched
 * by name rather than by a `roundsRaised >= n` count so inserting a round into
 * `ROUND_ORDER` can't silently re-point this at the wrong one. Seed is excluded: it
 * arrives too early to read as an achievement.
 */
function armFundingRoundReviewAsk(state: GameState): void {
  const round = ROUND_ORDER[state.roundsRaised];
  if (round !== 'seriesA' && round !== 'seriesB') return;
  // A raise taken *out of* insolvency is a rescue, not a victory lap — the
  // insolvency banner is still on the HQ tab and the run is still in trouble.
  // Pre-action state again: the raise lands cash, but the player's read of the
  // moment was formed by the state they were in when they tapped.
  if (deriveWeeklyStats(state).insolvent) {
    reportReviewSuppressed('funding_round', 'insolvent');
    return;
  }
  // Reading `pendingEvent` off the pre-action snapshot is sound here specifically
  // because `RAISE_ROUND` never draws a card: what's pending before the raise is
  // what's pending after it. Any future action that both raises and draws would
  // need a live read instead.
  if (state.pendingEvent) {
    reportReviewSuppressed('funding_round', 'modal_busy');
    return;
  }
  setTimeout(() => {
    requestReviewOnce('funding_round');
  }, FUNDING_REVIEW_ARM_MS);
}

function captureAction(action: GameAction, state: GameState): void {
  const base = gameProps(state);
  switch (action.type) {
    case 'SET_PENDING_HIRES':
      track(EVENTS.HIRES_CHANGED, { ...base, role: action.role, delta: action.delta });
      break;
    case 'SET_MORALE_LEVER':
      track(EVENTS.MORALE_LEVER_TOGGLED, { ...base, active: action.active });
      break;
    case 'HIRE_CLEVEL':
      track(EVENTS.CLEVEL_HIRED, { ...base, role: action.role, candidate_id: action.candidateId });
      break;
    case 'FIRE_CLEVEL':
      track(EVENTS.CLEVEL_FIRED, { ...base, role: action.role });
      break;
    case 'RAISE_ROUND':
      track(EVENTS.FUNDING_ROUND_RAISED, { ...base, round: ROUND_ORDER[state.roundsRaised] ?? null });
      break;
    case 'GO_PUBLIC':
      track(EVENTS.RUN_ENDED_IPO, base);
      break;
    case 'ANSWER_EVENT':
      track(EVENTS.EVENT_DECISION_MADE, {
        ...base,
        choice_index: action.choiceIndex,
        card_id: state.pendingEvent?.id ?? null,
        card_title: state.pendingEvent?.title ?? null,
      });
      break;
    case 'SET_FOCUS':
      track(EVENTS.FOCUS_CHANGED, { ...base, focus: action.focus, previous_focus: state.focus });
      break;
    default:
      break;
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
  /** True until the whole initial load resolves — including the launch purchase reconciliation. */
  loading: boolean;
  /**
   * True as soon as the autosave read settles (found, missing, or failed) —
   * strictly earlier than `loading`, which also waits on a RevenueCat network
   * round trip. This is the signal for "we now know whether a run exists", so
   * launch routing (`src/app/index.tsx`) and the splash gate can act on the
   * save without being held behind the store call.
   */
  saveLoaded: boolean;
  dispatch: (action: GameAction) => void;
  /** `focus` is the onboarding founder type; omitted, the run starts on `core`. */
  startNewGame: (companyName: string, focus?: FocusId, seed?: number) => void;
  /** Wipe the autosave and clear in-memory state. */
  clearSave: () => void;
  /**
   * Full factory reset: wipes the current run *and* the player's profile (CEO
   * name), streak, week budget, and purchased-weeks pool, and removes their
   * persisted keys. Unlike `clearSave`, the next onboarding starts from
   * scratch — both name and company are asked again. Purchased weeks are not
   * special-cased here: the design already accepts local week-loss on
   * reinstall (anonymous RC IDs), and `resetAll` is the in-app equivalent —
   * Task 5's launch reconciliation re-credits any still-owed weeks from
   * RevenueCat once that lands.
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
  /** Stamps the profile as having completed the current intro revision, so it isn't replayed. */
  markOnboardingSeen: () => void;
  /** Clears the intro stamp so the full story plays again (Settings → Replay intro, QA). */
  replayOnboarding: () => void;
  /**
   * The daily week budget (PRD F12): null until the initial load resolves.
   * `TICK` is rejected once `weeksRemaining` hits 0, unless
   * `devFreePlay` is on. Everything else (hiring, raising, answering a
   * decision, browsing tabs) stays fully usable at zero.
   */
  weekBudget: WeekBudget | null;
  /**
   * IAP-purchased weeks (separate from the free daily budget): cap-exempt,
   * never expire, and outlive `NEW_GAME` / game over. Spent only after the
   * free budget is exhausted. Null until the initial load resolves.
   */
  purchasedWeeks: PurchasedWeeksPool | null;
  /** Dev-only grant with no transaction ledger involved (debug menu). */
  grantPurchasedWeeks: (amount: number) => void;
  /**
   * Credits a completed IAP by its transaction ID (Task 5): the weeks and
   * the granted-tx ledger update in the same write, so a purchase can never
   * end up marked granted without its weeks landing too. Idempotent per
   * transaction ID.
   */
  creditPurchase: (weeksGranted: number, transactionId: string) => void;
  /**
   * Bankruptcy-bailout (revive) token pool: cap-free consumables bought via
   * IAP, redeemed on the game-over screen. Null until the initial load resolves.
   */
  revivePool: RevivePool | null;
  /** Dev-only grant of one revive token with no transaction ledger (debug menu). */
  grantReviveToken: () => void;
  /**
   * Credits a completed revive IAP by its transaction ID: the token and the
   * granted-tx ledger update in the same write. Idempotent per transaction ID.
   */
  creditRevivePurchase: (transactionId: string) => void;
  /**
   * Redeem one revive token: consume it and dispatch the `REVIVE` engine action
   * (restore cash, clear the fuse, un-end the run) with the given windfall
   * `reason` flavor. No-op if no token is available or no run is active.
   */
  redeemRevive: (reason: string) => void;
  /** Dev-only escape hatch so playtesting is never rate-limited. Not persisted. */
  devFreePlay: boolean;
  setDevFreePlay: (freePlay: boolean) => void;
  /** Dev-only: drop the current run straight into bankruptcy game-over, to exercise the bailout flow. */
  devForceBankruptcy: () => void;
  /** Daily-play streak (PRD F12); null until the initial load resolves. */
  streak: StreakState | null;
  /**
   * Every completed run (bankruptcy, acquisition, or IPO), newest first;
   * null until the initial load resolves. Outlives `NEW_GAME` and revive —
   * only `resetAll` clears it.
   */
  runHistory: RunHistory | null;
  /**
   * True when the run that just ended (the current `gameOver` state, if any)
   * set a new personal best. Set the instant the run is recorded; cleared on
   * `NEW_GAME` and `resetAll`.
   */
  lastRunWasBest: boolean;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, null);
  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  // Resolves ahead of `loading`, as soon as the autosave read settles — see the
  // context type above and the mount effect below.
  const [saveLoaded, setSaveLoaded] = useState(false);
  const [weekBudget, setWeekBudget] = useState<WeekBudget | null>(null);
  const [purchasedWeeks, setPurchasedWeeks] = useState<PurchasedWeeksPool | null>(null);
  const [revivePool, setRevivePool] = useState<RevivePool | null>(null);
  // A synchronous mirror of `revivePool` so a purchase-success handler that
  // credits a token and then immediately redeems it (same tick, before React
  // re-renders) reads the just-credited token instead of a stale value. Kept
  // in sync on commit below, and updated eagerly by `applyRevivePool`.
  const revivePoolRef = useRef<RevivePool | null>(null);
  const [devFreePlay, setDevFreePlay] = useState(false);
  // Null (not `initialStreak`) until the load resolves: null also doubles as
  // "no streak was ever saved", which the standup-injection effect below
  // treats as this player's very first session, distinct from "already
  // credited today".
  const [streak, setStreak] = useState<StreakState | null>(null);
  // Null until the load resolves; also doubles as "no profile was ever saved".
  const [profile, setProfileState] = useState<PlayerProfile | null>(null);
  // Null until the load resolves; also doubles as "no history was ever saved".
  const [runHistory, setRunHistory] = useState<RunHistory | null>(null);
  // Whether the run that just ended (the current `gameOver` state, if any) set
  // a new personal best. Set in the game-over transition below; cleared on
  // `NEW_GAME` so it never bleeds into the next run's game-over screen.
  const [lastRunWasBest, setLastRunWasBest] = useState(false);

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
      } finally {
        // Flipped here rather than with `loading` below: launch routing only
        // needs to know whether a run exists, and everything after this point
        // (week budget, purchases, streak, ...) would make it wait on a
        // network call before the player sees their game.
        if (!cancelled) setSaveLoaded(true);
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
      let loadedPurchasedWeeks = initialPurchasedWeeksPool();
      try {
        const raw = await AsyncStorage.getItem(PURCHASED_WEEKS_STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as PurchasedWeeksPool) : null;
        loadedPurchasedWeeks = saved ?? initialPurchasedWeeksPool();
        if (!cancelled) setPurchasedWeeks(loadedPurchasedWeeks);
      } catch (err) {
        console.warn('[game-store] failed to load purchased weeks', err);
        if (!cancelled) setPurchasedWeeks(loadedPurchasedWeeks);
      }
      let loadedRevivePool = initialRevivePool();
      try {
        const raw = await AsyncStorage.getItem(REVIVE_STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as RevivePool) : null;
        loadedRevivePool = saved ?? initialRevivePool();
        if (!cancelled) setRevivePool(loadedRevivePool);
      } catch (err) {
        console.warn('[game-store] failed to load revive pool', err);
        if (!cancelled) setRevivePool(loadedRevivePool);
      }
      try {
        // No-ops off iOS / in Expo Go (see src/purchases/index.native.ts).
        // Crash-safe delivery (Task 5): diffs RC's transaction history against
        // what's already been granted (the ledger just loaded above) and
        // credits anything still owed, so a purchase interrupted mid-flow
        // (e.g. app killed right after payment) self-heals on the next
        // launch instead of losing the weeks. `creditTransactions` folds the
        // credit and the ledger update into the *same* persisted object, so
        // there's no window where one could land without the other.
        configurePurchases();
        syncPostHogAttribute(posthog.getDistinctId()).catch(() => {});
        const { newlyGrantedWeeks, newlyGrantedRevives } = await reconcileOnLaunch(
          new Set(loadedPurchasedWeeks.grantedTransactionIds),
          new Set(loadedRevivePool.grantedTransactionIds),
        );
        if (!cancelled && newlyGrantedWeeks.length > 0) {
          setPurchasedWeeks((prev) => creditTransactions(prev ?? loadedPurchasedWeeks, newlyGrantedWeeks));
        }
        if (!cancelled && newlyGrantedRevives.length > 0) {
          setRevivePool((prev) => creditReviveTransactions(prev ?? loadedRevivePool, newlyGrantedRevives));
        }
      } catch (err) {
        console.warn('[game-store] failed to reconcile purchases', err);
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
      }
      try {
        const raw = await AsyncStorage.getItem(RUN_HISTORY_STORAGE_KEY);
        if (!cancelled) setRunHistory(raw ? (JSON.parse(raw) as RunHistory) : initialRunHistory());
      } catch (err) {
        console.warn('[game-store] failed to load run history', err);
        if (!cancelled) setRunHistory(initialRunHistory());
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

  // Persist the purchased-weeks pool whenever it changes.
  useEffect(() => {
    if (loading || purchasedWeeks === null) return;
    AsyncStorage.setItem(PURCHASED_WEEKS_STORAGE_KEY, JSON.stringify(purchasedWeeks)).catch((err) =>
      console.warn('[game-store] failed to save purchased weeks', err),
    );
  }, [purchasedWeeks, loading]);

  // Persist the revive-token pool whenever it changes, and keep the ref mirror
  // in sync with each committed value.
  useEffect(() => {
    revivePoolRef.current = revivePool;
    if (loading || revivePool === null) return;
    AsyncStorage.setItem(REVIVE_STORAGE_KEY, JSON.stringify(revivePool)).catch((err) =>
      console.warn('[game-store] failed to save revive pool', err),
    );
  }, [revivePool, loading]);

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

  // Persist the run history whenever it changes.
  useEffect(() => {
    if (loading || runHistory === null) return;
    AsyncStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(runHistory)).catch((err) =>
      console.warn('[game-store] failed to save run history', err),
    );
  }, [runHistory, loading]);

  // Mirror the run onto the iOS home screen widget. A no-op everywhere else
  // (web, Android, Expo Go) — `@/widgets/sync` resolves to a stub off native
  // and guards on the platform within it, so `expo-widgets` is never loaded
  // where it doesn't exist. It pushes on `loading → false` and on app
  // background, deduped and debounced in between; see `src/widgets/sync.native.ts`.
  useWidgetSync(state, weekBudget, purchasedWeeks, loading);

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
      track(EVENTS.DAILY_STREAK_CREDITED, { streak_days: updatedStreak.streakDays });
      track(EVENTS.DAILY_STANDUP_SHOWN, {
        streak_days: updatedStreak.streakDays,
        tier: standupTierForStreak(updatedStreak.streakDays),
      });
      dispatch({ type: 'SET_STATE', state: { ...state, pendingEvent: standupCardForStreak(updatedStreak.streakDays) } });
    }, 400);
    return () => clearTimeout(timer);
  }, [loading, state, streak]);

  // Capture engine-driven transitions the store never dispatches directly.
  // The engine stays pure (no analytics under src/game/) — instead we diff the
  // serialized GameState against the previous render's and emit the deltas.
  const prevStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (loading || !state) return;

    // Keep run context on every subsequent event (incl. UI-only ones) so any
    // capture can be broken down by where the player is in the run.
    posthog.register({ week: state.week, stage: state.stage, era: state.era }).catch(() => {});

    if (!prev) return; // first observed state (hydrate / new game) — nothing to diff

    // Don't diff across two different runs. Starting a new game replaces the
    // whole GameState in place (e.g. growth→garage), which would otherwise read
    // as a stage/era regression. A run is identified by its immutable seed.
    if (prev.createdWithSeed !== state.createdWithSeed || state.week < prev.week) return;

    // A week actually advanced (week only ever increases via TICK).
    if (state.week > prev.week) {
      track(EVENTS.WEEK_ADVANCED, gameProps(state));
    }
    if (state.stage !== prev.stage) {
      track(EVENTS.STAGE_ADVANCED, { from: prev.stage, to: state.stage, week: state.week });
    }
    if (state.era !== prev.era) {
      track(EVENTS.ERA_CHANGED, { from: prev.era, to: state.era, week: state.week });
    }
    if (state.trend.phase !== prev.trend.phase || state.trend.id !== prev.trend.id) {
      track(EVENTS.TREND_PHASE_CHANGED, {
        trend_id: state.trend.id,
        phase: state.trend.phase,
        week: state.week,
      });
    }
    // The run just ended (null → reason). Fires exactly once per run,
    // including a second bankruptcy after a revive (which clears `gameOver`
    // in between, so this is a fresh null→reason transition).
    if (state.gameOver && !prev.gameOver) {
      const score = Math.round(state.finalScore ?? 0);
      track(EVENTS.GAME_OVER, {
        ...gameProps(state),
        reason: state.gameOver,
        final_score: score,
        $set: { last_game_over_reason: state.gameOver },
      });
      const historyBeforeRecording = runHistory ?? initialRunHistory();
      const newBest = isNewBest(historyBeforeRecording, score);
      setLastRunWasBest(newBest);
      if (newBest) {
        track(EVENTS.NEW_BEST_SCORE, { score, reason: state.gameOver, weeks: state.week });
      }
      setRunHistory(
        recordRun(historyBeforeRecording, {
          endedOnDateKey: dateKey(new Date()),
          reason: state.gameOver,
          weeks: state.week,
          score,
          seed: state.createdWithSeed,
          companyName: state.companyName,
        }),
      );
    }
  }, [state, loading, runHistory]);

  const dispatchWithSnapshot = (action: GameAction) => {
    if (action.type === 'TICK') {
      // Mirrors tick()'s own frozen conditions so the delta baseline only
      // shifts when a tick will actually advance the week.
      if (!state || state.gameOver || state.pendingEvent) return;
      // Store-layer-only rate limit (PRD F12) — the engine never sees this.
      // Purchased weeks (IAP week-packs) top up the free budget rather than
      // replacing it: spend order is free-first via `spendWeekFromPools`.
      // Launch now routes straight into the run off `saveLoaded`, which lands a
      // frame or two ahead of the pools finishing their own reads. Ticking in
      // that window would advance the week without spending anything, so hold
      // the tap instead of handing out a free week.
      if (!devFreePlay && (weekBudget === null || purchasedWeeks === null)) return;
      if (isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay)) {
        // The player hit the daily wall — a key retention/monetization signal.
        track(EVENTS.WEEK_ADVANCE_BLOCKED, gameProps(state));
        return;
      }
      setPreviousState(state);
      if (!devFreePlay && weekBudget && purchasedWeeks) {
        const spent = spendWeekFromPools(weekBudget, purchasedWeeks);
        setWeekBudget(spent.budget);
        setPurchasedWeeks(spent.purchased);
      }
      dispatch(action);
      // `week_advanced` itself is emitted by the state-diff effect, with the
      // fresh post-tick numbers, once the reducer commits.
      return;
    }
    // Every other game action carries its params + the pre-action run context.
    // (Outcomes like stage/era changes are emitted separately by the diff effect.)
    if (state) captureAction(action, state);
    if (action.type === 'RAISE_ROUND' && state) armFundingRoundReviewAsk(state);
    dispatch(action);
  };

  // Updates the revive pool through both the synchronous ref mirror and React
  // state, so back-to-back reads within one handler (credit → redeem) are
  // consistent.
  const applyRevivePool = (updater: (prev: RevivePool) => RevivePool) => {
    const next = updater(revivePoolRef.current ?? initialRevivePool());
    revivePoolRef.current = next;
    setRevivePool(next);
  };

  const value: GameContextValue = {
    state,
    previousState,
    loading,
    saveLoaded,
    dispatch: dispatchWithSnapshot,
    startNewGame: (companyName: string, focus?: FocusId, seed?: number) => {
      setPreviousState(null);
      setLastRunWasBest(false);
      track(EVENTS.GAME_STARTED, {
        company_name: companyName,
        is_returning_ceo: profile?.ceoName != null,
        seed: seed ?? null,
        focus: focus ?? 'core',
        $set: { company_name: companyName },
        $set_once: { first_game_at: new Date().toISOString() },
      });
      dispatch({ type: 'NEW_GAME', companyName, seed, focus });
    },
    clearSave: () => {
      setPreviousState(null);
      track(EVENTS.SAVE_CLEARED);
      dispatch({ type: 'HYDRATE', state: null });
    },
    resetAll: () => {
      setPreviousState(null);
      setLastRunWasBest(false);
      setProfileState(null);
      setStreak(null);
      setWeekBudget(initialWeekBudget(new Date()));
      setPurchasedWeeks(initialPurchasedWeeksPool());
      setRevivePool(initialRevivePool());
      setRunHistory(initialRunHistory());
      track(EVENTS.APP_RESET);
      // New anonymous identity so a fresh setup isn't attributed to the old player.
      posthog.reset();
      // State→null lets the autosave effect remove the save key, and the fresh
      // week budget / purchased pool / run history are written by their own
      // effects. Profile and streak are guarded against null-persist, so
      // their keys never auto-clear — remove them here.
      dispatch({ type: 'HYDRATE', state: null });
      Promise.all([
        AsyncStorage.removeItem(PROFILE_STORAGE_KEY),
        AsyncStorage.removeItem(STREAK_STORAGE_KEY),
        AsyncStorage.removeItem(RUN_HISTORY_STORAGE_KEY),
      ]).catch(() => {});
    },
    weekBudget,
    purchasedWeeks,
    grantPurchasedWeeks: (amount: number) => {
      setPurchasedWeeks((prev) => grantPurchasedWeeks(prev ?? initialPurchasedWeeksPool(), amount));
    },
    creditPurchase: (weeksGranted: number, transactionId: string) => {
      setPurchasedWeeks((prev) => creditTransaction(prev ?? initialPurchasedWeeksPool(), transactionId, weeksGranted));
    },
    revivePool,
    grantReviveToken: () => applyRevivePool(grantReviveToken),
    creditRevivePurchase: (transactionId: string) =>
      applyRevivePool((prev) => creditReviveTransaction(prev, transactionId)),
    redeemRevive: (reason: string) => {
      if (!state) return;
      // Read the synchronous mirror, so a credit in this same handler (the
      // purchase path) is already visible. Only dispatch REVIVE when a token
      // is actually consumed — no free revives from a stale render or double-tap.
      const pool = revivePoolRef.current ?? initialRevivePool();
      if (!canRedeemRevive(pool)) return;
      applyRevivePool(consumeReviveToken);
      track(EVENTS.REVIVE_REDEEMED, { ...gameProps(state), reason });
      dispatch({ type: 'REVIVE', reason });
    },
    devFreePlay,
    setDevFreePlay,
    devForceBankruptcy: () => {
      if (!state) return;
      // Uses the raw store dispatch (SET_STATE) to drop straight into the
      // bankruptcy end-state so the game-over bailout flow can be exercised
      // without grinding a run into the red for three weeks.
      dispatch({
        type: 'SET_STATE',
        state: { ...state, cash: -40_000, weeksInTheRed: 3, gameOver: 'bankruptcy', finalScore: 0 },
      });
    },
    streak,
    profile,
    setCeoName: (name: string) => {
      track(EVENTS.CEO_NAME_SET, { $set: { ceo_name: name } });
      // The only writer that can create a profile from nothing — the CEO name
      // is the field that makes one exist. Every other write edits in place.
      setProfileState((prev) => ({ ...prev, ceoName: name }));
    },
    markOnboardingSeen: () => {
      // A no-op without a profile, which can't happen from the intro: every
      // route to the final beat passes the `name` step, and that calls
      // `setCeoName`. Stamping a placeholder profile here instead would persist
      // an empty CEO name, so failing closed is the safer of the two.
      setProfileState((prev) => (prev ? { ...prev, onboardingVersion: ONBOARDING_VERSION } : prev));
    },
    replayOnboarding: () => {
      // Drop the stamp rather than zeroing it, so the profile shape stays the
      // same as a legacy (pre-versioning) one — both mean "hasn't seen it".
      setProfileState((prev) => {
        if (!prev) return prev;
        const { onboardingVersion: _dropped, ...rest } = prev;
        return rest;
      });
    },
    runHistory,
    lastRunWasBest,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
