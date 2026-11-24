import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CliffhangerTeaser } from '@/state/day-close';

/**
 * The pinned card as the wall teases it: its title, its hook, the two choices
 * it will ask for — shown locked, labels only, never what each one does — and
 * one line on what's at stake. Shared by the wall banner, the closing panel,
 * and the fallback buy sheet so all three tell the same story.
 *
 * The choices are deliberately not buttons: nothing here is tappable, and the
 * accessibility label says so, so the curiosity gap stays a gap.
 */
export function CliffhangerCardPreview({
  teaser,
  compact = false,
}: {
  teaser: CliffhangerTeaser;
  /** The wall banner's tighter layout: smaller type, one line per choice. */
  compact?: boolean;
}) {
  const theme = useTheme();
  const choices = [teaser.choiceA, teaser.choiceB].filter((label): label is string => !!label);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${teaser.title}. ${teaser.teaser} Locked choices: ${choices.join(', or ')}. ${teaser.stakes}`}>
      <ThemedText type={compact ? 'smallBold' : 'subtitle'} numberOfLines={2}>
        {teaser.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={compact ? 2 : 3}>
        {teaser.teaser}
      </ThemedText>
      <View style={styles.choices}>
        {choices.map((label, index) => (
          <View
            key={`${index}-${label}`}
            style={[styles.choice, { borderColor: theme.border, backgroundColor: theme.surface }]}
            testID={`cliffhanger-locked-choice-${index}`}>
            <ThemedText type="footnote" style={styles.lock}>
              🔒
            </ThemedText>
            <ThemedText type="footnote" themeColor="textSecondary" numberOfLines={compact ? 1 : 2} style={styles.label}>
              {label}
            </ThemedText>
          </View>
        ))}
      </View>
      <ThemedText type="footnote" style={{ color: theme.warning }} numberOfLines={2}>
        {teaser.stakes}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  choices: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.sm,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    opacity: 0.75,
  },
  lock: {
    opacity: 0.9,
  },
  label: {
    flexShrink: 1,
  },
});
