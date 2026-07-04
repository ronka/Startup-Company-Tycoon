import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameChrome } from '@/components/game/game-chrome';
import { Hud } from '@/components/game/hud';
import { TabBarIcon } from '@/components/ui/tab-bar-icon';
import { useTheme } from '@/hooks/use-theme';

/**
 * `GameChrome` (Next Week / fast-forward footer, decision modal, week
 * recap) is rendered once here — a sibling of `Tabs`, not inside any one
 * screen — so it's reachable from all four tabs (Task 12) and its two
 * `Modal`s never stack duplicates from background-mounted tab screens.
 *
 * Because GameChrome renders below the Tabs navigator (not inside it),
 * it — not the tab bar — owns the bottom safe-area inset (the home
 * indicator curve). The tab bar is fed a zeroed-out bottom inset so it
 * doesn't *also* reserve that space, which used to double it up.
 */
export default function GameTabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Hud />
      <View style={{ flex: 1 }}>
        <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: theme.text,
              tabBarInactiveTintColor: theme.textSecondary,
              tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.backgroundElement },
            }}>
            <Tabs.Screen
              name="hq"
              options={{
                title: 'HQ',
                tabBarIcon: ({ color, size }) => <TabBarIcon name="hq" color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="team"
              options={{
                title: 'Team',
                tabBarIcon: ({ color, size }) => <TabBarIcon name="team" color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="money"
              options={{
                title: 'Money',
                tabBarIcon: ({ color, size }) => <TabBarIcon name="money" color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="market"
              options={{
                title: 'Market',
                tabBarIcon: ({ color, size }) => <TabBarIcon name="market" color={color} size={size} />,
              }}
            />
          </Tabs>
        </SafeAreaInsetsContext.Provider>
      </View>
      <GameChrome />
    </View>
  );
}
