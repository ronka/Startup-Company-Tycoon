import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { nextWeekCaretFromRight } from '@/components/game/hud';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { QuestProgress } from '@/game/unlocks';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';

const CARET_HALF = 7;

/** "2/5 customers", "$600 / $1.5K a month". */
function progressText(quest: QuestProgress): string {
  if (quest.unit === 'money') return `${formatMoney(quest.progress)} / ${formatMoney(quest.goal)} a month`;
  return `${Math.floor(quest.progress)}/${quest.goal} customer${quest.goal === 1 ? '' : 's'}`;
}

/**
 * The mission while the only move is to play weeks (`questToPlay`): a small
 * bubble hanging off the Hud's Next Week chip, which glows alongside it. It
 * replaces the full mission card, so the screen says one thing — tap Next
 * Week — and how far there is to go.
 *
 * Out of free weeks, "tap Next Week" would only open the paywall, so the
 * bubble greys out and keeps just the progress.
 */
export function NextWeekBubble({ quest, atWall }: { quest: QuestProgress; atWall: boolean }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = atWall ? 0 : withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [atWall, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.85 + pulse.value * 0.15 }));

  const fill = atWall ? theme.surfaceRaised : theme.accent;
  const ink = atWall ? theme.textSecondary : theme.accentInk;
  const text = `🎯 ${progressText(quest)} · ${atWall ? 'more weeks soon' : 'tap Next Week'}`;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.wrap} accessibilityLabel={`${quest.title}: ${text}`}>
      <View
        style={[
          styles.caret,
          { borderBottomColor: fill, marginRight: Math.max(0, nextWeekCaretFromRight(width) - CARET_HALF) },
        ]}
      />
      <Animated.View style={[styles.bubble, { backgroundColor: fill }, pulseStyle]}>
        <ThemedText type="footnote" style={[styles.text, { color: ink }]}>
          {text}
        </ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Tucked up under the Hud's bottom padding so the caret meets the chip.
  wrap: { alignItems: 'flex-end', marginTop: -Spacing.one },
  caret: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderBottomWidth: CARET_HALF,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  bubble: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  text: { fontWeight: '700' },
});
