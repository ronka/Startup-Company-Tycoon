import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { Hud } from '@/components/game/hud';
import { useTheme } from '@/hooks/use-theme';

export default function GameTabsLayout() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Hud />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.text,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.backgroundElement },
        }}>
        <Tabs.Screen name="hq" options={{ title: 'HQ' }} />
        <Tabs.Screen name="team" options={{ title: 'Team' }} />
        <Tabs.Screen name="money" options={{ title: 'Money' }} />
        <Tabs.Screen name="market" options={{ title: 'Market' }} />
      </Tabs>
    </View>
  );
}
