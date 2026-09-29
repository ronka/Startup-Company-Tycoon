import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLeaderboard } from '@/state/leaderboard-provider';

/**
 * HQ's "where do I stand" line: the run's live position on the public board,
 * shown to everyone — joined or not — because seeing the number is what makes
 * claiming it worth a tap. Hidden until a rank has loaded (offline, or a
 * website that doesn't serve the rank route yet), never a broken state.
 * The ✕ hides it for the rest of the run; the next company brings it back.
 */
export function LeaderboardRankCard() {
  const router = useRouter();
  const { rank, prefs, joined, canJoin, openJoin, rankCardDismissed, dismissRankCard } = useLeaderboard();
  if (!rank || !prefs || rankCardDismissed) return null;

  // Off iOS builds there's nothing to join, so the card just links to the board.
  const offerJoin = !joined && canJoin;

  const onPress = () => {
    track(EVENTS.LEADERBOARD_TEASER_TAPPED, {
      opted_in: joined,
      rank: rank.rank,
    });
    if (offerJoin) openJoin('hq');
    else router.push('/leaderboard');
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Leaderboard rank ${rank.rank} of ${rank.total}${offerJoin ? '. Join to claim it' : ''}`}>
      <Card tone={offerJoin ? 'accent' : 'default'} style={styles.card}>
        <ThemedText type="default">🏆</ThemedText>
        <View style={styles.body}>
          <ThemedText type="smallBold">
            #{rank.rank} of {rank.total}
            {offerJoin ? ' — if you were on the board' : ' on the leaderboard'}
          </ThemedText>
          {offerJoin ? (
            <ThemedText type="small" themeColor="textSecondary">
              Your spot isn&apos;t claimed yet.
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="smallBold" themeColor={offerJoin ? 'accent' : 'textSecondary'}>
          {offerJoin ? 'Join ›' : 'View ›'}
        </ThemedText>
        <Pressable
          onPress={dismissRankCard}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide leaderboard rank">
          <ThemedText type="small" themeColor="textMuted">
            ✕
          </ThemedText>
        </Pressable>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    gap: 2,
  },
});
