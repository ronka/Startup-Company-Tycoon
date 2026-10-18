import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * "Do this one": a pulsing accent ring around the control the guided quest or
 * the recommended action needs. No text — the quest strip already said why.
 * Draws outside its child, so it never shifts layout when it turns on.
 */
export function Glow({
  on,
  radius = Radius.lg,
  inset = false,
  style,
  children,
}: {
  on: boolean;
  /** Match the wrapped control's corner radius. */
  radius?: number;
  /** Draw inside the control instead of around it — for controls in a clipped container. */
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={style}>
      {children}
      {on ? <Ring radius={radius} inset={inset} /> : null}
    </View>
  );
}

function Ring({ radius, inset }: { radius: number; inset: boolean }) {
  const theme = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.65 }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        { borderColor: theme.accent, borderRadius: inset ? radius - RING_GAP : radius + RING_GAP, margin: inset ? RING_GAP : -RING_GAP },
        pulseStyle,
      ]}
    />
  );
}

const RING_GAP = 3;

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2.5 },
});
