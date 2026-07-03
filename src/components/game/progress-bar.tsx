import { StyleSheet, View } from 'react-native';

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
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      {markers?.map((marker) => (
        <View key={marker} style={[styles.marker, { left: `${Math.max(0, Math.min(100, marker))}%` }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#80808033',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#00000055',
  },
});
