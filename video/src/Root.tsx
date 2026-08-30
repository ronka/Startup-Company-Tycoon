import "./index.css";

import React from "react";
import { Composition, Folder } from "remotion";

import { DecisionScene } from "./scenes/DecisionScene";
import { HookScene } from "./scenes/HookScene";
import { HqScene } from "./scenes/HqScene";
import { MarketScene } from "./scenes/MarketScene";
import { PayoffScene } from "./scenes/PayoffScene";
import { RunScene } from "./scenes/RunScene";
import { TeamScene } from "./scenes/TeamScene";
import { StartupTycoonVideo } from "./StartupTycoonVideo";

/** 1080×1920 at 30fps — App Store app-preview shape, and the same shape as Reels/TikTok/Shorts. */
const FORMAT = { fps: 30, width: 1080, height: 1920 } as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="StartupTycoon" component={StartupTycoonVideo} durationInFrames={870} {...FORMAT} />

      <Folder name="Scenes">
        <Composition id="Hook" component={HookScene} durationInFrames={70} {...FORMAT} />
        <Composition id="HQ" component={HqScene} durationInFrames={126} {...FORMAT} />
        <Composition id="Run" component={RunScene} durationInFrames={186} {...FORMAT} />
        <Composition id="Team" component={TeamScene} durationInFrames={144} {...FORMAT} />
        <Composition id="Market" component={MarketScene} durationInFrames={120} {...FORMAT} />
        <Composition id="Decision" component={DecisionScene} durationInFrames={162} {...FORMAT} />
        <Composition id="Payoff" component={PayoffScene} durationInFrames={110} {...FORMAT} />
      </Folder>
    </>
  );
};
