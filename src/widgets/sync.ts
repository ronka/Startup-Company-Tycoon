/**
 * Universal entry point — resolved on web and under vitest (Node doesn't
 * understand Metro's `.native.ts` platform extension, so this is the only file
 * those environments ever see). `sync.native.ts` overrides it on iOS/Android
 * native builds. Never import `./company-widget` or `expo-widgets` from here:
 * the widget component pulls in a native module that does not exist off-device.
 *
 * Home screen widgets are iOS-only, so this no-op is also the whole Android
 * story — see the plan's scope section.
 */

import type { GameState } from '@/game/types';
import type { PurchasedWeeksPool, WeekBudget } from '@/state/week-budget';

export function useWidgetSync(
  _state: GameState | null,
  _weekBudget: WeekBudget | null,
  _purchasedWeeks: PurchasedWeeksPool | null,
  _loading: boolean,
): void {
  // Intentionally empty.
}
