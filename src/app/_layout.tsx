import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { posthog } from '@/analytics/posthog';
import { useScreenTracking } from '@/analytics/use-screen-tracking';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { NotificationManager } from '@/components/game/notification-manager';
import { GameProvider } from '@/state/game-store';
import '@/src/global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outermost so the game store and every screen can capture events.
          Touch autocapture is off; screens are tracked manually below. */}
      <PostHogProvider client={posthog} autocapture={false}>
        <GluestackUIProvider mode="dark">
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <GameProvider>
              <NotificationManager />
              <AppNavigator />
            </GameProvider>
          </ThemeProvider>
        </GluestackUIProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

/** Hosts the route stack and emits a `$screen` event on every route change. */
function AppNavigator(): ReactNode {
  useScreenTracking();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(game)" />
      <Stack.Screen name="game-over" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
