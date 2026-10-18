import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CliffhangerTeaser } from '@/state/day-close';
import { formatClockCountdown, nextWeekRegenAt, type WeekBudget } from '@/state/week-budget';

/**
 * The cliffhanger at the week wall: the card pinned to land next week, teased
 * by its hook rather than its choices, with the real wait until the next free
 * week and, where purchases work, a way to find out now.
 *
 * Shown for as long as the player sits at the wall, on every tab — unlike the
 * once-a-day closing panel, a player who comes back mid-wait still sees what
 * is waiting. The countdown is the chip's own clock (`nextWeekRegenAt`), so
 * the two never disagree; per plan 003, never "tomorrow" when the wait is 36
 * minutes.
 */
export function CliffhangerBanner({
  companyName,
  teaser,
  weekBudget,
  onFindOut,
}: {
  companyName: string;
  teaser: CliffhangerTeaser;
  weekBudget: WeekBudget | null;
  /** Present only where real purchases work; omit to render the wait alone. */
  onFindOut?: () => void;
}) {
  const theme = useTheme();
  const countdown = useCountdown(weekBudget);

  return (
    <ThemedView
      type="surfaceRaised"
      style={[styles.banner, { borderColor: theme.warning }]}
      accessibilityRole="summary"
      accessibilityLabel={`Next week at ${companyName}: ${teaser.line}${countdown ? ` Find out in ${countdown}.` : ''}`}>
      <ThemedText type="sectionLabel" style={{ color: theme.warning }} numberOfLines={1}>
        Next week…
      </ThemedText>
      <ThemedText type="smallBold">{teaser.line}</ThemedText>
      <View style={styles.footer}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.countdown}>
          {countdown ? `Find out in ${countdown}` : 'Find out next week'}
        </ThemedText>
        {onFindOut ? (
          <Pressable
            onPress={onFindOut}
            accessibilityRole="button"
            accessibilityLabel="Find out now. Get more weeks."
            style={({ pressed }) => [styles.cta, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.accentInk }}>
              Find out now
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

/** Live time to the next free week, read in effects rather than during render like the chip's clock. */
function useCountdown(weekBudget: WeekBudget | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const nextAt = weekBudget ? (nextWeekRegenAt(weekBudget)?.getTime() ?? null) : null;
    const update = () => setLabel(nextAt === null ? null : formatClockCountdown(Math.max(0, nextAt - Date.now())));
    const timer = setInterval(update, 1_000);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [weekBudget]);
  return label;
}

const styles = StyleSheet.create({
  banner: {
    gap: Spacing.one,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  countdown: {
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  cta: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
