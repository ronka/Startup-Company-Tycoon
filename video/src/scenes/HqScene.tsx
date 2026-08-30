/**
 * Beat 1 of the run: HQ at week 12, with the HUD called out. The phone lifts
 * into place here and then stays put for the rest of the video.
 */

import React from "react";
import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { SAFE_TOP } from "../app/PhoneFrame";
import { stateAt, valuationChangeAt, valuationHistoryAt, WEEKS } from "../app/run";
import { HqScreen } from "../app/screens/HqScreen";
import { Colors, Radius } from "../app/theme";
import { Backdrop, Headline, Phone } from "../Stage";

export const HQ_WEEK = 12;

export const HqScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = stateAt(HQ_WEEK);

  return (
    <Backdrop>
      <Headline kicker="Week 12">Every number is a countdown.</Headline>

      <Interactive.Div
        name="PhoneRise"
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 1.4 * fps], ["0px 90px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Phone>
          <HqScreen
            state={state}
            previous={WEEKS[HQ_WEEK - 1]}
            history={valuationHistoryAt(HQ_WEEK)}
            valuationChange={valuationChangeAt(HQ_WEEK)}
          />
          <HudSpotlight delay={1.1 * fps} />
        </Phone>
      </Interactive.Div>
    </Backdrop>
  );
};

/**
 * Accent ring around the HUD strip. Positioned in the phone's own point space,
 * so it tracks the device whatever the stage scale is.
 */
export const HudSpotlight: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        top: SAFE_TOP + 4,
        left: 28,
        right: 12,
        height: 54,
        borderRadius: Radius.sm + 2,
        border: `2px solid ${Colors.accent}`,
        boxShadow: `0 0 0 6px rgba(60,135,247,0.18), 0 0 40px rgba(60,135,247,0.45)`,
        zIndex: 5,
        opacity: interpolate(frame, [delay, delay + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        scale: interpolate(frame, [delay, delay + 16], [1.06, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          output: "perceptual-scale",
        }),
      }}
    />
  );
};
