import { bbox, frontEdgeY, type BBox } from './geometry';
import { navGridFor } from './nav-grid';
import { Person, type PersonContext, type Random } from './person';
import type { OfficeMap, OfficeObject } from './types';

/** Longest step the sim takes in one frame, so a hitch can't teleport people through furniture. */
export const MAX_DT = 0.05;

export interface Simulation {
  readonly map: OfficeMap;
  /** Every person still on screen, including ones fading out. */
  people: Person[];
  /** Add or remove people gradually: newcomers fade in, leavers fade out where they stand. */
  setCount(n: number): void;
  step(dt: number): void;
  /** Make everyone present fully visible at once (first paint, reduced motion). */
  showAll(): void;
}

export function createSimulation(map: OfficeMap, rand: Random = Math.random): Simulation {
  const ctx: PersonContext = { grid: navGridFor(map), pois: map.pois, rand };
  let nextId = 1;
  const sim: Simulation = {
    map,
    people: [],
    setCount(n) {
      const active = sim.people.filter((p) => !p.leaving);
      for (let i = active.length; i < n; i++) sim.people.push(new Person(nextId++, ctx));
      for (let i = active.length - 1; i >= n; i--) active[i].leaving = true;
    },
    step(dt) {
      const clamped = Math.min(MAX_DT, Math.max(0, dt));
      for (const p of sim.people) p.update(clamped, sim.people, ctx);
      sim.people = sim.people.filter((p) => !(p.leaving && p.alpha <= 0));
    },
    showAll() {
      for (const p of sim.people) if (!p.leaving) p.alpha = 1;
    },
  };
  return sim;
}

/** Sprite half-width and height at scale 1, used for the "behind" overlap test. */
const SPRITE_HALF_WIDTH = 15;
const SPRITE_HEIGHT = 72;

export interface DepthObject extends OfficeObject {
  box: BBox;
}

export function withBoxes(objects: readonly OfficeObject[]): DepthObject[] {
  return objects.map((o) => ({ ...o, box: bbox(o.silhouette) }));
}

/**
 * A person is behind an object when their sprite overlaps its silhouette and
 * their feet are above the object's front edge at their x.
 */
export function isBehind(p: Pick<Person, 'x' | 'y' | 'scale'>, o: DepthObject): boolean {
  const w = SPRITE_HALF_WIDTH * p.scale;
  const h = SPRITE_HEIGHT * p.scale;
  if (p.x + w < o.box.x0 || p.x - w > o.box.x1 || p.y < o.box.y0 || p.y - h > o.box.y1) return false;
  return p.y < frontEdgeY(o.footprint, p.x);
}

export interface DepthLayers {
  /** zIndex per person, parallel to the `people` array passed in. */
  personZ: number[];
  /** zIndex per object cutout, parallel to `objects`; -1 when nobody is behind it. */
  objectZ: number[];
  /** zIndex for the front walls: above everything else. */
  wallZ: number;
}

/**
 * The prototype draws people sorted by feet y and, after each person, redraws
 * every object that person is behind. With a fixed set of layers that's the
 * same as: person at rank r gets z = 2r + 1, and each object cutout sits just
 * above the highest-ranked person behind it.
 */
export function depthLayers(people: readonly Pick<Person, 'x' | 'y' | 'scale'>[], objects: readonly DepthObject[]): DepthLayers {
  const order = people.map((_, i) => i).sort((a, b) => people[a].y - people[b].y);
  const personZ = new Array<number>(people.length);
  order.forEach((idx, rank) => {
    personZ[idx] = 2 * rank + 1;
  });
  const objectZ = objects.map((o) => {
    let z = -1;
    for (let i = 0; i < people.length; i++) {
      if (personZ[i] + 1 > z && isBehind(people[i], o)) z = personZ[i] + 1;
    }
    return z;
  });
  return { personZ, objectZ, wallZ: 2 * people.length + 2 };
}
