import { Drawer } from 'expo-router/drawer';

import { useTheme } from '@/hooks/use-theme';

/**
 * Drawer that wraps the whole in-game experience. The `(tabs)` group (HQ /
 * Team / Money / Market, plus the persistent Hud + Next Week chrome) is the
 * main screen; `history`, `help`, and `settings` are plain screens reachable
 * only from the drawer.
 *
 * Routes are unaffected by this nesting — `(tabs)` is a group, so `/hq`,
 * `/team`, etc. still resolve. The drawer is opened from the Hud menu button.
 */
export default function GameDrawerLayout() {
  const theme = useTheme();

  return (
    <Drawer
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { backgroundColor: theme.background },
        drawerActiveTintColor: theme.text,
        drawerInactiveTintColor: theme.textSecondary,
        drawerActiveBackgroundColor: theme.backgroundElement,
      }}>
      <Drawer.Screen name="(tabs)" options={{ drawerLabel: 'Startup Empire Tycoon' }} />
      <Drawer.Screen name="history" options={{ drawerLabel: 'History' }} />
      <Drawer.Screen name="help" options={{ drawerLabel: 'Help' }} />
      <Drawer.Screen name="settings" options={{ drawerLabel: 'Settings' }} />
    </Drawer>
  );
}
