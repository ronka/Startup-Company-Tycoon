import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type TextStyle } from 'react-native';

import { themedTextStyles, type ThemedTextProps } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * Renders a formatted number that count-up/down animates and flashes
 * green/red whenever `value` changes after the initial mount. Never
 * animates on first render, so plain navigation to an already-mounted
 * screen shows the static value.
 *
 * Built on core `Animated.Text` (not `ThemedText`) because only components
 * wrapped by `Animated.createAnimatedComponent` can consume an interpolated
 * Animated value as a style prop — passing one through a plain `Text`
 * silently drops it.
 */
export function AnimatedNumber({
  value,
  format,
  goodDirection = 'up',
  type = 'default',
  themeColor,
  style,
}: {
  value: number;
  format: (n: number) => string;
  /** Which direction of change should flash/read as "good" (green) vs "bad" (red). */
  goodDirection?: 'up' | 'down';
  type?: ThemedTextProps['type'];
  themeColor?: ThemedTextProps['themeColor'];
  style?: TextStyle;
}) {
  const theme = useTheme();
  const mounted = useRef(false);
  const prevValue = useRef(value);
  const [display, setDisplay] = useState(value);
  const [flashColor, setFlashColor] = useState<'success' | 'danger' | null>(null);
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prevValue.current = value;
      setDisplay(value);
      return;
    }

    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    if (from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
      setDisplay(to);
      return;
    }

    const isGood = to > from ? goodDirection === 'up' : goodDirection === 'down';
    setFlashColor(isGood ? 'success' : 'danger');

    const progress = new Animated.Value(0);
    const listenerId = progress.addListener(({ value: t }) => {
      setDisplay(from + (to - from) * t);
    });
    flash.setValue(1);

    Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(flash, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(() => {
      progress.removeListener(listenerId);
      setDisplay(to);
    });

    return () => progress.removeListener(listenerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const baseColor = theme[themeColor ?? 'text'];
  const animatedColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [baseColor, theme[flashColor === 'danger' ? 'danger' : 'success']],
  });

  return (
    <Animated.Text style={[themedTextStyles[type ?? 'default'], style, { color: animatedColor }]}>
      {format(display)}
    </Animated.Text>
  );
}
