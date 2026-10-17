import { useIsFocused } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { PersonLook } from './engine/person';
import { createSimulation, depthLayers, withBoxes, type DepthObject, type Simulation } from './engine/simulation';
import type { OfficeTier } from './engine/types';
import { SCENE_ASPECT, sceneryFor, type CutoutRect, type OfficeScenery } from './maps';
import { OfficeDebugOverlay } from './render/debug-overlay';
import {
  P_ALPHA,
  P_BACK,
  P_BOB,
  P_MUG,
  P_SCALE_X,
  P_SWING,
  P_X,
  P_Y,
  P_Z,
  PERSON_STRIDE,
  PersonSprite,
} from './render/person-sprite';

/** Tier changes crossfade over this long. */
const CROSSFADE_MS = 400;

interface OfficeSceneProps {
  tier: OfficeTier;
  /** People to draw (already capped by `peopleShown`). */
  people: number;
  /** Rendered width in points; height is `width × SCENE_ASPECT`. */
  width: number;
  paused?: boolean;
  /** Dev-only nav overlay: walkable cells, footprints, silhouettes, POIs. */
  debug?: boolean;
}

/**
 * The living office: the tier's illustration with little people wandering
 * it, hiding correctly behind furniture. Changing `tier` crossfades to the
 * new office; changing `people` fades people in and out without a reset.
 */
export function OfficeScene({ tier, people, width, paused = false, debug = false }: OfficeSceneProps) {
  const [shown, setShown] = useState<{ tier: OfficeTier; leaving: OfficeTier[] }>({ tier, leaving: [] });
  // Derive-during-render: a new tier becomes current, the old one fades out.
  if (shown.tier !== tier) {
    setShown({ tier, leaving: [...shown.leaving.filter((t) => t !== tier), shown.tier] });
  }
  const hasLeaving = shown.leaving.length > 0;
  useEffect(() => {
    if (!hasLeaving) return;
    const timer = setTimeout(() => setShown((s) => ({ ...s, leaving: [] })), CROSSFADE_MS + 50);
    return () => clearTimeout(timer);
  }, [hasLeaving, shown.tier]);

  const layers = [...shown.leaving.map((t) => ({ tier: t, leaving: true })), { tier: shown.tier, leaving: false }];

  return (
    <View style={{ width, height: width * SCENE_ASPECT }}>
      {layers.map((layer) => (
        <OfficeLayer
          key={layer.tier}
          scenery={sceneryFor(layer.tier)}
          people={layer.leaving ? 0 : people}
          width={width}
          leaving={layer.leaving}
          paused={paused}
          debug={debug && !layer.leaving}
        />
      ))}
    </View>
  );
}

interface Engine {
  sim: Simulation;
  depthObjects: DepthObject[];
  /** Ids of the people last pushed to React, to spot arrivals and departures. */
  slotKey: string;
  /** Whether the first headcount has been placed (fully visible, no fade). */
  placed: boolean;
}

interface Slot {
  id: number;
  look: PersonLook;
}

interface LayerProps {
  scenery: OfficeScenery;
  people: number;
  width: number;
  leaving: boolean;
  paused: boolean;
  debug: boolean;
}

function OfficeLayer({ scenery, people, width, leaving, paused, debug }: LayerProps) {
  const { map, view } = scenery;
  const scale = width / view.w;
  const reduceMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const running = !paused && isFocused && appActive && !reduceMotion;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // The simulation is mutable and lives outside React: one per layer (layers
  // are keyed by tier, so `map` never changes for an instance).
  const engine = useRef<Engine | null>(null);
  if (engine.current === null) {
    engine.current = { sim: createSimulation(map), depthObjects: withBoxes(map.objects), slotKey: '', placed: false };
  }
  const objectCount = map.objects.length;

  // Frame buffer: [wallZ, objectZ × N, person floats × slots].
  const frame = useSharedValue<number[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const slotsRef = useRef<Slot[]>([]);
  useLayoutEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    const e = engine.current!;
    e.sim.setCount(people);
    if (!e.placed) {
      // People already in the office when the scene first appears don't fade in.
      e.placed = true;
      e.sim.showAll();
    }
  }, [people]);

  useEffect(() => {
    const e = engine.current!;
    const loop = { raf: 0, last: 0 };

    const writeFrame = () => {
      const peopleNow = e.sim.people;
      const key = peopleNow.map((p) => p.id).join(',');
      if (key !== e.slotKey) {
        e.slotKey = key;
        setSlots(peopleNow.map((p) => ({ id: p.id, look: p.look })));
      }
      const { personZ, objectZ, wallZ } = depthLayers(peopleNow, e.depthObjects);
      const rendered = slotsRef.current;
      const byId = new Map(peopleNow.map((p, i) => [p.id, i]));
      const out = new Array<number>(1 + objectCount + rendered.length * PERSON_STRIDE).fill(0);
      out[0] = wallZ;
      for (let i = 0; i < objectCount; i++) out[1 + i] = objectZ[i];
      rendered.forEach((slot, s) => {
        const idx = byId.get(slot.id);
        const o = 1 + objectCount + s * PERSON_STRIDE;
        if (idx === undefined) return; // gone: leave alpha at 0 until React drops the slot
        const p = peopleNow[idx];
        out[o + P_X] = p.x;
        out[o + P_Y] = p.y;
        out[o + P_ALPHA] = p.alpha;
        out[o + P_SCALE_X] = p.facing * p.scale;
        out[o + P_BACK] = p.back ? 1 : 0;
        out[o + P_SWING] = p.moving ? Math.sin(p.phase) : 0;
        out[o + P_BOB] = p.moving ? Math.abs(Math.cos(p.phase)) * 1.5 : 0;
        out[o + P_MUG] = p.mug ? 1 : 0;
        out[o + P_Z] = personZ[idx];
      });
      frame.set(out);
    };

    if (!running) {
      // Reduced motion / paused: everyone stands still where they are.
      if (reduceMotion) e.sim.showAll();
      writeFrame();
      // One more pass once React has rendered the slots.
      loop.raf = requestAnimationFrame(writeFrame);
      return () => cancelAnimationFrame(loop.raf);
    }

    const tick = (now: number) => {
      const dt = loop.last ? (now - loop.last) / 1000 : 0;
      loop.last = now;
      e.sim.step(dt);
      writeFrame();
      loop.raf = requestAnimationFrame(tick);
    };
    loop.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(loop.raf);
  }, [objectCount, running, reduceMotion, frame, people]);

  const opacity = useSharedValue(leaving ? 1 : 0);
  useEffect(() => {
    opacity.set(withTiming(leaving ? 0 : 1, { duration: CROSSFADE_MS }));
  }, [leaving, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  const personBase = 1 + objectCount;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents="none">
      <View
        style={[
          styles.world,
          {
            width: map.imageWidth,
            height: map.imageHeight,
            transform: [{ scale }, { translateX: -view.x }, { translateY: -view.y }],
          },
        ]}>
        <Image source={scenery.background} style={[styles.abs, { width: map.imageWidth, height: map.imageHeight, zIndex: 0 }]} />
        {slots.map((slot, s) => (
          <PersonSprite key={slot.id} look={slot.look} offset={personBase + s * PERSON_STRIDE} frame={frame} />
        ))}
        {scenery.cutouts.map((c) => (
          <Cutout key={c.objectIndex} rect={c.rect} source={c.source} zOffset={1 + c.objectIndex} frame={frame} />
        ))}
        {scenery.walls.map((w, i) => (
          <Cutout key={`wall-${i}`} rect={w.rect} source={w.source} zOffset={0} frame={frame} />
        ))}
        {debug ? <OfficeDebugOverlay map={map} /> : null}
      </View>
    </Animated.View>
  );
}

function Cutout({
  rect,
  source,
  zOffset,
  frame,
}: {
  rect: CutoutRect;
  source: OfficeScenery['background'];
  zOffset: number;
  frame: SharedValue<number[]>;
}) {
  // -1 (nobody behind) sinks the cutout under the background, where it's a no-op.
  const style = useAnimatedStyle(() => ({ zIndex: frame.get()[zOffset] ?? -1 }));
  return (
    <Animated.View style={[styles.abs, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }, style]}>
      <Image source={source} style={{ width: rect.w, height: rect.h }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: 'top left' },
  abs: { position: 'absolute', left: 0, top: 0 },
});
