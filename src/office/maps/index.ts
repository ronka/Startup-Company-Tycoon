/**
 * Static registry of the office maps. The JSON and cutout PNGs are generated
 * by `scripts/office-maps.py` from the traced sources in assets/offices/source.
 */

import type { ImageSourcePropType } from 'react-native';

import type { OfficeMap, OfficeTier } from '../engine/types';
import { TIER_ASSETS } from './assets';
import tier1 from './tier-1.json';
import tier2 from './tier-2.json';
import tier3 from './tier-3.json';
import tier4 from './tier-4.json';
import tier5 from './tier-5.json';
import tier6 from './tier-6.json';
import tier7 from './tier-7.json';
import tier8 from './tier-8.json';

export interface CutoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Every office is shown at this height/width ratio, cropped to its art, so
 * the HQ card keeps one height across tier changes and small offices aren't
 * lost in a mostly empty 16:9 canvas.
 */
export const SCENE_ASPECT = 0.7;

/** A map plus everything needed to draw it. */
export interface OfficeScenery {
  map: OfficeMap;
  /** The part of the image to show, in image pixels, at `SCENE_ASPECT`. */
  view: CutoutRect;
  background: ImageSourcePropType;
  /** One per object that has pixels to redraw, in `map.objects` order. */
  cutouts: { objectIndex: number; rect: CutoutRect; source: ImageSourcePropType }[];
  walls: { rect: CutoutRect; source: ImageSourcePropType }[];
}

interface GeneratedMap extends Omit<OfficeMap, 'objects' | 'tier'> {
  tier: number;
  contentBox: CutoutRect;
  wallCutouts: (CutoutRect | null)[];
  objects: (OfficeMap['objects'][number] & { cutout: CutoutRect | null })[];
}

const RAW = [tier1, tier2, tier3, tier4, tier5, tier6, tier7, tier8] as unknown as GeneratedMap[];

function toScenery(raw: GeneratedMap): OfficeScenery {
  const assets = TIER_ASSETS[raw.tier];
  const map: OfficeMap = {
    id: raw.id,
    tier: raw.tier as OfficeTier,
    imageWidth: raw.imageWidth,
    imageHeight: raw.imageHeight,
    capacity: raw.capacity,
    floor: raw.floor,
    frontWalls: raw.frontWalls,
    objects: raw.objects.map(({ id, footprint, silhouette }) => ({ id, footprint, silhouette })),
    pois: raw.pois,
  };
  const cutouts = raw.objects.flatMap((o, objectIndex) =>
    o.cutout && assets.objects[o.id] ? [{ objectIndex, rect: o.cutout, source: assets.objects[o.id] }] : [],
  );
  const walls = raw.wallCutouts.flatMap((rect, i) => (rect && assets.walls[i] ? [{ rect, source: assets.walls[i] }] : []));
  return { map, view: viewFor(raw.contentBox), background: assets.bg, cutouts, walls };
}

/** Smallest SCENE_ASPECT rect that contains the art, centred on it. */
function viewFor(box: CutoutRect): CutoutRect {
  const w = Math.max(box.w, box.h / SCENE_ASPECT);
  const h = w * SCENE_ASPECT;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export const OFFICES: readonly OfficeScenery[] = RAW.map(toScenery).sort((a, b) => a.map.tier - b.map.tier);

export function sceneryFor(tier: OfficeTier): OfficeScenery {
  return OFFICES.find((o) => o.map.tier === tier) ?? OFFICES[0];
}

/** Short display name per tier, for the HQ card caption. */
export const OFFICE_NAMES: Record<OfficeTier, string> = {
  1: 'Spare room',
  2: 'Starter office',
  3: 'Startup loft',
  4: 'Studio office',
  5: 'Open-plan floor',
  6: 'Campus floor',
  7: 'Headquarters',
  8: 'Flagship HQ',
};
