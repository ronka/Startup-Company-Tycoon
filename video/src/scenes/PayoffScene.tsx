/**
 * The close: the app, and the run's own numbers as proof that everything above
 * was one session rather than four mockups.
 */

import React from "react";
import { AbsoluteFill, Easing, Img, Interactive, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { formatCount, formatMoney } from "../app/format";
import { stateAt } from "../app/run";
import { Colors, Radius } from "../app/theme";
import { Backdrop } from "../Stage";

const FINAL_WEEK = 44;

export const PayoffScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = stateAt(FINAL_WEEK);

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          padding: "0 90px",
          textAlign: "center",
        }}
      >
        <Interactive.Div
          name="Icon"
          style={{
            opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [0, 0.9 * fps], [0.82, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
          }}
        >
          <Img
            src={staticFile("app-icon.png")}
            style={{
              width: 220,
              height: 220,
              borderRadius: 50,
              boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
            }}
          />
        </Interactive.Div>

        <Interactive.Div
          name="Title"
          style={{
            fontSize: 82,
            lineHeight: "88px",
            fontWeight: 700,
            letterSpacing: -2.5,
            color: Colors.text,
            opacity: interpolate(frame, [0.3 * fps, 0.75 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Startup Empire Tycoon
        </Interactive.Div>

        {/* The run's own final numbers — the receipt for everything above. */}
        <Interactive.Div
          name="RunReceipt"
          style={{
            display: "flex",
            gap: 14,
            opacity: interpolate(frame, [0.6 * fps, 1.05 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0.6 * fps, 1.1 * fps], ["0px 16px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <Chip label="Week" value={`${state.week}`} />
          <Chip label="Valuation" value={formatMoney(state.valuation)} />
          <Chip label="Users" value={formatCount(Math.round(state.customers))} />
        </Interactive.Div>

        <Interactive.Div
          name="Cta"
          style={{
            marginTop: 14,
            fontSize: 44,
            lineHeight: "54px",
            fontWeight: 700,
            color: Colors.accent,
            opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          On the App Store
        </Interactive.Div>
      </AbsoluteFill>
    </Backdrop>
  );
};

const Chip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      padding: "16px 28px",
      borderRadius: Radius.lg,
      border: `1px solid ${Colors.border}`,
      backgroundColor: Colors.surface,
    }}
  >
    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", color: Colors.textMuted }}>
      {label}
    </span>
    <span style={{ fontSize: 40, fontWeight: 700, color: Colors.text, fontVariantNumeric: "tabular-nums" }}>
      {value}
    </span>
  </div>
);
