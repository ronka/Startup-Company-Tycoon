import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { GameChrome } from '@/components/game/game-chrome';
import { Hud } from '@/components/game/hud';
import { TabBarIcon } from '@/components/ui/tab-bar-icon';
import { useTheme } from '@/hooks/use-theme';

/**
 * `GameChrome` (Next Week / fast-forward footer, decision modal, week
 * recap) is rendered once here — a sibling of `Tabs`, not inside any one
 * screen — so it's reachable from all four tabs (Task 12) and its two
 * `Modal`s never stack duplicates from background-mounted tab screens.
 */
export default function GameTabsLayout() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Hud />
      <View style={{ flex: 1 }}>
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
      </View>
      <GameChrome />
    </View>
  );
}
