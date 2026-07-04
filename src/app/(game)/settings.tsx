import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
const UPDATE_VERSION = 1;

/** How many hint keys live under this prefix (see first-run-hint.tsx). */
const HINT_KEY_PREFIX = 'startup-tycoon/hints/';

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { devFreePlay, setDevFreePlay } = useGame();

  const appVersion = (Constants.expoConfig?.version ?? '1.0.0') + '-' + UPDATE_VERSION;

  // Triple-tap the version row within 500ms to reveal the hidden debug menu.
  const tapCountRef = useRef(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  const resetHints = useCallback(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const hintKeys = keys.filter((k) => k.startsWith(HINT_KEY_PREFIX));
    if (hintKeys.length) await AsyncStorage.multiRemove(hintKeys);
  }, []);

  const showDebugOptions = useCallback(() => {
    Alert.alert(
      'Debug Options',
      'Developer-only actions',
      [
        {
          text: devFreePlay ? 'Free play: turn OFF' : 'Free play: turn ON',
          onPress: () => setDevFreePlay(!devFreePlay),
        },
        {
          text: 'Reset first-run hints',
          onPress: () => {
            resetHints().catch(() => {});
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
  }, [devFreePlay, setDevFreePlay, resetHints, router]);

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
