import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GuideStep, GuideTarget } from '@/lib/guide';

export const CARET_HALF = 7;

/** The guided run's current step, worked out once in the tabs layout, and how to tap it away. */
export const GuideContext = createContext<{ step: GuideStep | null; dismiss: () => void }>({
  step: null,
  dismiss: () => {},
});

/** The step when it points at this control, else null. */
export function useGuideFor(match: (target: GuideTarget) => boolean): GuideStep | null {
  const { step } = useContext(GuideContext);
  return step && match(step.target) ? step : null;
}

/**
 * The coach's tooltip: the mission on a small line, the instruction in bold,
 * and a caret aimed at the control to tap. Always positioned absolutely by its
 * caller, so it floats over the screen instead of pushing it down. Only the
 * pill takes touches — tapping it hides the tooltip — so the control it points
 * at stays tappable.
 *
 * `align` picks which edge of the pill lines up with the caller's box;
 * `inset` is how far in from that edge the caret's centre sits.
 */
export function GuidePointer({
  step,
  caret,
  align,
  inset = 0,
  style,
}: {
  step: GuideStep;
  caret: 'up' | 'down';
  align: 'left' | 'center' | 'right';
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { dismiss } = useContext(GuideContext);
  const pulse = useSharedValue(0);
  const dimmed = step.dimmed ?? false;

  useEffect(() => {
    pulse.value = dimmed ? 0 : withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [dimmed, pulse]);
  // Pulses by size, not opacity: the tooltip sits over content, which mustn't show through it.
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.98 + pulse.value * 0.02 }] }));

  const fill = dimmed ? theme.surfaceRaised : theme.accent;
  const ink = dimmed ? theme.textSecondary : theme.accentInk;
  const alignSelf = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const caretOffset = Math.max(0, inset - CARET_HALF);
  const caretStyle = [
    caret === 'up' ? styles.caretUp : styles.caretDown,
    caret === 'up' ? { borderBottomColor: fill } : { borderTopColor: fill },
    { alignSelf } as const,
    align === 'left' ? { marginLeft: caretOffset } : align === 'right' ? { marginRight: caretOffset } : null,
  ];

  return (
    <Animated.View
      key={`${step.label}-${step.text}`}
      entering={FadeIn.duration(250)}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, style]}>
      {caret === 'up' ? <View pointerEvents="none" style={caretStyle} /> : null}
      <Pressable
        onPress={dismiss}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`${[step.label, step.text].filter(Boolean).join('. ')}. Tap to hide.`}
        style={{ alignSelf }}>
        <Animated.View
          style={[
            styles.pill,
            { backgroundColor: fill, alignSelf, minWidth: align === 'center' ? undefined : inset + CARET_HALF + Spacing.three },
            pulseStyle,
          ]}>
          {step.label ? (
            <ThemedText type="footnote" numberOfLines={1} style={{ color: ink, opacity: 0.85 }}>
              {step.label}
            </ThemedText>
          ) : null}
          <ThemedText type="smallBold" numberOfLines={2} style={{ color: ink }}>
            {step.text}
          </ThemedText>
        </Animated.View>
      </Pressable>
      {caret === 'down' ? <View pointerEvents="none" style={caretStyle} /> : null}
    </Animated.View>
  );
}

/**
 * Wraps a control and hangs the coach's tooltip just above (or below) it when
 * the step points here. Measures its own height rather than using a
 * percentage offset, which doesn't resolve reliably on iOS.
 */
export function GuideAnchor({
  step,
  place = 'above',
  align = 'center',
  inset,
  style,
  children,
}: {
  step: GuideStep | null;
  place?: 'above' | 'below';
  align?: 'left' | 'center' | 'right';
  inset?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [height, setHeight] = useState<number | null>(null);
  return (
    <View
      style={[style, step ? styles.raised : null]}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      {children}
      {step && height !== null ? (
        <GuidePointer
          step={step}
          caret={place === 'above' ? 'down' : 'up'}
          align={align}
          inset={inset}
          style={[styles.anchored, place === 'above' ? { bottom: height + Spacing.one } : { top: height + Spacing.one }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '100%' },
  raised: { zIndex: 20 },
  anchored: { position: 'absolute', left: 0, right: 0 },
  pill: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    maxWidth: 300,
  },
  caretUp: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderBottomWidth: CARET_HALF,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  caretDown: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderTopWidth: CARET_HALF,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
