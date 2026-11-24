import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { CliffhangerTeaser } from '@/state/day-close';

/**
 * The pinned card as the wall teases it: its title, its hook, the two choices
 * it will ask for — named only, never what each one does — and one line on
 * what's at stake. Shared by the wall banner, the closing panel, and the
 * fallback buy sheet so all three tell the same story.
 *
 * Title and hook are the one focal point; the choices and stakes sit under
 * them as quiet footnotes rather than a second row of widgets. The choices are
 * deliberately plain text, not buttons: nothing here is tappable, and the
 * accessibility label says so, so the curiosity gap stays a gap.
 */
export function CliffhangerCardPreview({
  teaser,
  size = 'default',
}: {
  teaser: CliffhangerTeaser;
  /**
   * `prominent` — the closing panel, where the card is the sheet's headline.
   * `default` — under another sheet's own title (the buy sheet).
   * `compact` — the wall banner: smaller type, fewer lines.
   */
  size?: 'prominent' | 'default' | 'compact';
}) {
  const compact = size === 'compact';
  const choices = [teaser.choiceA, teaser.choiceB].filter((label): label is string => !!label);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${teaser.title}. ${teaser.teaser} Locked choices: ${choices.join(', or ')}. ${teaser.stakes}`}>
      <ThemedText
        type={size === 'prominent' ? 'sheetTitle' : 'smallBold'}
        style={size === 'default' && styles.defaultTitle}
        numberOfLines={2}>
        {teaser.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={compact ? 2 : 3}>
        {teaser.teaser}
      </ThemedText>
      {choices.length > 0 ? (
        <ThemedText type="footnote" themeColor="textMuted" numberOfLines={2} style={styles.choices}>
          You&apos;ll choose:{' '}
          {choices.map((label, index) => (
            <Fragment key={`${index}-${label}`}>
              {index > 0 ? ' or ' : null}
              <ThemedText type="footnote" themeColor="textSecondary" testID={`cliffhanger-locked-choice-${index}`}>
                {label}
              </ThemedText>
            </Fragment>
          ))}
        </ThemedText>
      ) : null}
      <ThemedText type="footnote" themeColor="textMuted" numberOfLines={compact ? 1 : 2}>
        {teaser.stakes}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  defaultTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  choices: {
    marginTop: Spacing.half,
  },
});
