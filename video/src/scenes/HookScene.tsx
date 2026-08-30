/** Cold open: the two numbers the whole game hangs on. */

import React from "react";
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Colors } from "../app/theme";
import { Backdrop } from "../Stage";

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "0 90px",
          textAlign: "center",
        }}
      >
        <Interactive.Div
          name="Cash"
          style={{
            fontSize: 150,
            lineHeight: "150px",
            fontWeight: 700,
            letterSpacing: -6,
            color: Colors.text,
            fontVariantNumeric: "tabular-nums",
            opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [0, 0.7 * fps], [0.88, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
          }}
        >
          $250,000
        </Interactive.Div>

        <Interactive.Div
          name="Runway"
          style={{
            fontSize: 62,
            lineHeight: "72px",
            fontWeight: 600,
            letterSpacing: -1.5,
            color: Colors.textSecondary,
            opacity: interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0.5 * fps, 1.1 * fps], ["0px 18px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          50 weeks of runway.
        </Interactive.Div>

        <Interactive.Div
          name="Stakes"
          style={{
            marginTop: 16,
            fontSize: 46,
            lineHeight: "56px",
            fontWeight: 700,
            letterSpacing: -1,
            color: Colors.accent,
            opacity: interpolate(frame, [1.2 * fps, 1.7 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Everything after this is your fault.
        </Interactive.Div>
      </AbsoluteFill>
    </Backdrop>
  );
};
