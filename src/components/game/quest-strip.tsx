import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { FEATURE_LABELS, FEATURE_TERMS, isGuided, nextQuest, unlockedFeatures, type Feature } from '@/game/unlocks';
import type { GameState } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

/** How long the "Mission complete" banner holds. */
const COMPLETE_BEAT_MS = 1800;

/**
 * Features a guided run unlocked since this screen last looked — the unlock
 * "moment". Held until the player taps the banner or the week advances, so
 * flipping tabs can't make you miss it. A hydrate or a new run starts clean:
 * only unlocks you were here to see count.
 */
export function useUnlockMoment(state: GameState | null): [Feature[], () => void] {
  const [fresh, setFresh] = useState<Feature[]>([]);
  const [seen, setSeen] = useState<{ seed: number; week: number; unlocked: Feature[] } | null>(null);

  // Adjusting state while rendering (not in an effect), so the moment lands in
  // the same frame as the unlock.
  const now = state && isGuided(state) ? { seed: state.createdWithSeed, week: state.week, unlocked: [...unlockedFeatures(state)] } : null;
  const changed =
    now?.seed !== seen?.seed || now?.week !== seen?.week || now?.unlocked.length !== seen?.unlocked.length;
  if (changed) {
    setSeen(now);
    if (!now || !seen || seen.seed !== now.seed) {
      if (fresh.length) setFresh([]);
    } else {
      const added = now.unlocked.filter((f) => !seen.unlocked.includes(f));
      // The week that unlocks something is also the week that clears the last
      // unlock, so a new week replaces the moment rather than adding to it.
      if (now.week > seen.week) setFresh(added);
      else if (added.length) setFresh([...fresh, ...added]);
    }
  }

  return [fresh, () => setFresh([])];
}

/**
 * The guided run's moments, hanging under the Hud over the screen: the unlock
 * banner and the "Mission complete" beat. The mission itself and what to do
 * next ride on the coach's tooltip (`GuidePointer`), which points at the
 * actual control to tap. Renders nothing outside a guided run.
 */
export function QuestStrip({
  freshUnlocks,
  onDismissUnlocks,
}: {
  freshUnlocks: Feature[];
  onDismissUnlocks: () => void;
}) {
  const { state } = useGame();
  const theme = useTheme();
  const quest = state ? nextQuest(state) : null;

  // "Mission complete": when the pinned quest changes, hold the finished one
  // for a beat.
  const [completed, setCompleted] = useState<string | null>(null);
  const [pinned, setPinned] = useState<{ seed: number; id: string; title: string } | null>(null);
  const nowPinned = state && quest ? { seed: state.createdWithSeed, id: quest.id, title: quest.title } : null;
  if (nowPinned?.id !== pinned?.id || nowPinned?.seed !== pinned?.seed) {
    setPinned(nowPinned);
    if (pinned && state && pinned.seed === state.createdWithSeed) setCompleted(pinned.title);
  }
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => setCompleted(null), COMPLETE_BEAT_MS);
    return () => clearTimeout(timer);
  }, [completed]);

  if (!state || !isGuided(state) || state.gameOver) return null;
  if (!freshUnlocks.length && !completed) return null;

  const terms = freshUnlocks.flatMap((f) => FEATURE_TERMS[f] ?? []);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {completed ? (
        <Animated.View
          key={`done-${completed}`}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={[styles.banner, { backgroundColor: theme.successBackground, borderColor: theme.success }]}>
          <ThemedText type="sectionLabel" themeColor="success">Mission complete</ThemedText>
          <ThemedText type="smallBold">✓ {completed}</ThemedText>
        </Animated.View>
      ) : null}

      {freshUnlocks.length ? (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
          <Pressable
            onPress={onDismissUnlocks}
            accessibilityRole="button"
            accessibilityLabel={`Unlocked: ${freshUnlocks.map((f) => FEATURE_LABELS[f]).join(' and ')}. Tap to dismiss.`}
            style={[styles.banner, { backgroundColor: theme.successBackground, borderColor: theme.success }]}>
            <ThemedText type="smallBold" themeColor="success">
              🔓 Unlocked: {freshUnlocks.map((f) => FEATURE_LABELS[f]).join(' + ')}
            </ThemedText>
            {terms.length ? (
              <ThemedText type="footnote" themeColor="textSecondary">New terms: {terms.join(', ')}</ThemedText>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  banner: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
});
