/**
 * The one place that talks to `expo-widgets`. Everything it pushes is derived
 * by the pure, tested `./snapshot`; this layer only decides *when* to push.
 *
 * iOS throttles widget timeline reloads as a budgeted system resource, so
 * pushing on every state change would get the app throttled and leave the tile
 * staler than not pushing at all. Hence three rules:
 *
 * - **Dedupe.** Skip when the derived timeline is identical to the last one
 *   pushed. Most store updates (hiring, browsing, a lever toggle) do not move a
 *   single number on the tile. This gate is never bypassed.
 * - **Debounce.** At most one push every `DEBOUNCE_MS`, with the last value
 *   winning — a burst of updates inside one turn collapses to one reload.
 * - **Flush on background.** When the app backgrounds, a *changed* timeline
 *   goes out immediately instead of waiting out the debounce window. That is
 *   the exact moment the widget's contents start mattering.
 *
 * The initial push happens as soon as `loading` flips false, not only on
 * background: a widget added to the home screen between sessions would
 * otherwise render blank until the player next opened the app.
 */

import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import type { GameState } from '@/game/types';
import type { PurchasedWeeksPool, WeekBudget } from '@/state/week-budget';

import { widgetTimeline, type WidgetTimelineEntry } from './snapshot';

/** At most one timeline reload per this many ms, outside a background flush. */
const DEBOUNCE_MS = 5_000;

/**
 * `expo-widgets` is a native module: iOS-only, and absent from Expo Go (only
 * our own dev/production builds link it). Same signal and same `require`-not-
 * import reasoning as `src/purchases/index.native.ts` — `Constants.appOwnership`
 * is deprecated but is the only one that separates true Expo Go from our custom
 * dev client, and a static import would evaluate the module on paths where it
 * cannot load.
 */
const widgetsAvailable = Platform.OS === 'ios' && Constants.appOwnership !== 'expo';

type WidgetHandle = { updateTimeline: (entries: WidgetTimelineEntry[]) => void };

let widget: WidgetHandle | null = null;
function companyWidget(): WidgetHandle | null {
  if (!widgetsAvailable) return null;
  if (!widget) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      widget = require('./company-widget').CompanyWidget as WidgetHandle;
    } catch (err) {
      console.warn('[widget-sync] failed to load the widget module', err);
      return null;
    }
  }
  return widget;
}

/**
 * Compared instead of the entries themselves: the `date`s move every render
 * (entry 0 is always "now"), so including them would defeat the dedupe
 * entirely. The props are what the player actually sees.
 */
function timelineKey(entries: WidgetTimelineEntry[]): string {
  return JSON.stringify(entries.map((entry) => entry.props));
}

export function useWidgetSync(
  state: GameState | null,
  weekBudget: WeekBudget | null,
  purchasedWeeks: PurchasedWeeksPool | null,
  loading: boolean,
): void {
  // The most recent inputs, so the AppState listener flushes what is true now
  // rather than whatever was current when it was registered.
  const latest = useRef({ state, weekBudget, purchasedWeeks, loading });
  // Written in an effect rather than during render, and declared before the
  // push effect below so it has already landed by the time that one runs.
  useEffect(() => {
    latest.current = { state, weekBudget, purchasedWeeks, loading };
  }, [state, weekBudget, purchasedWeeks, loading]);

  const lastPushedKey = useRef<string | null>(null);
  const lastPushedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useRef((force: boolean) => {
    const current = latest.current;
    if (current.loading) return;
    const target = companyWidget();
    if (!target) return;

    const entries = widgetTimeline(
      current.state,
      current.weekBudget,
      current.purchasedWeeks,
      new Date(),
    );
    // Dedupe is unconditional — `force` bypasses the debounce *timer*, not the
    // "nothing changed" check. A background flush of a byte-identical timeline
    // would burn reload budget for no visible change, and `inactive` fires
    // often (app switcher, notification centre, an incoming call).
    const key = timelineKey(entries);
    if (key === lastPushedKey.current) return;

    const elapsed = Date.now() - lastPushedAt.current;
    if (!force && elapsed < DEBOUNCE_MS) {
      // Trailing edge: re-run once the window closes, with whatever is latest then.
      if (timer.current === null) {
        timer.current = setTimeout(() => {
          timer.current = null;
          push.current(false);
        }, DEBOUNCE_MS - elapsed);
      }
      return;
    }

    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    lastPushedKey.current = key;
    lastPushedAt.current = Date.now();
    try {
      target.updateTimeline(entries);
    } catch (err) {
      console.warn('[widget-sync] failed to update the widget timeline', err);
    }
  });

  // Every state change is a candidate; dedupe and debounce filter it down.
  // Fires on `loading → false` too, which is the initial push.
  useEffect(() => {
    push.current(false);
  }, [state, weekBudget, purchasedWeeks, loading]);

  useEffect(() => {
    if (!widgetsAvailable) return;
    const subscription = AppState.addEventListener('change', (next) => {
      // `force` here means "don't make the tile wait out the debounce window
      // while the app is leaving" — an unchanged timeline is still skipped.
      if (next === 'background' || next === 'inactive') push.current(true);
    });
    return () => {
      subscription.remove();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);
}
