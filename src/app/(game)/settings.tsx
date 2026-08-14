import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { resetAllHints } from '@/components/game/first-run-hint';
import { RestorePurchasesButton } from '@/components/game/restore-purchases-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LEGAL_LINK_LABELS, openLegalLink, type LegalLink } from '@/lib/open-legal-link';
import { purchasesAvailable } from '@/purchases';
import { useGame } from '@/state/game-store';
import { forceReviewForDev, resetReviewGateForDev, storeListingUrl } from '@/state/store-review';

/**
 * The legal/support rows App Review requires to be reachable inside the app:
 * the privacy policy (Guideline 5.1.1(i), which asks for it "within the app in
 * an easily accessible manner"), a way to contact support (Guideline 1.5), and
 * the terms a purchase is made under. Settings is the conventional home for all
 * three, and the one place a reviewer will look for them.
 */
const LEGAL_LINKS: LegalLink[] = ['privacy', 'terms', 'support'];

/**
 * OTA update counter, bumped by `scripts/increment-update-version.js` before
 * each `eas update`. Combined with the semver `version` from app.json, it
 * gives a unique build+update stamp (e.g. `1.0.0-3`) so we can tell exactly
 * which JS bundle a device is running.
 */
const UPDATE_VERSION = 15;


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
    replayOnboarding,
  } = useGame();

  const appVersion = (Constants.expoConfig?.version ?? '1.0.0') + '-' + UPDATE_VERSION;

  // Read once — it comes from static app config, not from device state. Null on
  // web and on any build where `ios.appStoreUrl` is missing, in which case the row
  // below hides rather than offering a dead link.
  const listingUrl = storeListingUrl();

  // Deliberately opens the App Store listing instead of calling `requestReview()`:
  // Apple's guidance is not to drive the native sheet from a button, and this is
  // the one rating path that still works in TestFlight, where the native sheet
  // reports itself unavailable.
  const openStoreListing = useCallback(() => {
    if (!listingUrl) return;
    track(EVENTS.REVIEW_LINK_OPENED, { source: 'settings' });
    Linking.openURL(listingUrl).catch(() => {});
  }, [listingUrl]);

  // Triple-tap the version row within 500ms to reveal the hidden debug menu.
  const tapCountRef = useRef(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    track(EVENTS.SETTINGS_VIEWED);
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
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
            resetAllHints().catch(() => {});
            router.replace('/onboarding');
          },
        },
      ],
      { cancelable: true },
    );
  }, [resetAll, router]);

  /**
   * Abandons the current run and starts a fresh company. The app resumes
   * straight into the saved run on launch (see `app/index.tsx`), so the start
   * menu's "New Game" is out of reach mid-run — this is the way back to it.
   * The save isn't wiped here; finishing onboarding replaces it anyway, and
   * backing out of onboarding should leave the run intact.
   */
  const confirmNewGame = useCallback(() => {
    Alert.alert(
      'Start a new game?',
      'Your current run ends here and a brand-new company starts. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          style: 'destructive',
          onPress: () => {
            track(EVENTS.NEW_GAME_TAPPED, { has_run_in_progress: true, source: 'settings' });
            router.replace('/onboarding');
          },
        },
      ],
      { cancelable: true },
    );
  }, [router]);

  /**
   * Replays the intro story and every contextual hint, then starts a new run.
   * The current run isn't wiped here — finishing onboarding starts a fresh
   * game anyway, so warn about that rather than silently discarding it.
   */
  const confirmReplayIntro = useCallback(() => {
    Alert.alert(
      'Replay intro?',
      'You’ll go through the intro again and start a brand-new company. Your current run is left behind.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replay',
          onPress: () => {
            track(EVENTS.ONBOARDING_REPLAY_REQUESTED);
            replayOnboarding();
            resetAllHints().catch(() => {});
            router.replace('/onboarding');
          },
        },
      ],
      { cancelable: true },
    );
  }, [replayOnboarding, router]);

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
            resetAllHints().catch(() => {});
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
        // The review flow gives no callback and is unavailable in TestFlight, so a
        // dev build driving it by hand is the only way to see it at all. "Force"
        // bypasses the budget; "Reset" clears it so the real triggers can be re-run.
        {
          text: 'Force review prompt',
          onPress: () => {
            forceReviewForDev().catch(() => {});
          },
        },
        {
          text: 'Reset review gate',
          onPress: () => {
            resetReviewGateForDev().catch(() => {});
          },
        },
        {
          text: 'Force bankruptcy (test bailout)',
          style: 'destructive',
          onPress: () => {
            devForceBankruptcy();
            router.back();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [
    devFreePlay,
    setDevFreePlay,
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

        {listingUrl ? (
          <Pressable onPress={openStoreListing} accessibilityRole="button">
            <ThemedView type="backgroundElement" style={styles.row}>
              <ThemedText type="default">Rate this game</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                ›
              </ThemedText>
            </ThemedView>
          </Pressable>
        ) : null}

        {purchasesAvailable ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              Purchases
            </ThemedText>
            {/*
              Apple expects a restore control in Settings as well as on the
              paywalls themselves — it's the first place a reviewer checks, and
              its absence is one of the most common Guideline 3.1.1 rejections.
            */}
            <RestorePurchasesButton source="settings" variant="secondary" />
          </>
        ) : null}

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Legal & Support
        </ThemedText>

        {LEGAL_LINKS.map((link) => (
          <Pressable
            key={link}
            onPress={() => openLegalLink(link, 'settings')}
            accessibilityRole="link"
            accessibilityLabel={LEGAL_LINK_LABELS[link]}>
            <ThemedView type="backgroundElement" style={styles.row}>
              <ThemedText type="default">{LEGAL_LINK_LABELS[link]}</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                ›
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Reset
        </ThemedText>

        <Pressable onPress={confirmNewGame} accessibilityRole="button">
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText type="default" themeColor="danger">
              New game
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              ›
            </ThemedText>
          </ThemedView>
        </Pressable>

        <Pressable onPress={confirmReplayIntro} accessibilityRole="button">
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText type="default">Replay intro</ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              ›
            </ThemedText>
          </ThemedView>
        </Pressable>

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
