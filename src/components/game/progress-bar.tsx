import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function ProgressBar({
  percent,
  color,
  markers,
}: {
  percent: number;
  color: string;
  /** Percent positions (0–100) to render as thin danger-threshold tick marks over the bar. */
  markers?: number[];
}) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceRaised }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      {markers?.map((marker) => (
        <View
          key={marker}
          style={[
            styles.marker,
            { left: `${Math.max(0, Math.min(100, marker))}%`, backgroundColor: theme.background },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
});
