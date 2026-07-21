import { Defs, LinearGradient, Path, Polyline, Stop, Svg } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * Minimal line chart over a numeric series (e.g. weekly valuation), with a
 * gradient area fill under the line. Pass `width` from the parent's `onLayout`
 * so it spans its card.
 */
export function Sparkline({
  data,
  width = 280,
  height = 64,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const theme = useTheme();
  const stroke = color ?? theme.text;

  if (data.length < 2 || width <= 0) {
    return <Svg width={Math.max(0, width)} height={height} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  // Inset so the round stroke cap isn't clipped at the top and bottom edges.
  const inset = 2;
  const plotHeight = height - inset * 2;

  const coords = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = inset + plotHeight - ((value - min) / span) * plotHeight;
    return { x, y };
  });

  const points = coords.map(({ x, y }) => `${x},${y}`).join(' ');
  const area = `M ${coords[0].x},${height} L ${coords.map(({ x, y }) => `${x},${y}`).join(' L ')} L ${
    coords[coords.length - 1].x
  },${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#sparkFill)" />
      <Polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
