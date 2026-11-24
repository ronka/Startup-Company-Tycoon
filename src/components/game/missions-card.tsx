import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { ProgressBar } from '@/components/game/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { arcLadder } from '@/game/arcs';
import type { GameState } from '@/game/types';
import { questLadder } from '@/game/unlocks';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';

/** One mission row, from either ladder. */
interface MissionView {
  id: string;
  number: number;
  total: number;
  title: string;
  progress: number;
  goal: number;
  unit: 'count' | 'money' | 'weeks';
  reward: string;
  status: 'done' | 'current' | 'upcoming';
}

/** What the card shows: the guided first ladder, or the current chapter's. */
interface LadderView {
  /** "Mission 2 of 6" or "Chapter 2 · Mission 2 of 5". */
  eyebrow: (current: MissionView) => string;
  sheetTitle: string;
  /** A line under the sheet title naming the chapter's goal; guided runs have none. */
  sheetIntro: string | null;
  missions: MissionView[];
  analytics: Record<string, string | number>;
}

/** "3 / 5", "$600 / $1.5K", or "5 / 8 wks". */
function progressText(quest: MissionView): string {
  if (quest.unit === 'money') return `${formatMoney(quest.progress)} / ${formatMoney(quest.goal)}`;
  if (quest.unit === 'weeks') return `${Math.floor(quest.progress)} / ${quest.goal} wks`;
  return `${Math.floor(quest.progress)} / ${quest.goal}`;
}

/**
 * The guided ladder while it lasts; after it (and for every non-guided run or
 * older save) the current chapter's ladder — weeks 11–20 is "Find
 * product-market fit", ending on the week 20 decision.
 */
function ladderViewFor(state: GameState): LadderView | null {
  const guided = questLadder(state);
  if (guided.some((quest) => quest.status === 'current')) {
    return {
      eyebrow: (current) => `🎯 Mission ${current.number} of ${current.total}`,
      sheetTitle: 'Missions',
      sheetIntro: null,
      missions: guided,
      analytics: {},
    };
  }
  const arc = arcLadder(state);
  if (!arc) return null;
  return {
    eyebrow: (current) => `🎯 Chapter ${arc.chapterNumber} · ${current.number} of ${current.total}`,
    sheetTitle: `Chapter ${arc.chapterNumber}: ${arc.title}`,
    sheetIntro: arc.goalLine,
    missions: arc.missions,
    analytics: { arc_id: arc.id, arc_index: arc.arcIndex },
  };
}

/**
 * The run's missions on HQ: the current one with its progress, one tap from
 * the whole ladder — what's done, what's next, and what each gives. Renders
 * nothing once every mission in the current ladder is done (a chapter whose
 * capstone has been pinned waits there for the next chapter to begin).
 */
export function MissionsCard({ state }: { state: GameState }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const view = ladderViewFor(state);
  const current = view?.missions.find((q) => q.status === 'current');
  if (!view || !current) return null;
  const doneCount = view.missions.filter((q) => q.status === 'done').length;
  const eyebrow = view.eyebrow(current);

  return (
    <>
      <Pressable
        onPress={() => {
          track(EVENTS.MISSIONS_VIEWED, {
            quest: current.id,
            mission_number: current.number,
            done_count: doneCount,
            week: state.week,
            ...view.analytics,
          });
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${eyebrow.replace('🎯 ', '')}: ${current.title}. Show all missions.`}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <ThemedText type="footnote" themeColor="textSecondary" numberOfLines={1} style={styles.title}>
              {eyebrow}
            </ThemedText>
            <ThemedText type="footnote" themeColor="accent">
              {doneCount} done · All missions ›
            </ThemedText>
          </View>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
              {current.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{progressText(current)}</ThemedText>
          </View>
          <ProgressBar percent={(current.progress / current.goal) * 100} color={theme.accent} />
        </Card>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={view.sheetTitle}>
        {view.sheetIntro ? (
          <ThemedText type="small" themeColor="textSecondary">
            {view.sheetIntro}
          </ThemedText>
        ) : null}
        <View style={styles.list}>
          {view.missions.map((quest) => (
            <MissionRow key={quest.id} quest={quest} />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function MissionRow({ quest }: { quest: MissionView }) {
  const theme = useTheme();
  const done = quest.status === 'done';
  const current = quest.status === 'current';
  return (
    <Card tone={current ? 'accent' : 'default'} style={[styles.row, quest.status === 'upcoming' && styles.upcoming]}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" themeColor={done ? 'success' : 'text'} numberOfLines={1} style={styles.title}>
          {done ? '✓' : `${quest.number}.`} {quest.title}
        </ThemedText>
        {done ? null : (
          <ThemedText type="small" themeColor="textSecondary">{progressText(quest)}</ThemedText>
        )}
      </View>
      <ThemedText type="footnote" themeColor="textSecondary">{quest.reward}</ThemedText>
      {current ? <ProgressBar percent={(quest.progress / quest.goal) * 100} color={theme.accent} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.two, gap: Spacing.one },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { flexShrink: 1 },
  list: { gap: Spacing.two },
  row: { padding: Spacing.two, gap: Spacing.one },
  upcoming: { opacity: 0.6 },
});
