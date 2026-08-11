import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

/**
 * Whether this launch has already made its auto-continue decision. Module-level
 * (not a ref) so it survives this screen unmounting: the redirect below should
 * fire once per app launch, not every time something navigates back to `/`.
 * Without it, `game-over.tsx`'s `<Redirect href="/" />` — used when a run is
 * revived — would be bounced straight back into the game.
 */
let autoContinued = false;

export default function StartMenu() {
  const { state, loading, saveLoaded } = useGame();
  const router = useRouter();
  const theme = useTheme();

  const inProgress = state != null && state.gameOver == null;
  // Captured once, at mount: is this the launch mount that gets to auto-continue?
  // Held in state rather than read off the module flag every render, because the
  // effect below claims that flag mid-mount — re-reading it would flip this
  // screen back to the menu for the frame between the redirect and the unmount.
  const [isLaunchMount] = useState(() => !autoContinued);
  // A save exists, so this launch resumes instead of asking. `state != null` on
  // purpose rather than `inProgress`: an already-ended run also goes through
  // `/hq`, whose own guard forwards to `/game-over`, which puts the recap back
  // on screen exactly as it was presented when the run ended.
  const resuming = isLaunchMount && saveLoaded && state != null;

  // Drop a returning player straight back into their game on launch.
  useEffect(() => {
    if (!saveLoaded || autoContinued) return;
    autoContinued = true;
    if (state == null) return;
    track(EVENTS.CONTINUE_RUN_TAPPED, { week: state.week, source: 'auto' });
    router.replace('/hq');
  }, [saveLoaded, state, router]);

  const newGame = () => {
    track(EVENTS.NEW_GAME_TAPPED, { has_run_in_progress: inProgress, source: 'start_menu' });
    router.push('/onboarding');
  };

  const continueRun = () => {
    track(EVENTS.CONTINUE_RUN_TAPPED, { week: state?.week, source: 'start_menu' });
    router.replace('/hq');
  };

  // Nothing to show while the save is still being read, or when we already know
  // we're about to redirect — the splash stays up until then (see `_layout.tsx`),
  // so the title screen never flashes past a returning player.
  if (!saveLoaded || resuming) return null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.title}>
          Startup{'\n'}Empire{'\n'}Tycoon
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.tagline}>
          Found a company. Make the weekly calls. Reach the exit before the cash runs out.
        </ThemedText>
      </View>

      <View style={styles.actions}>
        {loading ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <>
            {inProgress ? (
              <PrimaryButton
                label={`Continue — Week ${state!.week}`}
                onPress={continueRun}
              />
            ) : null}
            <PrimaryButton
              label="New Game"
              variant={inProgress ? 'secondary' : 'primary'}
              onPress={newGame}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    fontSize: 56,
    lineHeight: 58,
  },
  tagline: {
    fontSize: 18,
    lineHeight: 26,
  },
  actions: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
});
