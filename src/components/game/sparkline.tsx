import { Polyline, Svg } from 'react-native-svg';

/** Minimal line chart over a numeric series, e.g. weekly valuation. */
export function Sparkline({
  data,
  width = 280,
  height = 48,
  color = '#22c55e',
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) {
    return <Svg width={width} height={height} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}
