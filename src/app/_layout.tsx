import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { posthog } from '@/analytics/posthog';
import { useScreenTracking } from '@/analytics/use-screen-tracking';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { NotificationManager } from '@/components/game/notification-manager';
import { GameProvider, useGame } from '@/state/game-store';
import '@/src/global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outermost so the game store and every screen can capture events.
          Touch autocapture is off; screens are tracked manually below. */}
      <PostHogProvider client={posthog} autocapture={false}>
        {/* The game is dark-only (see `src/constants/theme.ts`), so the
            navigation theme is pinned rather than read off the OS. */}
        <GluestackUIProvider mode="dark">
          <ThemeProvider value={DarkTheme}>
            <GameProvider>
              <SplashGate />
              <NotificationManager />
              <AppNavigator />
            </GameProvider>
          </ThemeProvider>
        </GluestackUIProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Holds the native splash until the autosave has been read, so the launch
 * routing in `app/index.tsx` can redirect a returning player to their game
 * without the start menu flashing underneath. Lives inside `GameProvider`
 * because it reads the store; renders nothing.
 */
function SplashGate(): ReactNode {
  const { saveLoaded } = useGame();

  useEffect(() => {
    if (!saveLoaded) return;
    // A frame later, so the redirected screen has committed and the splash
    // doesn't lift onto an empty background.
    const frame = requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
    return () => cancelAnimationFrame(frame);
  }, [saveLoaded]);

  return null;
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
