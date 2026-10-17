import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import { CELL, navGridFor } from '../engine/nav-grid';
import type { OfficeMap, Pt } from '../engine/types';

const points = (poly: Pt[]) => poly.map(([x, y]) => `${x},${y}`).join(' ');

/**
 * Dev-only nav overlay, mirroring the prototype's "Show nav map": walkable
 * cells (green), silhouettes (red), footprints (blue), front walls (magenta)
 * and POIs (dots). This is how new maps get checked.
 */
export function OfficeDebugOverlay({ map }: { map: OfficeMap }) {
  const cells = useMemo(() => {
    const grid = navGridFor(map);
    return grid.walkCells
      .map((i) => {
        const [x, y] = grid.cellCenter(i);
        return `M${x - CELL / 2 + 0.5},${y - CELL / 2 + 0.5}h${CELL - 1}v${CELL - 1}h${1 - CELL}z`;
      })
      .join('');
  }, [map]);

  return (
    <Svg
      width={map.imageWidth}
      height={map.imageHeight}
      viewBox={`0 0 ${map.imageWidth} ${map.imageHeight}`}
      style={[StyleSheet.absoluteFill, { zIndex: 10_000 }]}
      pointerEvents="none">
      <Path d={cells} fill="rgba(60,170,120,0.3)" />
      <Polygon points={points(map.floor)} fill="none" stroke="rgba(0,120,0,0.9)" strokeWidth={2} />
      {map.objects.map((o) => (
        <Polygon key={`s-${o.id}`} points={points(o.silhouette)} fill="none" stroke="rgba(220,60,60,0.9)" strokeWidth={1.5} />
      ))}
      {map.objects.map((o) => (
        <Polygon key={`f-${o.id}`} points={points(o.footprint)} fill="none" stroke="rgba(40,80,220,0.9)" strokeWidth={1.5} />
      ))}
      {map.frontWalls.map((w, i) => (
        <Polygon key={`w-${i}`} points={points(w)} fill="none" stroke="rgba(200,0,200,0.9)" strokeWidth={2} />
      ))}
      {map.pois.map((p, i) => (
        <Circle key={`p-${i}`} cx={p.x} cy={p.y} r={4} fill="#d33" />
      ))}
    </Svg>
  );
}
