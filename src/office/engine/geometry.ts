import type { Pt } from './types';

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function pointInPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function distToPolyEdge(x: number, y: number, poly: readonly Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(x, y, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/**
 * Lowest (largest y) point of a polygon's outline at a given x, with x clamped
 * into the polygon's x-range. A person whose feet are above this line is
 * behind the object — this handles someone standing beside a desk correctly,
 * where sorting by one y value per object does not.
 */
export function frontEdgeY(poly: readonly Pt[], x: number): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [px] of poly) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
  }
  const cx = Math.max(minX + 0.01, Math.min(maxX - 0.01, x));
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if ((ax <= cx && cx <= bx) || (bx <= cx && cx <= ax)) {
      const y = ax === bx ? Math.max(ay, by) : ay + ((by - ay) * (cx - ax)) / (bx - ax);
      best = Math.max(best, y);
    }
  }
  return best;
}

export function bbox(poly: readonly Pt[]): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}
