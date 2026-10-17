import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameChrome } from '@/components/game/game-chrome';
import { FooterFade } from '@/components/game/footer-fade';
import { Hud } from '@/components/game/hud';
import { GameTabBar } from '@/components/game/game-tab-bar';
import { useTheme } from '@/hooks/use-theme';
import { useBuyWeeksFlow } from '@/state/buy-weeks-flow';
import { raiseAvailable } from '@/state/day-close';
import { useGame } from '@/state/game-store';

/** Shared chrome sits above the illustrated tab bar; the bar owns the bottom safe area. */
export default function GameTabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // A dot on Money while a round can be raised — the same signal as the wall's
  // 💡 tip, visible from anywhere in the run.
  const { state } = useGame();
  const moneyHasAction = raiseAvailable(state);
  // One buy-weeks flow for both doors into it (the Hud's Next Week chip and the
  // chrome's closing panel): its `isOpen` gates the chrome's other surfaces, and
  // its guard against a double-present only works if there's one of it.
  const buyWeeks = useBuyWeeksFlow(state !== null && !state.gameOver);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Hud onBuyWeeks={buyWeeks.open} />
      <View style={{ flex: 1 }}>
        <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
          <Tabs
            tabBar={(props) => (
              <View style={{ backgroundColor: theme.background, zIndex: 1 }}>
                {/* HQ fits on one screen, so there's nothing to recede behind the footer. */}
                {props.state.routes[props.state.index]?.name !== 'hq' ? <FooterFade /> : null}
                <GameChrome buyWeeks={buyWeeks} />
                <GameTabBar {...props} bottomInset={insets.bottom} moneyHasAction={moneyHasAction} />
              </View>
            )}
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
  );
}
