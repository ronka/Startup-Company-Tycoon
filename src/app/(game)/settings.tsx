import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

/**
 * OTA update counter, bumped by `scripts/increment-update-version.js` before
 * each `eas update`. Combined with the semver `version` from app.json, it
 * gives a unique build+update stamp (e.g. `1.0.0-3`) so we can tell exactly
 * which JS bundle a device is running.
 */
const UPDATE_VERSION = 7;

/** How many hint keys live under this prefix (see first-run-hint.tsx). */
const HINT_KEY_PREFIX = 'startup-tycoon/hints/';

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    devFreePlay,
    setDevFreePlay,
    resetAll,
    purchasedWeeks,
    grantPurchasedWeeks,
    revivePool,
    grantReviveToken,
    devForceBankruptcy,
  } = useGame();

  const appVersion = (Constants.expoConfig?.version ?? '1.0.0') + '-' + UPDATE_VERSION;

  // Triple-tap the version row within 500ms to reveal the hidden debug menu.
  const tapCountRef = useRef(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    track(EVENTS.SETTINGS_VIEWED);
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  const resetHints = useCallback(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const hintKeys = keys.filter((k) => k.startsWith(HINT_KEY_PREFIX));
    if (hintKeys.length) await AsyncStorage.multiRemove(hintKeys);
  }, []);

  const confirmReset = useCallback(() => {
    Alert.alert(
      'Reset app?',
      "This erases your CEO name, current company, and all progress. You'll set everything up again from scratch.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetAll();
            resetHints().catch(() => {});
            router.replace('/onboarding');
          },
        },
      ],
      { cancelable: true },
    );
  }, [resetAll, resetHints, router]);

  const showDebugOptions = useCallback(() => {
    track(EVENTS.DEBUG_MENU_OPENED);
    Alert.alert(
      'Debug Options',
      'Developer-only actions',
      [
        {
          text: devFreePlay ? 'Free play: turn OFF' : 'Free play: turn ON',
          onPress: () => {
            track(EVENTS.DEV_FREE_PLAY_TOGGLED, { active: !devFreePlay });
            setDevFreePlay(!devFreePlay);
          },
        },
        {
          text: 'Reset first-run hints',
          onPress: () => {
            track(EVENTS.HINTS_RESET);
            resetHints().catch(() => {});
          },
        },
        {
          text: `Grant 20 purchased weeks (have ${purchasedWeeks?.weeksRemaining ?? 0})`,
          onPress: () => grantPurchasedWeeks(20),
        },
        {
          text: `Grant revive token (have ${revivePool?.tokensRemaining ?? 0})`,
          onPress: () => grantReviveToken(),
        },
        {
          text: 'Force bankruptcy (test bailout)',
          style: 'destructive',
          onPress: () => {
            devForceBankruptcy();
            router.back();
          },
        },
        {
          text: 'Start new game',
          style: 'destructive',
          onPress: () => {
            router.push('/onboarding');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [
    devFreePlay,
    setDevFreePlay,
    resetHints,
    router,
    purchasedWeeks,
    grantPurchasedWeeks,
    revivePool,
    grantReviveToken,
    devForceBankruptcy,
  ]);

  const handleVersionPress = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      showDebugOptions();
      return;
    }
    tapTimeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 500);
  }, [showDebugOptions]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <ThemedText type="default" themeColor="textSecondary">
            ‹ Back
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          About
        </ThemedText>

        <Pressable onPress={handleVersionPress} accessibilityRole="button">
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText type="default">Version</ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {appVersion}
            </ThemedText>
          </ThemedView>
        </Pressable>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Reset
        </ThemedText>

        <Pressable onPress={confirmReset} accessibilityRole="button">
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText type="default" themeColor="danger">
              Reset app
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              ›
            </ThemedText>
          </ThemedView>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
});
