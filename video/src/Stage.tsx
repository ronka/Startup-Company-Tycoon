/**
 * The frame every phone scene shares: the backdrop, the headline band, and the
 * phone parked at one fixed position. Because the geometry is identical in
 * every scene, cross-fading two scenes reads as the *screen* changing while
 * the device itself stays nailed down.
 */

import React from "react";
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";

import { PHONE_HEIGHT, PHONE_WIDTH, PhoneFrame } from "./app/PhoneFrame";
import { Colors, FONT_STACK } from "./app/theme";

export const PHONE_SCALE = 1.51;
export const PHONE_TOP = 500;

export const Backdrop: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: "#050505",
      fontFamily: FONT_STACK,
      // A cold blue pool behind the device, so the near-black app screen has
      // something to sit on instead of dissolving into the background.
      backgroundImage:
        "radial-gradient(120% 60% at 50% 78%, rgba(60,135,247,0.20) 0%, rgba(60,135,247,0.05) 42%, rgba(0,0,0,0) 72%)",
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Kicker + headline, top-aligned in the band above the phone. */
export const Headline: React.FC<{ kicker?: string; children: React.ReactNode; delay?: number }> = ({
  kicker,
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name="Headline"
      style={{
        position: "absolute",
        top: 150,
        left: 90,
        right: 90,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        opacity: interpolate(frame, [delay, delay + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [delay, delay + 20], ["0px 26px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      {kicker ? (
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: Colors.accent,
          }}
        >
          {kicker}
        </span>
      ) : null}
      <span style={{ fontSize: 84, lineHeight: "92px", fontWeight: 700, letterSpacing: -2.5, color: Colors.text }}>
        {children}
      </span>
    </Interactive.Div>
  );
};

/** The phone, at the position every scene agrees on. */
export const Phone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      position: "absolute",
      top: PHONE_TOP,
      left: "50%",
      translate: "-50% 0",
      width: PHONE_WIDTH * PHONE_SCALE,
      height: PHONE_HEIGHT * PHONE_SCALE,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...style,
    }}
  >
    <PhoneFrame scale={PHONE_SCALE}>{children}</PhoneFrame>
  </div>
);

/**
 * Scene-level cross-fade. Scenes overlap by `CROSSFADE` frames in the timeline;
 * each one fades its own contents in and out so the bezel never blinks.
 */
export const CROSSFADE = 8;

export const SceneFade: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(
          frame,
          [0, CROSSFADE, durationInFrames - CROSSFADE, durationInFrames],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.linear },
        ),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
