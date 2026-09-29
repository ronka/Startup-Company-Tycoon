import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppleSignInButton } from '@/components/game/apple-sign-in-button';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useGame } from '@/state/game-store';
import { useLeaderboard } from '@/state/leaderboard-provider';

/**
 * The one consent surface for publishing to the leaderboard, whichever door
 * the player came through (week 5, the HQ rank card, Settings). Says exactly
 * what goes public before anything does. Mounted once, in the game layout.
 */
export function LeaderboardJoinSheet() {
  const { state, account } = useGame();
  const { joinSource, rank, join, dismissJoin } = useLeaderboard();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const company = state?.companyName ?? 'Your startup';
  const signedIn = account.status === 'signed-in';

  const handleJoin = () => {
    if (pending) return;
    setError(null);
    setPending(true);
    join()
      .then((outcome) => {
        if (outcome === 'error') setError("Couldn't join right now — try again.");
      })
      .finally(() => setPending(false));
  };

  const close = () => {
    setError(null);
    dismissJoin('dismissed');
  };

  return (
    <BottomSheet visible={joinSource !== null} onClose={close} title="Join the leaderboard">
      <ThemedText type="default">
        {rank ? (
          <>
            Right now {company} would be{' '}
            <ThemedText type="default" themeColor="accent">
              #{rank.rank} of {rank.total}
            </ThemedText>
            . Put it on the board and see who you&apos;re up against.
          </>
        ) : (
          `Put ${company} on the global board and see how it stacks up against other founders.`
        )}
      </ThemedText>

      <Card style={styles.facts}>
        <ThemedText type="small" themeColor="textSecondary">
          Shown publicly
        </ThemedText>
        <ThemedText type="small">Company name, week, stage, status, and founder stake.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.gap}>
          Never shown
        </ThemedText>
        <ThemedText type="small">Your name, Apple ID, or email.</ThemedText>
      </Card>

      <View style={styles.actions}>
        {signedIn ? (
          <PrimaryButton label="Join leaderboard" onPress={handleJoin} loading={pending} />
        ) : (
          <AppleSignInButton onPress={handleJoin} />
        )}
        <PrimaryButton label="Not now" variant="ghost" onPress={close} disabled={pending} />
      </View>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textMuted">
        {signedIn ? '' : 'Signing in lets you manage your runs. '}You can stop publishing any time in Settings.
      </ThemedText>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  facts: {
    gap: Spacing.one,
  },
  gap: {
    marginTop: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
