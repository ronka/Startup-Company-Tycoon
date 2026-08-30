/**
 * The 30-second App Store / social spot.
 *
 * Scenes overlap by `CROSSFADE` frames and each one fades its own contents, so
 * consecutive phone scenes dissolve screen-to-screen while the device itself
 * never moves — every scene parks the phone at the same coordinates (`Stage`).
 * The overlap is deliberately short: two dense app screens held at half opacity
 * for any longer just reads as mush.
 */

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";

import { FONT_STACK } from "./app/theme";
import { DecisionScene } from "./scenes/DecisionScene";
import { HookScene } from "./scenes/HookScene";
import { HqScene } from "./scenes/HqScene";
import { MarketScene } from "./scenes/MarketScene";
import { PayoffScene } from "./scenes/PayoffScene";
import { RunScene } from "./scenes/RunScene";
import { TeamScene } from "./scenes/TeamScene";
import { SceneFade } from "./Stage";

export const StartupTycoonVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#050505", fontFamily: FONT_STACK }}>
    <Sequence name="Hook" from={0} durationInFrames={70}>
      <SceneFade durationInFrames={70}>
        <HookScene />
      </SceneFade>
    </Sequence>

    <Sequence name="HQ" from={62} durationInFrames={126}>
      <SceneFade durationInFrames={126}>
        <HqScene />
      </SceneFade>
    </Sequence>

    <Sequence name="Run" from={180} durationInFrames={186}>
      <SceneFade durationInFrames={186}>
        <RunScene durationInFrames={186} />
      </SceneFade>
    </Sequence>

    <Sequence name="Team" from={358} durationInFrames={144}>
      <SceneFade durationInFrames={144}>
        <TeamScene />
      </SceneFade>
    </Sequence>

    <Sequence name="Market" from={494} durationInFrames={120}>
      <SceneFade durationInFrames={120}>
        <MarketScene />
      </SceneFade>
    </Sequence>

    <Sequence name="Decision" from={606} durationInFrames={162}>
      <SceneFade durationInFrames={162}>
        <DecisionScene />
      </SceneFade>
    </Sequence>

    <Sequence name="Payoff" from={760} durationInFrames={110}>
      <SceneFade durationInFrames={110}>
        <PayoffScene />
      </SceneFade>
    </Sequence>
  </AbsoluteFill>
);
