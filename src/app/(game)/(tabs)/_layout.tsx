import { Tabs, usePathname } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameChrome } from '@/components/game/game-chrome';
import { GameTabBar, GameTabBarStack } from '@/components/game/game-tab-bar';
import { GuideContext } from '@/components/game/guide-pointer';
import { Hud } from '@/components/game/hud';
import { QuestStrip, useUnlockMoment } from '@/components/game/quest-strip';
import { isUnlocked, type Feature } from '@/game/unlocks';
import { useTheme } from '@/hooks/use-theme';
import { guideKey, guideStep, guideTabFor } from '@/lib/guide';
import { useBuyWeeksFlow } from '@/state/buy-weeks-flow';
import { raiseAvailable } from '@/state/day-close';
import { useGame } from '@/state/game-store';
import { isWeekBudgetExhausted } from '@/state/week-budget';

/** The tab where each guided-run feature lives — where its unlock moment points. */
const FEATURE_ROUTE: Record<Feature, string> = {
  money: 'money',
  focus: 'market',
  morale: 'team',
  leadership: 'team',
};

/** Shared chrome sits above the illustrated tab bar; the bar owns the bottom safe area. */
export default function GameTabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // A dot on Money while a round can be raised — the same signal as the wall's
  // 💡 tip, visible from anywhere in the run.
  const { state, weekBudget, purchasedWeeks, devFreePlay } = useGame();
  const moneyHasAction = raiseAvailable(state);
  // One buy-weeks flow for both doors into it (the Hud's Next Week chip and the
  // chrome's closing panel): its `isOpen` gates the chrome's other surfaces, and
  // its guard against a double-present only works if there's one of it.
  const buyWeeks = useBuyWeeksFlow(state !== null && !state.gameOver);
  // Guided first weeks: the unlock moment, the locked tabs, and the coach's
  // one tooltip — on a tab, on a control in this tab, or on Next Week.
  const [freshUnlocks, dismissUnlocks] = useUnlockMoment(state);
  const moneyLocked = !isUnlocked(state, 'money');
  const marketLocked = !isUnlocked(state, 'focus');
  const lockedRoutes = useMemo(
    () => new Set([...(moneyLocked ? ['money'] : []), ...(marketLocked ? ['market'] : [])]),
    [moneyLocked, marketLocked],
  );
  const route = guideTabFor(usePathname());
  const atWall = isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay);
  const next = guideStep(state, route, { freshUnlocks, atWall });
  // A tapped tooltip stays hidden until the guide moves to another control or mission.
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const nextKey = state && next ? guideKey(state, next) : null;
  const step = next && nextKey !== hiddenKey ? next : null;
  const guide = { step, dismiss: () => setHiddenKey(nextKey) };
  const glowRoute = step?.target.kind === 'tab' ? step.target.tab : null;

  return (
    <GuideContext.Provider value={guide}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <Hud onBuyWeeks={buyWeeks.open}>
          <QuestStrip freshUnlocks={freshUnlocks} onDismissUnlocks={dismissUnlocks} />
        </Hud>
        <View style={{ flex: 1 }}>
          <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
            <Tabs
              tabBar={(props) => (
                <GameTabBarStack routes={props.state.routes} guide={step?.target.kind === 'tab' ? step : null}>
                  <GameChrome buyWeeks={buyWeeks} />
                  <GameTabBar
                    {...props}
                    bottomInset={insets.bottom}
                    moneyHasAction={moneyHasAction}
                    lockedRoutes={lockedRoutes}
                    glowRoute={glowRoute}
                  />
                </GameTabBarStack>
              )}
              // Opening the tab that just unlocked is noticing it: the moment is done.
              screenListeners={({ route }) => ({
                focus: () => {
                  if (freshUnlocks.some((feature) => FEATURE_ROUTE[feature] === route.name)) dismissUnlocks();
                },
              })}
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: theme.accent,
                tabBarInactiveTintColor: theme.textMuted,
                tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
              }}>
              <Tabs.Screen
                name="hq"
                options={{
                  title: 'HQ',
                }}
              />
              <Tabs.Screen
                name="team"
                options={{
                  title: 'Team',
                }}
              />
              <Tabs.Screen
                name="money"
                options={{
                  title: 'Money',
                  tabBarBadge: moneyHasAction ? '' : undefined,
                  tabBarBadgeStyle: {
                    minWidth: 10,
                    maxHeight: 10,
                    borderRadius: 5,
                    backgroundColor: theme.accent,
                  },
                }}
              />
              <Tabs.Screen
                name="market"
                options={{
                  title: 'Market',
                }}
              />
            </Tabs>
          </SafeAreaInsetsContext.Provider>
        </View>
      </View>
    </GuideContext.Provider>
  );
}
