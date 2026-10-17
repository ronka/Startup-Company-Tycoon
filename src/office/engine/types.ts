/**
 * Office scene data model. Pure data — no React / React Native imports here,
 * so the engine stays unit-testable under node like `src/game/`.
 *
 * All coordinates are pixels in the source office image (1280×720).
 */

export type Pt = [number, number];

export type OfficeTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OfficeObject {
  id: string;
  /** The object's area ON THE FLOOR: blocks walking and decides depth. */
  footprint: Pt[];
  /** The object's outline IN THE IMAGE: redrawn over people standing behind it. */
  silhouette: Pt[];
}

export interface OfficePoi {
  x: number;
  y: number;
  kind: 'coffee' | 'desk' | 'lounge' | 'plant' | 'window' | (string & {});
}

export interface OfficeMap {
  id: string;
  tier: OfficeTier;
  imageWidth: number;
  imageHeight: number;
  /** `comfortable`: fits without looking busy. `max`: most people drawn before it looks absurd. */
  capacity: { comfortable: number; max: number };
  /** Walkable floor outline. */
  floor: Pt[];
  /** Wall pieces always drawn on top of people. */
  frontWalls: Pt[][];
  objects: OfficeObject[];
  pois: OfficePoi[];
}
