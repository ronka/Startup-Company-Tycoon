import type { NavGrid } from './nav-grid';
import { findPath, lineOfSight } from './pathfinding';
import type { OfficePoi, Pt } from './types';

export const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#9a6545', '#6e4630', '#f6d8c0'];
export const HAIR = ['#2b2420', '#5a3b28', '#8b5a2b', '#c9a066', '#1f1f2a', '#a3a3a3', '#b5452f'];
export const SHIRT = ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#9c6ade', '#ef8fa0', '#4f9dc4', '#e9a23b', '#5b8c5a', '#ffffff'];
export const PANTS = ['#2f3e56', '#444444', '#5d4a3a', '#2c4a3e', '#6b6b7a', '#1f2a44'];

/** Returns a float in [0, 1). Injected so tests can be deterministic. */
export type Random = () => number;

const pick = <T,>(rand: Random, items: readonly T[]): T => items[Math.floor(rand() * items.length)];

export interface PersonLook {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  longHair: boolean;
}

export interface PersonContext {
  grid: NavGrid;
  pois: readonly OfficePoi[];
  rand: Random;
}

/**
 * One walker. A small state machine: `waiting` → pick a target → walk the
 * path → arrive → `waiting`. Ported 1:1 from the office-roamers prototype.
 */
export class Person {
  readonly id: number;
  /** Optional link to a real employee, for a later "tap a person" feature. */
  employeeId?: string;
  x: number;
  y: number;
  readonly look: PersonLook;
  readonly scale: number;
  readonly speed: number;
  phase: number;
  facing: 1 | -1;
  back = false;
  moving = false;
  path: Pt[] = [];
  goal: string | null = null;
  wait: number;
  alpha = 0;
  leaving = false;
  mug = false;
  stuck = 0;
  /** Set after a side-step: the straight line to the next waypoint may now cross furniture. */
  private displaced = false;

  constructor(id: number, ctx: PersonContext, spawn?: Pt) {
    const { rand } = ctx;
    this.id = id;
    const [x, y] = spawn ?? randomSpot(ctx);
    this.x = x;
    this.y = y;
    this.look = {
      skin: pick(rand, SKIN),
      hair: pick(rand, HAIR),
      shirt: pick(rand, SHIRT),
      pants: pick(rand, PANTS),
      longHair: rand() < 0.4,
    };
    this.scale = 0.9 + rand() * 0.2;
    this.speed = 30 + rand() * 18; // px per second
    this.phase = rand() * 10;
    this.facing = rand() < 0.5 ? -1 : 1;
    this.wait = rand() * 2;
  }

  private chooseTarget(ctx: PersonContext) {
    const { grid, pois, rand } = ctx;
    let target: Pt | null;
    let kind: string | null = null;
    if (pois.length && rand() < 0.55) {
      const poi = pick(rand, pois);
      target = grid.nearestWalkable(poi.x + (rand() - 0.5) * 14, poi.y + (rand() - 0.5) * 10);
      kind = poi.kind;
    } else {
      target = randomSpot(ctx);
    }
    const path = target ? findPath(grid, this.x, this.y, target[0], target[1]) : null;
    if (path && path.length) {
      this.path = path;
      this.goal = kind;
    } else {
      this.wait = 0.5;
    }
  }

  update(dt: number, people: readonly Person[], ctx: PersonContext) {
    const { grid, rand } = ctx;
    this.alpha = Math.min(1, Math.max(0, this.alpha + (this.leaving ? -dt * 2 : dt * 2)));
    if (this.wait > 0) {
      this.wait -= dt;
      this.moving = false;
      if (this.wait <= 0) this.chooseTarget(ctx);
      return;
    }
    if (!this.path.length) {
      this.moving = false;
      if (this.goal === 'coffee') this.mug = true;
      if (this.goal === 'lounge' || this.goal === 'desk') this.mug = this.mug && rand() < 0.6;
      this.wait = 1.5 + rand() * 4;
      if (this.goal === 'coffee' || this.goal === 'desk') this.back = rand() < 0.5;
      return;
    }
    const [tx, ty] = this.path[0];
    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step) {
      this.x = tx;
      this.y = ty;
      this.path.shift();
      return;
    }
    dx /= d;
    dy /= d;

    // Yield to people right in front of us. The floor is isometric, so
    // vertical screen distance counts for more.
    let blocked = false;
    for (const o of people) {
      if (o === this || o.leaving) continue;
      const ox = o.x - this.x;
      const oy = (o.y - this.y) * 1.6;
      const od = Math.hypot(ox, oy);
      if (od < 18 && ox * dx + oy * dy > 0) {
        // Lower id keeps walking, higher id steps aside.
        if (o.id < this.id || !o.moving) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) {
      this.stuck += dt;
      const sx = this.x - dy * step * 0.8;
      const sy = this.y + dx * step * 0.8;
      if (grid.isWalkable(sx, sy)) {
        this.x = sx;
        this.y = sy;
        this.displaced = true;
      }
      if (this.stuck > 1.2) {
        this.stuck = 0;
        this.path = [];
        this.goal = null;
        this.wait = 0.3 + rand();
      }
      this.moving = true;
      this.phase += dt * 6;
      return;
    }
    this.stuck = 0;
    if (this.displaced) {
      // Not in the prototype: it walked straight back to the waypoint, which
      // could clip a desk corner. Re-plan to the destination when blocked.
      this.displaced = false;
      if (!lineOfSight(grid, this.x, this.y, tx, ty)) {
        const [gx, gy] = this.path[this.path.length - 1];
        const path = findPath(grid, this.x, this.y, gx, gy);
        if (path && path.length) this.path = path;
        else {
          this.path = [];
          this.goal = null;
          this.wait = 0.3 + rand();
        }
        return;
      }
    }
    this.x += dx * step;
    this.y += dy * step;
    this.moving = true;
    this.phase += dt * this.speed * 0.28;
    if (Math.abs(dx) > 0.15) this.facing = dx < 0 ? -1 : 1;
    this.back = dy < -0.2;
  }
}

export function randomSpot({ grid, rand }: PersonContext): Pt {
  if (!grid.walkCells.length) return [grid.x0, grid.y0];
  return grid.cellCenter(pick(rand, grid.walkCells));
}
