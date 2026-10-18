import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { EVENTS, track } from '@/analytics/events';
import { Glow } from '@/components/game/glow';
import { SurfaceSheen } from '@/components/game/surface-sheen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { FEATURE_LABELS, FEATURE_TERMS, isGuided, nextQuest, unlockedFeatures, type Feature } from '@/game/unlocks';
import type { GameState } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { hudSlotAction, recommendedAction } from '@/lib/recommended-action';
import { purchasesAvailable } from '@/purchases';
import type { BuyWeeksTrigger } from '@/state/buy-weeks-flow';
import { useGame } from '@/state/game-store';
import { isWeekBudgetExhausted } from '@/state/week-budget';

/** How long the "Mission complete" beat holds before the next quest slides in. */
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
 * The guided first weeks' one pinned goal (plans/2026-10-18-first-weeks-journey-plan.md):
 * mission number, progress and reward, with the unlock moment above it and,
 * when the best move lives on another tab, a pill that takes you there.
 * Renders nothing outside a guided run, so existing saves are untouched.
 */
export function QuestStrip({
  freshUnlocks,
  onDismissUnlocks,
  onBuyWeeks,
}: {
  freshUnlocks: Feature[];
  onDismissUnlocks: () => void;
  onBuyWeeks: (trigger: BuyWeeksTrigger) => void;
}) {
  const { state, dispatch, weekBudget, purchasedWeeks, devFreePlay } = useGame();
  const theme = useTheme();
  const router = useRouter();
  const quest = state ? nextQuest(state) : null;

  // "Mission complete": when the pinned quest changes, hold the finished one
  // for a beat before the next slides in.
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

  const action = recommendedAction(state);
  const slotTaken = hudSlotAction(state) !== null;
  // The best move when it lives on another tab: a pill that takes you there.
  const goTo = action.id === 'raise' ? '/money' : action.id === 'hire-support' ? '/team' : null;
  const terms = freshUnlocks.flatMap((f) => FEATURE_TERMS[f] ?? []);

  // The HUD slot is showing a hire instead of Next Week; this is the way past
  // it for a player who'd rather not. Same behaviour as the Next Week chip.
  const skipWeek = () => {
    track(EVENTS.RECOMMENDED_ACTION_SKIPPED, { action: hudSlotAction(state)?.id ?? null });
    dispatch({ type: 'TICK' });
    if (isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay) && purchasesAvailable) onBuyWeeks('out_of_weeks');
  };

  if (!quest && !freshUnlocks.length && !goTo && !completed) return null;

  // Sits on the mission card's bottom row, so a busy week costs no extra height.
  const pill = goTo ? (
    <Glow on radius={Radius.pill}>
      <Pressable
        onPress={() => {
          track(EVENTS.RECOMMENDED_ACTION_TAPPED, { action: action.id });
          router.navigate(goTo);
        }}
        hitSlop={6}
        accessibilityRole="button"
        style={[styles.pill, { backgroundColor: theme.accent }]}>
        <ThemedText type="footnote" style={[styles.pillText, { color: theme.accentInk }]}>{action.label} ›</ThemedText>
      </Pressable>
    </Glow>
  ) : null;

  const format = (n: number) => (quest?.unit === 'money' ? formatMoney(n) : String(Math.floor(n)));

  return (
    <View style={styles.wrap}>
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

      {completed ? (
        <Animated.View
          key={`done-${completed}`}
          entering={FadeIn.duration(200)}
          style={[styles.quest, { backgroundColor: theme.successBackground, borderColor: theme.success }]}>
          <ThemedText type="sectionLabel" themeColor="success">Mission complete</ThemedText>
          <ThemedText type="smallBold">✓ {completed}</ThemedText>
        </Animated.View>
      ) : quest ? (
        <Animated.View
          key={quest.id}
          entering={FadeIn.duration(300)}
          style={[styles.quest, { backgroundColor: theme.accentSurface, borderColor: theme.accent }]}
          accessibilityLabel={`Mission ${quest.number} of ${quest.total}: ${quest.title}. ${format(quest.progress)} of ${format(quest.goal)}. ${quest.reward}.`}>
          <SurfaceSheen />
          <View style={styles.questTop}>
            <ThemedText type="sectionLabel" themeColor="accent">
              Mission {quest.number} of {quest.total}
            </ThemedText>
            <ThemedText type="smallBold">
              {format(quest.progress)} / {format(quest.goal)}
            </ThemedText>
          </View>
          <ThemedText type="smallBold" style={styles.title}>{quest.title}</ThemedText>
          <View style={[styles.track, { backgroundColor: theme.surfaceRaised }]}>
            <View
              style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.min(100, (quest.progress / quest.goal) * 100)}%` }]}
            />
          </View>
          <View style={styles.questBottom}>
            <ThemedText type="footnote" themeColor="textSecondary" style={styles.reward} numberOfLines={1}>
              → {quest.reward}
            </ThemedText>
            {slotTaken ? (
              <Pressable onPress={skipWeek} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip to next week">
                <ThemedText type="footnote" themeColor="textMuted">Skip week ›</ThemedText>
              </Pressable>
            ) : (
              pill
            )}
          </View>
        </Animated.View>
      ) : null}

      {goTo && !quest ? <View style={styles.pillAlone}>{pill}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  banner: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
  quest: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
    overflow: 'hidden',
  },
  questTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  questBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  reward: { flex: 1 },
  pillAlone: { alignSelf: 'flex-start' },
  pill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.two + Spacing.one, paddingVertical: Spacing.one },
  pillText: { fontWeight: '700' },
});
