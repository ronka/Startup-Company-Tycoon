import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const ACCENT = '#3c87f7';

/**
 * A glowing pill that points at the control below it — used once, to aim a
 * brand-new player at the Next Week button (plan §4, B1).
 *
 * Deliberately *not* a `Modal`: the chrome already presents a decision card
 * and a recap sheet, and presenting a third modal alongside them is what
 * wedges iOS (see docs/bug-stuck-decision-modal.md). It renders in normal
 * flow directly above its target instead, so there's nothing to stack.
 *
 * Visibility is the caller's business (see `useFirstRunHint`), so the same
 * tap that acts on the target can also retire the hint.
 */
export function SpotlightHint({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.82 + pulse.value * 0.18,
    transform: [{ scale: 0.985 + pulse.value * 0.015 }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.wrapper}>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={`${text}. Tap to dismiss.`}>
        <Animated.View style={[styles.pill, pulseStyle]}>
          <ThemedText type="smallBold" style={styles.text}>
            {text}
          </ThemedText>
        </Animated.View>
        <View style={styles.caret} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.one,
  },
  pill: {
    backgroundColor: ACCENT,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  text: {
    color: '#ffffff',
    textAlign: 'center',
  },
  caret: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: ACCENT,
  },
});
