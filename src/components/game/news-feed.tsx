import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import type { NewsEntry } from '@/game/events/types';
import { useTheme } from '@/hooks/use-theme';

/** Which token the leading status dot wears, by entry kind. */
function dotTone(entry: NewsEntry): ThemeColor {
  if (entry.kind === 'era') return 'accent';
  if (entry.kind === 'digest') return 'text';
  if (entry.kind === 'trend') return 'warning';
  return entry.choiceLabel ? 'warning' : 'textMuted';
}

export function NewsFeed({
  entries,
  variant = 'full',
}: {
  entries: NewsEntry[];
  /** `compact` is the dot-marked "this week" list on HQ; `full` is the card feed. */
  variant?: 'full' | 'compact';
}) {
  const theme = useTheme();

  if (entries.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No news yet — check back after a few weeks.
      </ThemedText>
    );
  }

  if (variant === 'compact') {
    return (
      <Card style={styles.compactCard}>
        {entries.map((entry, index) => (
          <View key={`${entry.week}-${entry.title}-${index}`} style={styles.compactRow}>
            <View style={[styles.dot, { backgroundColor: theme[dotTone(entry)] }]} />
            <View style={styles.compactText}>
              <ThemedText type="default" numberOfLines={2}>
                {entry.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {entry.choiceLabel ? `→ ${entry.choiceLabel}` : entry.flavor}
              </ThemedText>
            </View>
          </View>
        ))}
      </Card>
    );
  }

  return (
    <View style={styles.list}>
      {entries.map((entry, index) =>
        entry.kind === 'era' ? (
          <Card key={`${entry.week}-${entry.title}-${index}`} tone="accent" style={styles.eraItem}>
            <ThemedText type="smallBold" style={styles.eraFlavor}>
              {entry.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.eraFlavor}>
              {entry.flavor}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.eraFlavor}>
              Week {entry.week}
            </ThemedText>
          </Card>
        ) : (
          <Card key={`${entry.week}-${entry.title}-${index}`}>
            <View style={styles.itemHeader}>
              <View style={styles.itemTitleRow}>
                <View style={[styles.dot, { backgroundColor: theme[dotTone(entry)] }]} />
                <ThemedText type="smallBold">{entry.title}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textMuted">
                Week {entry.week}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {entry.flavor}
            </ThemedText>
            {entry.choiceLabel ? (
              <ThemedText type="small" themeColor="accent">
                → {entry.choiceLabel}
              </ThemedText>
            ) : null}
          </Card>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  compactCard: {
    gap: Spacing.three,
    borderRadius: Radius.lg,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  compactText: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  eraItem: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  eraFlavor: {
    textAlign: 'center',
  },
});
