/**
 * The guided run's coach: which control to tap next, and what to say on the
 * tooltip pointing at it. Walks the player through the real UI — "Tap Team",
 * then "Tap + to hire a developer", then "Tap Next Week" — instead of one
 * button doing everything.
 *
 * Pure and derived from the run plus the tab on screen, so it needs no saved
 * state: the step after "Tap Team" is simply what the Team tab shows.
 */

import type { GameState } from '@/game/types';
import { isGuided, nextQuest, type Feature, type QuestProgress } from '@/game/unlocks';
import { formatMoney } from '@/lib/format';
import { recommendedAction } from '@/lib/recommended-action';

export type GuideTab = 'hq' | 'team' | 'money' | 'market';

export type GuideTarget =
  | { kind: 'tab'; tab: Exclude<GuideTab, 'hq'> }
  | { kind: 'next-week' }
  | { kind: 'hire'; role: 'devs' | 'sales' | 'support' }
  | { kind: 'raise' };

export interface GuideStep {
  target: GuideTarget;
  /** Small line above the instruction: the mission and how far along it is. */
  label: string | null;
  /** The instruction itself: "Tap Team". */
  text: string;
  /** Out of free weeks: Next Week would only open the paywall, so the tooltip greys out. */
  dimmed?: boolean;
}

/** Where each feature lives, for pointing at what just unlocked. */
const FEATURE_TAB: Record<Feature, Exclude<GuideTab, 'hq'>> = {
  money: 'money',
  focus: 'market',
  morale: 'team',
  leadership: 'team',
};

/**
 * Next Week is coached for this many weeks only: tapping it a couple of times
 * teaches it, and after that the tooltip just sits over the Hud. The missions
 * themselves stay on HQ.
 */
export const NEXT_WEEK_COACH_WEEKS = 2;

const TAB_LABEL: Record<Exclude<GuideTab, 'hq'>, string> = { team: 'Team', money: 'Money', market: 'Market' };

/** "2/5 customers", "$600/$1.5K a mo" — short enough for the one-line Next Week tooltip. */
function progressText(quest: QuestProgress): string {
  if (quest.unit === 'money') return `${formatMoney(quest.progress)}/${formatMoney(quest.goal)} a mo`;
  return `${Math.floor(quest.progress)}/${quest.goal} customer${quest.goal === 1 ? '' : 's'}`;
}

function missionLabel(quest: QuestProgress | null): string | null {
  return quest ? `Mission ${quest.number} of ${quest.total} · ${quest.title}` : null;
}

/** Go to the tab first; once it's on screen, point at the control. */
function onTab(
  tab: Exclude<GuideTab, 'hq'>,
  route: GuideTab,
  label: string | null,
  why: string,
  control: GuideTarget,
  controlText: string,
): GuideStep {
  return route === tab
    ? { target: control, label, text: controlText }
    : { target: { kind: 'tab', tab }, label, text: `Tap ${TAB_LABEL[tab]} ${why}` };
}

/**
 * The recommended move, plus one lesson of the guide's own: once the first
 * customer lands, hire a support person before playing on — long before
 * `recommendedAction` would ask for one on uncovered customers alone.
 */
function guidedAction(state: GameState) {
  const id = recommendedAction(state).id;
  if (id === 'next-week' && Math.floor(state.customers) >= 1 && state.pendingHeadcount.support === 0) return 'hire-support';
  return id;
}

/**
 * The one control to point at, or null for none (outside a guided run, while a
 * decision card is up, once Next Week has been learned and playing weeks is
 * all there is to do, or once the ladder is climbed).
 */
export function guideStep(
  state: GameState | null,
  route: GuideTab,
  { freshUnlocks = [], atWall = false }: { freshUnlocks?: readonly Feature[]; atWall?: boolean } = {},
): GuideStep | null {
  if (!state || !isGuided(state) || state.gameOver || state.pendingEvent) return null;
  const quest = nextQuest(state);

  // Something just opened: go and look at it. Opening that tab ends the moment.
  const fresh = freshUnlocks[freshUnlocks.length - 1];
  if (fresh && route !== FEATURE_TAB[fresh]) {
    const tab = FEATURE_TAB[fresh];
    return { target: { kind: 'tab', tab }, label: 'New: unlocked', text: `Tap ${TAB_LABEL[tab]} to see what's new` };
  }

  const label = missionLabel(quest);
  switch (guidedAction(state)) {
    case 'hire-dev':
      return onTab('team', route, label, 'to hire a developer', { kind: 'hire', role: 'devs' }, 'Tap + to hire a developer');
    case 'hire-sales':
      return onTab('team', route, label, 'to hire a salesperson', { kind: 'hire', role: 'sales' }, 'Tap + to hire a salesperson');
    case 'hire-support':
      return onTab('team', route, label, '— customers need support', { kind: 'hire', role: 'support' }, 'Tap + to hire support');
    case 'raise':
      return onTab('money', route, label, '— cash is running low', { kind: 'raise' }, 'Tap Raise to fund the company');
    case 'next-week':
      if (!quest || state.week >= NEXT_WEEK_COACH_WEEKS) return null;
      // One line: it sits under the Hud for most of the ladder, over the week counter.
      return atWall
        ? { target: { kind: 'next-week' }, label: null, text: `🎯 ${progressText(quest)} · more weeks soon`, dimmed: true }
        : { target: { kind: 'next-week' }, label: null, text: `🎯 ${progressText(quest)} · Tap Next Week` };
    default:
      return null;
  }
}

/** The tab a pathname like "/team" shows. */
export function guideTabFor(pathname: string): GuideTab {
  const tab = pathname.split('/').filter(Boolean).pop();
  return tab === 'team' || tab === 'money' || tab === 'market' ? tab : 'hq';
}

/**
 * What a tapped-away tooltip is remembered by: the control it points at and
 * the mission it's for. It stays hidden while both hold — progress ticking
 * over doesn't bring it back, a new mission or a different control does.
 */
export function guideKey(state: GameState, step: GuideStep): string {
  return `${guideTargetId(step.target)}|${nextQuest(state)?.id ?? 'done'}`;
}

/** The control a step points at, as one id: "tab:team", "hire:devs", "next-week", "raise". Also the analytics name. */
export function guideTargetId(target: GuideTarget): string {
  return target.kind === 'tab' ? `tab:${target.tab}` : target.kind === 'hire' ? `hire:${target.role}` : target.kind;
}
