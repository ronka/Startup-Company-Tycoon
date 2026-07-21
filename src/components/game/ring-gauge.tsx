import { StyleSheet, View } from 'react-native';
import { Circle, G, Svg } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Circular 0–100 meter: a muted track with a rounded arc over it, the value
 * centred inside and an optional caption underneath. Used for morale, where a
 * ring reads faster than another horizontal bar.
 */
export function RingGauge({
  percent,
  label,
  caption,
  tone = 'accent',
  size = 92,
  strokeWidth = 10,
}: {
  percent: number;
  /** Small word under the number, inside the ring (e.g. "team"). */
  label?: string;
  /** Word under the whole ring (e.g. "Morale"). */
  caption?: string;
  tone?: ThemeColor;
  size?: number;
  strokeWidth?: number;
}) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel={`${caption ?? label ?? 'Gauge'}: ${Math.round(pct)} of 100`}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={styles.svg}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.surfaceRaised}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Rotated as a group so the arc starts at 12 o'clock rather than 3.
              A `rotation` prop on the Circle itself renders an invalid
              `transform-origin` DOM attribute on react-native-svg's web build. */}
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme[tone]}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct / 100)}
              fill="none"
            />
          </G>
        </Svg>
        <View style={[styles.center, { width: size, height: size }]}>
          <ThemedText type="cardValue">{Math.round(pct)}</ThemedText>
          {label ? (
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {caption ? (
        <ThemedText type="small" themeColor="textSecondary">
          {caption}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
