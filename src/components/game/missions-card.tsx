import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { ProgressBar } from '@/components/game/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { GameState } from '@/game/types';
import { questLadder, type LadderQuest } from '@/game/unlocks';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';

/** "3 / 5" or "$600 / $1.5K". */
function progressText(quest: LadderQuest): string {
  if (quest.unit === 'money') return `${formatMoney(quest.progress)} / ${formatMoney(quest.goal)}`;
  return `${Math.floor(quest.progress)} / ${quest.goal}`;
}

/**
 * The guided run's missions on HQ: the current one with its progress, one tap
 * from the whole ladder — what's done, what's next, and what each unlocks.
 * Renders nothing outside a guided run or once every mission is done.
 */
export function MissionsCard({ state }: { state: GameState }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ladder = questLadder(state);
  const current = ladder.find((q) => q.status === 'current');
  if (!current) return null;
  const doneCount = ladder.filter((q) => q.status === 'done').length;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Mission ${current.number} of ${current.total}: ${current.title}. Show all missions.`}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <ThemedText type="footnote" themeColor="textSecondary">
              🎯 Mission {current.number} of {current.total}
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

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Missions">
        <View style={styles.list}>
          {ladder.map((quest) => (
            <MissionRow key={quest.id} quest={quest} />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function MissionRow({ quest }: { quest: LadderQuest }) {
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
