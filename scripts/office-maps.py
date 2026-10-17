#!/usr/bin/env python3
"""
Builds the office scene's map data and image cutouts from the traced sources.

    python3 scripts/office-maps.py            # rebuild every tier
    python3 scripts/office-maps.py 3 --debug  # one tier + a debug overlay PNG

Inputs (hand-authored, committed):
  assets/offices/source/tier-N.png          1280x720 office art, transparent background
  assets/offices/source/tier-N.trace.json   floor, front walls, furniture, POIs

Outputs (generated, committed — the app never runs this script):
  assets/offices/tier-N/bg.png              the office image, quantized
  assets/offices/tier-N/<object>.png        each object's pixels, cropped to its mask
  src/office/maps/tier-N.json               OfficeMap consumed by the engine
  src/office/maps/assets.ts                 static require() registry for Metro

Needs Pillow (pip install pillow) and, optionally, pngquant on PATH.

Furniture is traced as isometric boxes so a desk is five numbers, not a
hand-drawn polygon: `[fx, fy, a, b, h]` = front-bottom corner on the floor,
extent along the right edge (in x), extent along the left edge (in x), and
height in pixels. An object is one or more boxes (desk + monitor + chair back)
plus optional raw `polys` for organic shapes like plants. Its footprint is the
union hull of the box floors; its redraw mask is the union of the extruded
boxes and polys, rasterized, so cutouts hug the furniture instead of a hull.
"""

import json
import math
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/offices/source')
OUT_ASSETS = os.path.join(ROOT, 'assets/offices')
OUT_MAPS = os.path.join(ROOT, 'src/office/maps')
TIERS = range(1, 9)

# Isometric edge slope of this art (dy/dx); measured off the reference office.
ISO = 0.54
CELL, RADIUS = 5, 9


def box_floor(fx, fy, a, b):
    """Floor rhombus: front, right, back, left."""
    return [(fx, fy), (fx + a, fy - ISO * a), (fx + a - b, fy - ISO * (a + b)), (fx - b, fy - ISO * b)]


def box_outline(box):
    fx, fy, a, b, h = box
    floor = box_floor(fx, fy, a, b)
    top = [(x, y - h) for x, y in floor]
    return hull(floor + top)


def hull(points):
    pts = sorted(set((round(x, 1), round(y, 1)) for x, y in points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def rounded(poly):
    return [[round(x), round(y)] for x, y in poly]


def point_in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def dist_seg(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2))
    return math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)


def dist_edge(x, y, poly):
    return min(dist_seg(x, y, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


def strip_halo(image):
    """
    Some renders carry a white matte fringe outside the room's outline, which
    shows up as a halo on the dark HQ card. Flood-fill from the transparent
    border through light, cool-neutral pixels (matte and drop shadow) and clear them; the cream
    walls are warmer than this threshold, so the room itself is untouched.
    """
    w, h = image.size
    px = image.load()

    def halo(x, y):
        r, g, b, a = px[x, y]
        # The matte and the soft drop shadow are light and cool-neutral
        # (r - b ≤ 22); the cream walls are warmer than that.
        return a < 16 or (min(r, g, b) > 195 and r - b <= 22 and max(r, g, b) - min(r, g, b) <= 24)

    seen = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        if not halo(x, y):
            continue
        px[x, y] = (0, 0, 0, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return image


def quantize(path):
    if shutil.which('pngquant'):
        subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality', '70-95', '--output', path, path], check=False)


def build_tier(tier, debug=False):
    trace_path = os.path.join(SRC, f'tier-{tier}.trace.json')
    image = strip_halo(Image.open(os.path.join(SRC, f'tier-{tier}.png')).convert('RGBA'))
    with open(trace_path) as f:
        trace = json.load(f)

    out_dir = os.path.join(OUT_ASSETS, f'tier-{tier}')
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    image.save(os.path.join(out_dir, 'bg.png'), optimize=True)
    quantize(os.path.join(out_dir, 'bg.png'))

    def cutout(name, shapes):
        mask = Image.new('L', image.size, 0)
        draw = ImageDraw.Draw(mask)
        for shape in shapes:
            draw.polygon([tuple(p) for p in shape], fill=255)
        box = mask.getbbox()
        if not box:
            return None
        x0, y0, x1, y1 = box
        piece = Image.new('RGBA', image.size, (0, 0, 0, 0))
        piece.paste(image, (0, 0), mask)
        piece = piece.crop(box)
        path = os.path.join(out_dir, f'{name}.png')
        piece.save(path, optimize=True)
        quantize(path)
        return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}

    objects = []
    for obj in trace.get('objects', []):
        boxes = obj.get('boxes', [])
        polys = obj.get('polys', [])
        shapes = [box_outline(b) for b in boxes] + polys
        footprint = obj.get('footprint') or rounded(hull([p for b in boxes for p in box_floor(*b[:4])]))
        silhouette = rounded(hull([p for s in shapes for p in s]))
        rect = cutout(obj['id'], shapes)
        objects.append({'id': obj['id'], 'footprint': footprint, 'silhouette': silhouette, 'cutout': rect})

    walls = []
    for i, wall in enumerate(trace.get('frontWalls', [])):
        walls.append({'polygon': wall, 'cutout': cutout(f'wall-{i}', [wall])})

    # Opaque art bounds, so the app can crop away the transparent margin.
    x0, y0, x1, y1 = image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    full = {
        'id': f'tier-{tier}',
        'contentBox': {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0},
        'tier': tier,
        'imageWidth': image.width,
        'imageHeight': image.height,
        'capacity': trace['capacity'],
        'floor': trace['floor'],
        'frontWalls': [w['polygon'] for w in walls],
        'wallCutouts': [w['cutout'] for w in walls],
        'objects': objects,
        'pois': trace.get('pois', []),
    }
    with open(os.path.join(OUT_MAPS, f'tier-{tier}.json'), 'w') as f:
        json.dump(full, f, separators=(',', ':'))
        f.write('\n')

    if debug:
        write_debug(tier, image, full)
    return full


def write_debug(tier, image, m):
    base = Image.new('RGBA', image.size, (255, 255, 255, 255))
    base.alpha_composite(image)
    over = Image.new('RGBA', image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    floor = m['floor']
    xs = [p[0] for p in floor]
    ys = [p[1] for p in floor]
    for gy in range(int(min(ys)), int(max(ys)), CELL):
        for gx in range(int(min(xs)), int(max(xs)), CELL):
            x, y = gx + CELL / 2, gy + CELL / 2
            ok = point_in_poly(x, y, floor) and dist_edge(x, y, floor) > 4
            for o in m['objects']:
                if not ok:
                    break
                fp = o['footprint']
                if point_in_poly(x, y, fp) or dist_edge(x, y, fp) < RADIUS:
                    ok = False
            if ok:
                d.rectangle([gx + 1, gy + 1, gx + CELL - 1, gy + CELL - 1], fill=(40, 170, 110, 90))
    for o in m['objects']:
        d.line([tuple(p) for p in o['silhouette'] + o['silhouette'][:1]], fill=(220, 40, 40, 230), width=2)
        d.line([tuple(p) for p in o['footprint'] + o['footprint'][:1]], fill=(30, 70, 230, 255), width=2)
        fx, fy = o['footprint'][0]
        d.text((fx + 3, fy - 10), o['id'], fill=(30, 30, 160, 255))
    for w in m['frontWalls']:
        d.line([tuple(p) for p in w + w[:1]], fill=(200, 0, 200, 255), width=3)
    d.line([tuple(p) for p in floor + floor[:1]], fill=(0, 120, 0, 255), width=2)
    for p in m['pois']:
        d.ellipse([p['x'] - 5, p['y'] - 5, p['x'] + 5, p['y'] + 5], fill=(240, 30, 30, 255))
    base.alpha_composite(over)
    out = os.environ.get('OFFICE_DEBUG_DIR', '/tmp')
    path = os.path.join(out, f'debug-tier-{tier}.png')
    base.convert('RGB').save(path)
    print('debug:', path)


def write_registry(tiers):
    lines = [
        '// Generated by scripts/office-maps.py — do not edit by hand.',
        "import type { ImageSourcePropType } from 'react-native';",
        '',
        'export interface TierAssets {',
        '  bg: ImageSourcePropType;',
        '  objects: Record<string, ImageSourcePropType>;',
        '  walls: ImageSourcePropType[];',
        '}',
        '',
        'export const TIER_ASSETS: Record<number, TierAssets> = {',
    ]
    for tier, m in tiers:
        lines.append(f'  {tier}: {{')
        lines.append(f"    bg: require('../../../assets/offices/tier-{tier}/bg.png'),")
        lines.append('    objects: {')
        for o in m['objects']:
            if o['cutout']:
                lines.append(f"      '{o['id']}': require('../../../assets/offices/tier-{tier}/{o['id']}.png'),")
        lines.append('    },')
        lines.append('    walls: [')
        for i, w in enumerate(m['wallCutouts']):
            if w:
                lines.append(f"      require('../../../assets/offices/tier-{tier}/wall-{i}.png'),")
        lines.append('    ],')
        lines.append('  },')
    lines.append('};')
    with open(os.path.join(OUT_MAPS, 'assets.ts'), 'w') as f:
        f.write('\n'.join(lines) + '\n')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    debug = '--debug' in sys.argv
    selected = [int(a) for a in args] or list(TIERS)
    for tier in selected:
        build_tier(tier, debug)
    # The registry always covers every tier whose map exists.
    built = []
    for tier in TIERS:
        path = os.path.join(OUT_MAPS, f'tier-{tier}.json')
        if os.path.exists(path):
            with open(path) as f:
                built.append((tier, json.load(f)))
    write_registry(built)


if __name__ == '__main__':
    main()
