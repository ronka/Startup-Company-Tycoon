import { describe, expect, it } from 'vitest';

import { frontEdgeY, pointInPoly } from '../engine/geometry';
import { buildNavGrid } from '../engine/nav-grid';
import { findPath } from '../engine/pathfinding';
import { createSimulation, depthLayers, isBehind, withBoxes } from '../engine/simulation';
import type { OfficeMap } from '../engine/types';
import prototype from './prototype-office.json';

/** The fully traced office from the office-roamers prototype. */
const MAP = { ...prototype, tier: 1 } as unknown as OfficeMap;

/** Deterministic PRNG (mulberry32) so walks replay identically. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('nav grid', () => {
  const grid = buildNavGrid(MAP);

  it('has walkable floor', () => {
    expect(grid.walkCells.length).toBeGreaterThan(500);
  });

  it('excludes every furniture footprint', () => {
    for (const i of grid.walkCells) {
      const [x, y] = grid.cellCenter(i);
      expect(pointInPoly(x, y, MAP.floor)).toBe(true);
      for (const o of MAP.objects) expect(pointInPoly(x, y, o.footprint)).toBe(false);
    }
  });

  it('still works with no traced objects (placeholder maps)', () => {
    const bare = buildNavGrid({ ...MAP, id: 'bare', objects: [], pois: [] });
    expect(bare.walkCells.length).toBeGreaterThan(grid.walkCells.length);
    const sim = createSimulation({ ...MAP, id: 'bare', objects: [], pois: [] }, seeded(1));
    sim.setCount(5);
    for (let i = 0; i < 200; i++) sim.step(0.05);
    expect(sim.people.every((p) => bare.isWalkable(p.x, p.y))).toBe(true);
  });
});

describe('findPath', () => {
  const grid = buildNavGrid(MAP);

  it('never returns a waypoint or segment outside walkable cells', () => {
    const rand = seeded(7);
    for (let n = 0; n < 40; n++) {
      const [sx, sy] = grid.cellCenter(grid.walkCells[Math.floor(rand() * grid.walkCells.length)]);
      const [tx, ty] = grid.cellCenter(grid.walkCells[Math.floor(rand() * grid.walkCells.length)]);
      const path = findPath(grid, sx, sy, tx, ty);
      if (!path) continue;
      let [px, py] = [sx, sy];
      for (const [x, y] of path) {
        expect(grid.isWalkable(x, y)).toBe(true);
        // Segments may graze a blocked cell's corner (cells sit RADIUS off the
        // furniture), but must never enter a footprint.
        for (let t = 0; t <= 1; t += 0.05) {
          for (const o of MAP.objects) expect(pointInPoly(px + (x - px) * t, py + (y - py) * t, o.footprint)).toBe(false);
        }
        [px, py] = [x, y];
      }
      expect(path[path.length - 1]).toEqual([tx, ty]);
    }
  });

  it('returns null for an unwalkable target', () => {
    const [sx, sy] = grid.cellCenter(grid.walkCells[0]);
    expect(findPath(grid, sx, sy, 470, 320)).toBeNull(); // inside desk A
  });
});

describe('depth', () => {
  const objects = withBoxes(MAP.objects);
  const deskA = objects.find((o) => o.id === 'desk-A')!;

  it('frontEdgeY follows the footprint outline at the person x (person beside the desk)', () => {
    // Desk A front edge runs from (402,325) down to (470,362) then up to (575,305).
    expect(frontEdgeY(deskA.footprint, 470)).toBeCloseTo(362);
    expect(frontEdgeY(deskA.footprint, 436)).toBeCloseTo(343.5);
    // Outside the x-range it clamps to the nearest end.
    expect(frontEdgeY(deskA.footprint, 300)).toBeCloseTo(325, 0);
  });

  it('a person just above the front edge is behind; just below is in front', () => {
    expect(isBehind({ x: 470, y: 280, scale: 1 }, deskA)).toBe(true);
    expect(isBehind({ x: 470, y: 380, scale: 1 }, deskA)).toBe(false);
    // Beside the right corner: y=330 is below the edge there (~319), so in front.
    expect(isBehind({ x: 550, y: 330, scale: 1 }, deskA)).toBe(false);
  });

  it('puts an object cutout just above the person behind it, walls on top', () => {
    const people = [
      { x: 470, y: 380, scale: 1 }, // in front of desk A
      { x: 470, y: 280, scale: 1 }, // behind desk A
    ];
    const { personZ, objectZ, wallZ } = depthLayers(people, [deskA]);
    expect(personZ[1]).toBeLessThan(personZ[0]);
    expect(objectZ[0]).toBe(personZ[1] + 1);
    expect(objectZ[0]).toBeLessThan(personZ[0]);
    expect(wallZ).toBeGreaterThan(Math.max(...personZ, ...objectZ));
  });
});

describe('simulation', () => {
  it('people never step onto furniture', () => {
    const sim = createSimulation(MAP, seeded(3));
    const grid = buildNavGrid(MAP);
    sim.setCount(20);
    for (let i = 0; i < 1200; i++) {
      sim.step(1 / 30);
      for (const p of sim.people) {
        for (const o of MAP.objects) expect(pointInPoly(p.x, p.y, o.footprint)).toBe(false);
        expect(pointInPoly(p.x, p.y, MAP.floor)).toBe(true);
      }
    }
    expect(sim.people.some((p) => p.moving || p.path.length)).toBe(true);
    expect(grid.walkCells.length).toBeGreaterThan(0);
  });

  it('fades people in and out on count changes without resetting the rest', () => {
    const sim = createSimulation(MAP, seeded(4));
    sim.setCount(6);
    for (let i = 0; i < 30; i++) sim.step(0.05);
    const firstIds = sim.people.map((p) => p.id);
    expect(sim.people.every((p) => p.alpha === 1)).toBe(true);

    sim.setCount(3);
    expect(sim.people.filter((p) => p.leaving)).toHaveLength(3);
    for (let i = 0; i < 20; i++) sim.step(0.05);
    expect(sim.people.map((p) => p.id)).toEqual(firstIds.slice(0, 3));

    sim.setCount(5);
    expect(sim.people.slice(3).every((p) => p.alpha === 0)).toBe(true);
  });

  it('clamps a long frame so nobody teleports', () => {
    const sim = createSimulation(MAP, seeded(5));
    sim.setCount(1);
    const p = sim.people[0];
    p.wait = 0;
    sim.step(0.001); // pick a path
    const [x0, y0] = [p.x, p.y];
    sim.step(5);
    expect(Math.hypot(p.x - x0, p.y - y0)).toBeLessThanOrEqual(48 * 0.05 + 1e-6);
  });
});
