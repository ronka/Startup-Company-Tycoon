import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { GameOverReason } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { useGame } from '@/state/game-store';

const HEADLINE: Record<GameOverReason, string> = {
  bankruptcy: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

const SUBTITLE: Record<GameOverReason, (weeks: number) => string> = {
  bankruptcy: (weeks) =>
    `Cash stayed negative too long — out of runway after ${weeks} weeks.`,
  acquired: (weeks) => `Acquired after ${weeks} weeks.`,
  ipo: (weeks) => `Rang the bell after ${weeks} weeks.`,
};

export default function GameOverScreen() {
  const { state } = useGame();
  const router = useRouter();
  const theme = useTheme();

  const reason = state?.gameOver ?? null;
  useEffect(() => {
    if (!reason) return;
    track(EVENTS.GAME_OVER_VIEWED, {
      reason,
      final_score: Math.round(state?.finalScore ?? 0),
      weeks: state?.week,
    });
  }, [reason, state?.finalScore, state?.week]);

  // Reached only when a run has actually ended.
  if (!state || !state.gameOver) return <Redirect href="/" />;

  const startFresh = () => {
    // This screen is presented as a modal (see app/_layout.tsx). Pushing
    // onboarding directly would stack it *inside* this modal's sheet container,
    // so it would open in a bottom sheet instead of full screen. Dismiss the
    // modal first, then push onboarding onto the clean root stack.
    router.dismissAll();
    router.push('/onboarding');
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.body}>
        <ThemedText type="title" style={styles.headline}>
          {HEADLINE[state.gameOver]}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {SUBTITLE[state.gameOver](state.week)}
        </ThemedText>
        <ThemedText type="title" style={styles.score}>
          {formatMoney(state.finalScore ?? 0)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">Final score</ThemedText>
      </View>
      <PrimaryButton label="New Game" onPress={startFresh} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  body: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  headline: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  score: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
});
