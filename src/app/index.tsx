import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

export default function StartMenu() {
  const { state, loading, startNewGame } = useGame();
  const router = useRouter();
  const theme = useTheme();

  const inProgress = state != null && state.gameOver == null;

  const newGame = () => {
    startNewGame();
    router.replace('/hq');
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.title}>
          Startup{'\n'}Tycoon
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
                onPress={() => router.replace('/hq')}
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
