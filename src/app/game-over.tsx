import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { GameOverReason } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

const HEADLINE: Record<GameOverReason, string> = {
  bankruptcy: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

export default function GameOverScreen() {
  const { state, startNewGame } = useGame();
  const router = useRouter();
  const theme = useTheme();

  // Reached only when a run has actually ended.
  if (!state || !state.gameOver) return <Redirect href="/" />;

  const startFresh = () => {
    startNewGame();
    router.replace('/hq');
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.body}>
        <ThemedText type="title" style={styles.headline}>
          {HEADLINE[state.gameOver]}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          You survived {state.week} weeks before the money ran out.
        </ThemedText>
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
});
