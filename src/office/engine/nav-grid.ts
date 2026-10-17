import { bbox, distToPolyEdge, pointInPoly } from './geometry';
import type { OfficeMap, Pt } from './types';

/** Grid cell size in image pixels. */
export const CELL = 5;
/** Person radius: walkable cells stay at least this far from any footprint edge. */
export const RADIUS = 9;
/** Walkable cells stay at least this far inside the floor outline. */
const FLOOR_MARGIN = 4;

export interface NavGrid {
  x0: number;
  y0: number;
  width: number;
  height: number;
  walkable: Uint8Array;
  /** Indices of every walkable cell, for random spawning and wandering. */
  walkCells: number[];
  cellCenter(index: number): Pt;
  isWalkable(x: number, y: number): boolean;
  /** The point itself if walkable, else the nearest walkable cell centre (null on an empty grid). */
  nearestWalkable(x: number, y: number): Pt | null;
}

export function buildNavGrid(map: OfficeMap): NavGrid {
  const box = bbox(map.floor);
  const x0 = Math.floor(box.x0);
  const y0 = Math.floor(box.y0);
  const width = Math.ceil((box.x1 - x0) / CELL);
  const height = Math.ceil((box.y1 - y0) / CELL);
  const walkable = new Uint8Array(width * height);
  const footprints = map.objects.map((o) => ({ poly: o.footprint, box: bbox(o.footprint) }));

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const x = x0 + gx * CELL + CELL / 2;
      const y = y0 + gy * CELL + CELL / 2;
      let ok = pointInPoly(x, y, map.floor) && distToPolyEdge(x, y, map.floor) > FLOOR_MARGIN;
      for (const f of footprints) {
        if (!ok) break;
        // Cheap reject before the exact edge-distance test.
        if (x < f.box.x0 - RADIUS || x > f.box.x1 + RADIUS || y < f.box.y0 - RADIUS || y > f.box.y1 + RADIUS) continue;
        if (pointInPoly(x, y, f.poly) || distToPolyEdge(x, y, f.poly) < RADIUS) ok = false;
      }
      walkable[gy * width + gx] = ok ? 1 : 0;
    }
  }

  const walkCells: number[] = [];
  for (let i = 0; i < walkable.length; i++) if (walkable[i]) walkCells.push(i);

  const cellCenter = (i: number): Pt => [x0 + (i % width) * CELL + CELL / 2, y0 + Math.floor(i / width) * CELL + CELL / 2];

  const isWalkable = (x: number, y: number) => {
    const gx = Math.floor((x - x0) / CELL);
    const gy = Math.floor((y - y0) / CELL);
    return gx >= 0 && gy >= 0 && gx < width && gy < height && walkable[gy * width + gx] === 1;
  };

  const nearestWalkable = (x: number, y: number): Pt | null => {
    if (isWalkable(x, y)) return [x, y];
    let best: Pt | null = null;
    let bestD = Infinity;
    for (const i of walkCells) {
      const [cx, cy] = cellCenter(i);
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [cx, cy];
      }
    }
    return best;
  };

  return { x0, y0, width, height, walkable, walkCells, cellCenter, isWalkable, nearestWalkable };
}

const gridCache = new Map<string, NavGrid>();

/** One nav grid per map id, built on first use. */
export function navGridFor(map: OfficeMap): NavGrid {
  let grid = gridCache.get(map.id);
  if (!grid) {
    grid = buildNavGrid(map);
    gridCache.set(map.id, grid);
  }
  return grid;
}
