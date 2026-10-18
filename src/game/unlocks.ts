/**
 * The guided first weeks: an unlock ladder that doubles as the tutorial
 * (plans/2026-10-18-first-weeks-journey-plan.md, Stage A).
 *
 * Each quest is one goal with a reward; finishing it can unlock a feature. A
 * run only follows the ladder when the store started it with
 * `unlockSchedule: 'guided-ui'` — every other run has everything unlocked and
 * no quests, so existing saves behave exactly as before.
 *
 * Stage A only locks mechanics that wait for the player (funding rounds, the
 * focus picker, leadership seats, the morale lever), so nothing here touches
 * the simulation. Pure: the store records completions, this module decides them.
 */

import { weeklyStatsFor } from './balance';
import type { GameState } from './types';

export const FEATURES = ['money', 'focus', 'morale', 'leadership'] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  money: 'Money',
  focus: 'Market & Focus',
  morale: 'Team perks',
  leadership: 'Leadership',
};

/** Real terms that join the player's vocabulary when a feature unlocks. */
export const FEATURE_TERMS: Partial<Record<Feature, string[]>> = {
  money: ['MRR', 'Burn', 'Runway'],
};

/**
 * Goals sized so the whole ladder fits one day's free weeks (`WEEKS_BANK_CAP`,
 * 10). Measured over 30 engine seeds with 1 dev + 1 sales and nothing else:
 * 5 customers ≈ week 4, $1.5K a month ≈ week 6, 15 customers ≈ week 7–8.
 * The backstops (5 / 7 / 9) finish a stalled run inside the same day.
 */
export const EARLY_CUSTOMERS_QUEST = 5;
export const INCOME_QUEST_MONTHLY = 1_500;
export const CUSTOMERS_QUEST = 15;
/** Money unlocks straight away once runway drops below this — a struggling player is never locked out of the rescue. */
export const MONEY_CRISIS_RUNWAY_WEEKS = 10;

export type QuestId = 'hire-dev' | 'hire-sales' | 'first-customer' | 'five-customers' | 'income' | 'customers';

export interface QuestDef {
  id: QuestId;
  title: string;
  goal: number;
  /** How progress is shown: "3 / 10" or "$1.2K / $3.5K". */
  unit: 'count' | 'money';
  progress: (state: GameState) => number;
  unlocks: readonly Feature[];
  /** One line under the title: what finishing it gives you. */
  reward: string;
  /** Completes the quest by time (or crisis) even if the goal isn't met. */
  backstop?: (state: GameState) => boolean;
  /** Shown on a locked feature: when it opens. */
  condition?: string;
}

/** Monthly income in the same terms the HUD uses (weekly revenue × 4). */
export function monthlyIncome(state: GameState): number {
  return weeklyStatsFor(state).revenue * 4;
}

const customers = (state: GameState) => Math.floor(state.customers);

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'hire-dev',
    title: 'Hire your first developer',
    goal: 1,
    unit: 'count',
    // Queued hires count: the quest answers the tap, not next week's tick.
    progress: (s) => s.pendingHeadcount.devs,
    unlocks: [],
    reward: 'Developers build the product',
  },
  {
    id: 'hire-sales',
    title: 'Hire a salesperson',
    goal: 1,
    unit: 'count',
    progress: (s) => s.pendingHeadcount.sales,
    unlocks: [],
    reward: 'Salespeople bring in customers',
  },
  {
    id: 'first-customer',
    title: 'Win your first customer',
    goal: 1,
    unit: 'count',
    progress: customers,
    unlocks: [],
    reward: 'Somebody is paying for this',
  },
  {
    id: 'five-customers',
    title: `Reach ${EARLY_CUSTOMERS_QUEST} customers`,
    goal: EARLY_CUSTOMERS_QUEST,
    unit: 'count',
    progress: customers,
    unlocks: ['money'],
    reward: 'Unlocks Money: raise your first round',
    backstop: (s) => s.week >= 5 || weeklyStatsFor(s).runway < MONEY_CRISIS_RUNWAY_WEEKS,
    condition: `Unlocks at ${EARLY_CUSTOMERS_QUEST} customers, or week 5`,
  },
  {
    id: 'income',
    title: `Reach $${INCOME_QUEST_MONTHLY / 1000}K monthly income`,
    goal: INCOME_QUEST_MONTHLY,
    unit: 'money',
    progress: monthlyIncome,
    unlocks: ['focus'],
    reward: 'Unlocks Market: rivals and your strategic bet',
    backstop: (s) => s.week >= 7,
    condition: `Unlocks at $${INCOME_QUEST_MONTHLY / 1000}K monthly income, or week 7`,
  },
  {
    id: 'customers',
    title: `Reach ${CUSTOMERS_QUEST} customers`,
    goal: CUSTOMERS_QUEST,
    unit: 'count',
    progress: customers,
    unlocks: ['morale', 'leadership'],
    reward: 'Unlocks Leadership and Team perks',
    backstop: (s) => s.week >= 9,
    condition: `Unlocks at ${CUSTOMERS_QUEST} customers, or week 9`,
  },
];

export function isGuided(state: GameState | null): boolean {
  return state?.unlockSchedule === 'guided-ui';
}

const questMet = (quest: QuestDef, state: GameState) =>
  quest.progress(state) >= quest.goal || (quest.backstop?.(state) ?? false);

/**
 * Quests met right now that the run hasn't recorded yet, in ladder order. The
 * store records them (and fires the analytics) — after that they stay done
 * whatever happens to the numbers.
 */
export function newlyCompletedQuests(state: GameState): QuestId[] {
  if (!isGuided(state)) return [];
  const done = new Set(state.questsDone ?? []);
  return QUESTS.filter((q) => !done.has(q.id) && questMet(q, state)).map((q) => q.id);
}

function completedQuestIds(state: GameState): Set<string> {
  return new Set([...(state.questsDone ?? []), ...newlyCompletedQuests(state)]);
}

/** Everything is unlocked outside a guided run. Inside one, a feature opens with the quest that unlocks it, and stays open. */
export function unlockedFeatures(state: GameState): ReadonlySet<Feature> {
  if (!isGuided(state)) return new Set(FEATURES);
  const done = completedQuestIds(state);
  return new Set(QUESTS.filter((q) => done.has(q.id)).flatMap((q) => q.unlocks));
}

export function isUnlocked(state: GameState | null, feature: Feature): boolean {
  return state === null || unlockedFeatures(state).has(feature);
}

export interface QuestProgress {
  id: QuestId;
  /** 1-based position on the ladder. */
  number: number;
  total: number;
  title: string;
  progress: number;
  goal: number;
  unit: QuestDef['unit'];
  reward: string;
}

/** The pinned quest: the first one not yet done. Null outside a guided run or once the ladder is climbed. */
export function nextQuest(state: GameState): QuestProgress | null {
  if (!isGuided(state)) return null;
  const done = completedQuestIds(state);
  const index = QUESTS.findIndex((q) => !done.has(q.id));
  if (index === -1) return null;
  const q = QUESTS[index];
  return {
    id: q.id,
    number: index + 1,
    total: QUESTS.length,
    title: q.title,
    progress: Math.min(q.progress(state), q.goal),
    goal: q.goal,
    unit: q.unit,
    reward: q.reward,
  };
}

export interface LadderQuest extends QuestProgress {
  status: 'done' | 'current' | 'upcoming';
}

/** Every quest on the ladder with where the run stands on it, for the full missions list. Empty outside a guided run. */
export function questLadder(state: GameState): LadderQuest[] {
  if (!isGuided(state)) return [];
  const done = completedQuestIds(state);
  const current = QUESTS.findIndex((q) => !done.has(q.id));
  return QUESTS.map((q, index) => ({
    id: q.id,
    number: index + 1,
    total: QUESTS.length,
    title: q.title,
    progress: done.has(q.id) ? q.goal : Math.min(q.progress(state), q.goal),
    goal: q.goal,
    unit: q.unit,
    reward: q.reward,
    status: done.has(q.id) ? 'done' : index === current ? 'current' : 'upcoming',
  }));
}

/** "Unlocks at 5 customers, or week 5" — what a locked feature tells the player. */
export function unlockConditionFor(feature: Feature): string {
  return QUESTS.find((q) => q.unlocks.includes(feature))?.condition ?? 'Unlocks soon';
}

/** Features a set of just-completed quests opened, for the unlock moment and its analytics. */
export function featuresUnlockedBy(questIds: readonly string[]): Feature[] {
  return QUESTS.filter((q) => questIds.includes(q.id)).flatMap((q) => q.unlocks);
}
