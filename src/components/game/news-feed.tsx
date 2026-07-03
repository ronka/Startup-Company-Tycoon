import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { NewsEntry } from '@/game/events/types';

export function NewsFeed({ entries }: { entries: NewsEntry[] }) {
  if (entries.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No news yet — check back after a few weeks.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {entries.map((entry, index) => (
        <ThemedView
          key={`${entry.week}-${entry.title}-${index}`}
          type="backgroundElement"
          style={styles.item}>
          <View style={styles.itemHeader}>
            <ThemedText type="smallBold">{entry.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Week {entry.week}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {entry.flavor}
          </ThemedText>
          {entry.choiceLabel ? (
            <ThemedText type="small" style={styles.choice}>
              → {entry.choiceLabel}
            </ThemedText>
          ) : null}
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  item: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  choice: {
    color: '#3c87f7',
  },
});
