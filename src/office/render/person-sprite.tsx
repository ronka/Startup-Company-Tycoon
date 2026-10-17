import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { PersonLook } from '../engine/person';

/**
 * Per-person floats in the frame buffer, in this order. The simulation writes
 * them on the JS thread each frame; the sprite's animated styles read them on
 * the UI thread, so walking never re-renders React.
 */
export const PERSON_STRIDE = 9;
export const P_X = 0;
export const P_Y = 1;
export const P_ALPHA = 2;
/** facing (±1) × per-person scale. */
export const P_SCALE_X = 3;
export const P_BACK = 4;
export const P_SWING = 5;
export const P_BOB = 6;
export const P_MUG = 7;
export const P_Z = 8;

const LEG_LENGTH = 20;
const LEG_WIDTH = 6.5;
const ARM_LENGTH = 16;
const ARM_WIDTH = 5;
const RAD_TO_DEG = 180 / Math.PI;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c : 255 - c) * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

interface Props {
  look: PersonLook;
  /** Offset of this person's floats in the frame buffer. */
  offset: number;
  frame: SharedValue<number[]>;
}

/**
 * The prototype's vector character, built from Views in image pixels with the
 * feet at (0, 0). Facing, walk cycle, back view and mug are all driven from
 * the shared frame buffer.
 */
export const PersonSprite = memo(function PersonSprite({ look, offset, frame }: Props) {
  const root = useAnimatedStyle(() => {
    const f = frame.get();
    const scale = f[offset + P_SCALE_X] || 1;
    return {
      opacity: f[offset + P_ALPHA] ?? 0,
      zIndex: f[offset + P_Z] ?? 0,
      transform: [
        { translateX: f[offset + P_X] ?? 0 },
        { translateY: f[offset + P_Y] ?? 0 },
        { scaleX: scale },
        { scaleY: Math.abs(scale) },
      ],
    };
  });
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -(frame.get()[offset + P_BOB] ?? 0) }] }));
  const legBack = useAnimatedStyle(() => {
    const swing = frame.get()[offset + P_SWING] ?? 0;
    return { transform: [{ rotate: `${-Math.atan2(swing * 5, LEG_LENGTH) * RAD_TO_DEG}deg` }] };
  });
  const legFront = useAnimatedStyle(() => {
    const swing = frame.get()[offset + P_SWING] ?? 0;
    return { transform: [{ rotate: `${Math.atan2(swing * 5, LEG_LENGTH) * RAD_TO_DEG}deg` }] };
  });
  const armBack = useAnimatedStyle(() => {
    const swing = frame.get()[offset + P_SWING] ?? 0;
    return { transform: [{ rotate: `${Math.atan2(1 + swing * 4, ARM_LENGTH) * RAD_TO_DEG}deg` }] };
  });
  const armFront = useAnimatedStyle(() => {
    const f = frame.get();
    if (f[offset + P_MUG]) {
      // Raised to hold the mug: shoulder (8,-42) → hand (11,-33).
      return { transform: [{ rotate: `${-Math.atan2(3, 9) * RAD_TO_DEG}deg` }, { scaleY: 9.5 / ARM_LENGTH }] };
    }
    const swing = f[offset + P_SWING] ?? 0;
    return { transform: [{ rotate: `${-Math.atan2(1 + swing * 4, ARM_LENGTH) * RAD_TO_DEG}deg` }, { scaleY: 1 }] };
  });
  const mug = useAnimatedStyle(() => {
    const f = frame.get();
    return { opacity: f[offset + P_MUG] && !f[offset + P_BACK] ? 1 : 0 };
  });
  const backHair = useAnimatedStyle(() => ({ opacity: frame.get()[offset + P_BACK] ? 1 : 0 }));

  const shirtBack = shade(look.shirt, -0.18);
  const shirtFront = shade(look.shirt, -0.05);

  return (
    <Animated.View style={[styles.anchor, root]} pointerEvents="none">
      <View style={styles.shadow} />
      <Animated.View style={[styles.anchor, body]}>
        <Animated.View style={[styles.leg, { left: -3.5 - LEG_WIDTH / 2, backgroundColor: look.pants }, legBack]}>
          <View style={styles.shoe} />
        </Animated.View>
        <Animated.View style={[styles.leg, { left: 3.5 - LEG_WIDTH / 2, backgroundColor: look.pants }, legFront]}>
          <View style={styles.shoe} />
        </Animated.View>
        <Animated.View style={[styles.arm, { left: -8 - ARM_WIDTH / 2, backgroundColor: shirtBack }, armBack]} />
        <View style={[styles.torso, { backgroundColor: look.shirt }]} />
        <Animated.View style={[styles.arm, { left: 8 - ARM_WIDTH / 2, backgroundColor: shirtFront }, armFront]}>
          <View style={[styles.hand, { backgroundColor: look.skin }]} />
        </Animated.View>
        <Animated.View style={[styles.mug, mug]} />
        <View style={[styles.neck, { backgroundColor: look.skin }]} />
        <View style={[styles.head, { backgroundColor: look.skin }]} />
        {/* Front view: hair cap, fringe, optional side panel, eyes. */}
        <View style={[styles.hairCap, { backgroundColor: look.hair }]} />
        <View style={[styles.fringe, { backgroundColor: look.hair }]} />
        {look.longHair ? <View style={[styles.sideHair, { backgroundColor: look.hair }]} /> : null}
        <View style={[styles.eye, { left: 3 - 1.2 }]} />
        <View style={[styles.eye, { left: 8 - 1.2 }]} />
        {/* Back view: hair covers the whole head (and the face drawn above). */}
        <Animated.View style={[styles.anchor, backHair]}>
          <View style={[styles.hairFull, { backgroundColor: look.hair }]} />
          {look.longHair ? <View style={[styles.hairLongBack, { backgroundColor: look.hair }]} /> : null}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  shadow: {
    position: 'absolute',
    left: -12,
    top: -5,
    width: 24,
    height: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(80,50,30,0.22)',
  },
  leg: {
    position: 'absolute',
    top: -22 - LEG_WIDTH / 2,
    width: LEG_WIDTH,
    height: LEG_LENGTH + LEG_WIDTH,
    borderRadius: LEG_WIDTH / 2,
    transformOrigin: `50% ${LEG_WIDTH / 2}px`,
  },
  shoe: {
    position: 'absolute',
    left: LEG_WIDTH / 2 - 4 + 1.5,
    bottom: LEG_WIDTH / 2 - 2.4 - 1,
    width: 8,
    height: 4.8,
    borderRadius: 4,
    backgroundColor: '#2a2420',
  },
  arm: {
    position: 'absolute',
    top: -42 - ARM_WIDTH / 2,
    width: ARM_WIDTH,
    height: ARM_LENGTH + ARM_WIDTH,
    borderRadius: ARM_WIDTH / 2,
    transformOrigin: `50% ${ARM_WIDTH / 2}px`,
  },
  hand: { position: 'absolute', bottom: -0.1, left: ARM_WIDTH / 2 - 2.6, width: 5.2, height: 5.2, borderRadius: 2.6 },
  torso: {
    position: 'absolute',
    left: -10,
    top: -47,
    width: 20,
    height: 27,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  mug: {
    position: 'absolute',
    left: 10,
    top: -39,
    width: 7,
    height: 8,
    borderRadius: 1.5,
    backgroundColor: '#fdfdfd',
    borderWidth: 1,
    borderColor: '#b9b0a6',
  },
  neck: { position: 'absolute', left: -2.5, top: -51, width: 5, height: 5 },
  head: { position: 'absolute', left: -10, top: -70, width: 20, height: 20, borderRadius: 10 },
  hairCap: {
    position: 'absolute',
    left: -10.6,
    top: -71.6,
    width: 21.2,
    height: 10.6,
    borderTopLeftRadius: 10.6,
    borderTopRightRadius: 10.6,
  },
  fringe: {
    position: 'absolute',
    left: -11.5,
    top: -70.5,
    width: 15,
    height: 9,
    borderRadius: 7.5,
    transform: [{ rotate: '-14deg' }],
  },
  sideHair: { position: 'absolute', left: -11, top: -64, width: 6, height: 16, borderRadius: 3 },
  eye: { position: 'absolute', top: -60.2, width: 2.4, height: 2.4, borderRadius: 1.2, backgroundColor: '#2a2420' },
  hairFull: { position: 'absolute', left: -10.6, top: -70.6, width: 21.2, height: 21.2, borderRadius: 10.6 },
  hairLongBack: { position: 'absolute', left: -10, top: -62, width: 20, height: 15, borderRadius: 5 },
});
