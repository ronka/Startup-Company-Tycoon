/**
 * Week 44's decision card, exactly as the run drew it: a public company offers
 * to buy the whole thing for ~$1.7M, and the founder says no.
 *
 * The card, its flavor text and both consequence lines all come out of
 * `run.json` — this is the event deck's own copy, not marketing copy.
 */

import React from "react";
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { ERA_LABEL } from "../app/format";
import { decisionAt, stateAt, valuationChangeAt, valuationHistoryAt, WEEKS } from "../app/run";
import { HqScreen } from "../app/screens/HqScreen";
import { Colors, Radius, Spacing } from "../app/theme";
import { Pill, Text } from "../app/ui";
import { Backdrop, Headline, Phone } from "../Stage";

export const DECISION_WEEK = 44;

export const DecisionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = stateAt(DECISION_WEEK);
  const card = decisionAt(DECISION_WEEK)!;

  // The tap lands at 2.2s: the chosen row flashes, then the sheet has half a
  // second to sit there before the scene cuts.
  const tapAt = 2.2 * fps;

  return (
    <Backdrop>
      <Headline kicker="Boom era · Decision">Then live with it.</Headline>

      <Phone>
        <AbsoluteFill>
          <HqScreen
            state={state}
            previous={WEEKS[DECISION_WEEK - 1]}
            history={valuationHistoryAt(DECISION_WEEK)}
            valuationChange={valuationChangeAt(DECISION_WEEK)}
          />
        </AbsoluteFill>

        {/* Scrim */}
        <AbsoluteFill
          style={{
            backgroundColor: "rgba(0,0,0,0.6)",
            opacity: interpolate(frame, [0, 0.35 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />

        <Interactive.Div
          name="DecisionSheet"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: Colors.surface,
            borderTop: `1px solid ${Colors.border}`,
            borderTopLeftRadius: Radius.sheet,
            borderTopRightRadius: Radius.sheet,
            paddingTop: Spacing.two,
            translate: interpolate(frame, [0, 0.75 * fps], ["0px 420px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              margin: "0 auto",
              backgroundColor: Colors.border,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: Spacing.three,
              padding: `${Spacing.four}px ${Spacing.four}px ${Spacing.six}px`,
            }}
          >
            <div style={{ display: "flex" }}>
              <Pill label={`${ERA_LABEL[card.era]} · Decision`} tone="strong" />
            </div>
            <Text type="sheetTitle">{card.title}</Text>
            <Text type="default" color="textSecondary" style={{ lineHeight: "24px" }}>
              {card.flavor}
            </Text>
            <div style={{ display: "flex", flexDirection: "column", gap: Spacing.two }}>
              {card.choices.map((choice, index) => (
                <ChoiceRow
                  key={choice.label}
                  label={choice.label}
                  consequence={choice.consequence}
                  tone={choice.endsRun ? "caution" : index === 0 ? "primary" : "neutral"}
                  picked={index === card.picked}
                  tapAt={tapAt}
                />
              ))}
            </div>
          </div>
        </Interactive.Div>
      </Phone>
    </Backdrop>
  );
};

const ChoiceRow: React.FC<{
  label: string;
  consequence: string;
  tone: "primary" | "neutral" | "caution";
  picked: boolean;
  tapAt: number;
}> = ({ label, consequence, tone, picked, tapAt }) => {
  const frame = useCurrentFrame();
  const isPrimary = tone === "primary";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.three,
        minHeight: 56,
        padding: `${Spacing.two}px ${Spacing.three}px`,
        borderRadius: Radius.md,
        border: `1px solid ${tone === "caution" ? Colors.warning : Colors.border}`,
        backgroundColor: isPrimary ? Colors.accent : Colors.surfaceRaised,
        // The picked row takes the press: a quick squash, then a ring.
        scale: picked
          ? interpolate(frame, [tapAt, tapAt + 4, tapAt + 14], [1, 0.97, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            })
          : 1,
        opacity: picked
          ? 1
          : interpolate(frame, [tapAt + 6, tapAt + 20], [1, 0.35], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
        boxShadow: picked
          ? `0 0 0 ${interpolate(frame, [tapAt, tapAt + 12], [0, 4], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px rgba(60,135,247,0.35)`
          : "none",
      }}
    >
      <span
        style={{
          fontSize: 17,
          lineHeight: "22px",
          fontWeight: 700,
          flexShrink: 1,
          color: isPrimary ? Colors.accentInk : tone === "caution" ? Colors.warning : Colors.text,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          lineHeight: "20px",
          fontWeight: 500,
          textAlign: "right",
          maxWidth: "45%",
          flexShrink: 1,
          color: isPrimary ? Colors.accentInk : Colors.textSecondary,
        }}
      >
        {consequence}
      </span>
    </div>
  );
};
