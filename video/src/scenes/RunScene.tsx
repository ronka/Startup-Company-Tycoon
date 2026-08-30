/**
 * The scene the whole video exists for: 32 weeks of one run, played out on HQ.
 * The week counter races from 12 to 44 and *everything* follows from that —
 * cash, runway, users, the valuation and its delta chip, the morale ring, the
 * sparkline, the news feed — because every frame reads the same simulated run.
 */

import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { stateAt, valuationChangeAt, valuationHistoryAt, WEEKS } from "../app/run";
import { HqScreen } from "../app/screens/HqScreen";
import { Backdrop, Headline, Phone } from "../Stage";

export const RUN_FROM = 12;
export const RUN_TO = 44;

export const RunScene: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 186 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Eased at both ends, so the counters accelerate into the sprint and settle
  // on week 44 rather than slamming into it.
  const week = interpolate(frame, [0, durationInFrames - 0.6 * fps], [RUN_FROM, RUN_TO], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  });

  // Barely-there drift: enough to bring the stat grid up into frame by the end
  // without ever pushing the hero valuation out of it.
  const scrollY = interpolate(frame, [1.5 * fps, durationInFrames - 0.6 * fps], [0, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.3, 1),
  });

  const state = stateAt(week);

  return (
    <Backdrop>
      <Headline kicker="Eight months later">$44K → $685K.</Headline>

      <Phone>
        <HqScreen
          state={state}
          previous={WEEKS[Math.max(0, Math.floor(week) - 1)]}
          history={valuationHistoryAt(week)}
          valuationChange={valuationChangeAt(week)}
          scrollY={scrollY}
        />
      </Phone>
    </Backdrop>
  );
};
