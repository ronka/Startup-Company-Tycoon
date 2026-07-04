import { Drawer } from 'expo-router/drawer';

import { useTheme } from '@/hooks/use-theme';

/**
 * Drawer that wraps the whole in-game experience. The `(tabs)` group (HQ /
 * Team / Money / Market, plus the persistent Hud + Next Week chrome) is the
 * main screen; `settings` is a plain screen reachable only from the drawer.
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
      <Drawer.Screen name="(tabs)" options={{ drawerLabel: 'Startup Tycoon' }} />
      <Drawer.Screen name="settings" options={{ drawerLabel: 'Settings' }} />
    </Drawer>
  );
}
