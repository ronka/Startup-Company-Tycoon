import { CELL, type NavGrid } from './nav-grid';
import type { Pt } from './types';

export function lineOfSight(grid: NavGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 2));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (!grid.isWalkable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/** Min-heap of [priority, cell] pairs. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(item: [number, number]) {
    const h = this.items;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const h = this.items;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* over the nav grid (8 directions, no corner-cutting), then string-pulled
 * so people walk straight lines instead of zig-zags. Returns the waypoints
 * after the start point, or null when either end is unwalkable/unreachable.
 */
export function findPath(grid: NavGrid, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  const { width: W, height: H, walkable, x0, y0 } = grid;
  const sgx = Math.floor((sx - x0) / CELL);
  const sgy = Math.floor((sy - y0) / CELL);
  const tgx = Math.floor((tx - x0) / CELL);
  const tgy = Math.floor((ty - y0) / CELL);
  if (sgx < 0 || sgy < 0 || sgx >= W || sgy >= H || tgx < 0 || tgy < 0 || tgx >= W || tgy >= H) return null;
  const start = sgy * W + sgx;
  const goal = tgy * W + tgx;
  if (!walkable[start] || !walkable[goal]) return null;

  const g = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const heap = new Heap();
  const h = (i: number) => Math.hypot((i % W) - tgx, Math.floor(i / W) - tgy);
  g[start] = 0;
  heap.push([0, start]);

  while (heap.size) {
    const [, cur] = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!walkable[n] || closed[n]) continue;
        // No corner-cutting: a diagonal needs both straight neighbours open.
        if (dx && dy && (!walkable[cy * W + nx] || !walkable[ny * W + cx])) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[n]) {
          g[n] = ng;
          came[n] = cur;
          heap.push([ng + h(n), n]);
        }
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;

  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map(grid.cellCenter);
  pts[pts.length - 1] = [tx, ty];

  // String-pull: from the last kept point, jump to the farthest visible waypoint.
  const out: Pt[] = [[sx, sy]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    const [lx, ly] = out[out.length - 1];
    while (j > i + 1 && !lineOfSight(grid, lx, ly, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out.slice(1);
}
