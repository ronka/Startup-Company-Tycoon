/**
 * Team at week 44. The leadership roster fills in one seat at a time, which is
 * how the run actually built it: CTO in week 10, CMO in 25, CFO in 28.
 */

import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { stateAt } from "../app/run";
import { TeamScreen } from "../app/screens/TeamScreen";
import { Backdrop, Headline, Phone } from "../Stage";

export const TEAM_WEEK = 44;

export const TeamScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The scene opens on morale and the steppers, then scrolls to the leadership
  // roster — the seats fill in as it arrives.
  const scrollY = interpolate(frame, [0.7 * fps, 3 * fps], [0, 470], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.15, 1),
  });

  const seatsFilled = Math.floor(
    interpolate(frame, [2.3 * fps, 3.6 * fps], [0, 3.99], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );

  return (
    <Backdrop>
      <Headline kicker="Payroll is due Friday">Hire the people who change the math.</Headline>

      <Phone>
        <TeamScreen state={stateAt(TEAM_WEEK)} seatsFilled={seatsFilled} scrollY={scrollY} />
      </Phone>
    </Backdrop>
  );
};
