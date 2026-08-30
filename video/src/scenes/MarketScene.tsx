/**
 * Market at week 44. The share bars grow into place from zero, so the fight
 * for the market reads as a fight rather than a static bar chart.
 */

import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { stateAt } from "../app/run";
import { MarketScreen } from "../app/screens/MarketScreen";
import { Backdrop, Headline, Phone } from "../Stage";

export const MARKET_WEEK = 44;

export const MarketScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = stateAt(MARKET_WEEK);

  // Bars sweep out of the left edge over the first beat of the scene.
  const grow = interpolate(frame, [0.3 * fps, 1.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // A slow drift down to the hype meter and the era strip once the bars have
  // landed — the two things that decide who wins those bars.
  const scrollY = interpolate(frame, [2 * fps, 4 * fps], [0, 210], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.15, 1),
  });

  return (
    <Backdrop>
      <Headline kicker="Two rivals">They want your customers.</Headline>

      <Phone>
        <MarketScreen
          state={{
            ...state,
            marketShare: state.marketShare * grow,
            rivals: state.rivals.map((rival) => ({ ...rival, marketShare: rival.marketShare * grow })),
          }}
          scrollY={scrollY}
        />
      </Phone>
    </Backdrop>
  );
};
