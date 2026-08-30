/**
 * The game's UI kit, rebuilt for the DOM.
 *
 * Each component here is a straight port of its React Native counterpart in
 * `src/components/game/` — same tokens, same radii, same type ramp — so a
 * frame of this video is indistinguishable from a screenshot of the app.
 */

import React from "react";

import { Icon, type IconName } from "./icons";
import { Colors, Radius, Spacing, TextStyles, type ThemeColor } from "./theme";

export const Text: React.FC<{
  type?: keyof typeof TextStyles;
  color?: ThemeColor;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ type = "default", color, style, children }) => (
  <span
    style={{
      color: Colors[color ?? (type === "sectionLabel" ? "textMuted" : "text")],
      fontVariantNumeric: "tabular-nums",
      ...TextStyles[type],
      ...style,
    }}
  >
    {children}
  </span>
);

export const Card: React.FC<{
  tone?: "default" | "alert" | "accent" | "plain";
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ tone = "default", style, children }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderStyle: "solid",
      overflow: "hidden",
      backgroundColor:
        tone === "alert" ? Colors.dangerBackground : tone === "accent" ? Colors.accentSurface : Colors.surface,
      borderColor: tone === "alert" ? Colors.danger : tone === "accent" ? Colors.accent : Colors.border,
      ...(tone === "plain" ? {} : { padding: Spacing.three, gap: Spacing.two }),
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill: React.FC<{ label: string; value?: string; tone?: "default" | "strong" }> = ({
  label,
  value,
  tone = "default",
}) => {
  const ink = tone === "strong" ? Colors.text : Colors.textSecondary;
  return (
    <div
      style={{
        flexShrink: 0,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: tone === "strong" ? Colors.textMuted : Colors.border,
        backgroundColor: Colors.surface,
        borderRadius: Radius.pill,
        padding: `${Spacing.two}px ${Spacing.three}px`,
        whiteSpace: "nowrap",
      }}
    >
      <Text type="small" style={{ color: ink }}>
        {label}
        {value ? " " : ""}
        {value ? (
          <span style={{ ...TextStyles.smallBold, color: ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        ) : null}
      </Text>
    </div>
  );
};

export const SectionHeader: React.FC<{ label: string; action?: string }> = ({ label, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <Text type="sectionLabel">{label}</Text>
    {action ? (
      <Text type="small" color="accent">
        {action}
      </Text>
    ) : null}
  </div>
);

export const ProgressBar: React.FC<{ percent: number; color: string; markers?: number[] }> = ({
  percent,
  color,
  markers,
}) => {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      style={{
        position: "relative",
        height: 8,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: Colors.surfaceRaised,
      }}
    >
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, backgroundColor: color }} />
      {markers?.map((marker) => (
        <div
          key={marker}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 2,
            left: `${Math.max(0, Math.min(100, marker))}%`,
            backgroundColor: Colors.background,
          }}
        />
      ))}
    </div>
  );
};

export const RingGauge: React.FC<{
  percent: number;
  label?: string;
  caption?: string;
  tone?: ThemeColor;
  size?: number;
  strokeWidth?: number;
}> = ({ percent, label, caption, tone = "accent", size = 92, strokeWidth = 10 }) => {
  const pct = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Spacing.two }}>
      <div style={{ width: size, height: size, position: "relative" }}>
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.surfaceRaised}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={Colors[tone]}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct / 100)}
              fill="none"
            />
          </g>
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text type="cardValue">{Math.round(pct)}</Text>
          {label ? (
            <Text type="small" color="textSecondary">
              {label}
            </Text>
          ) : null}
        </div>
      </div>
      {caption ? (
        <Text type="small" color="textSecondary">
          {caption}
        </Text>
      ) : null}
    </div>
  );
};

/**
 * HQ's valuation chart. Ported from `sparkline.tsx`, including the 2px inset
 * that keeps the round stroke cap off the top and bottom edges.
 */
export const Sparkline: React.FC<{ data: number[]; width: number; height: number; color?: string }> = ({
  data,
  width,
  height,
  color = Colors.text,
}) => {
  if (data.length < 2 || width <= 0) return <svg width={Math.max(0, width)} height={height} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const inset = 2;
  const plotHeight = height - inset * 2;

  const coords = data.map((value, i) => ({
    x: (i / (data.length - 1)) * width,
    y: inset + plotHeight - ((value - min) / span) * plotHeight,
  }));

  const points = coords.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `M ${coords[0].x},${height} L ${coords.map(({ x, y }) => `${x},${y}`).join(" L ")} L ${
    coords[coords.length - 1].x
  },${height} Z`;

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.28} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const StatTile: React.FC<{
  label: string;
  value: string;
  delta?: { text: string; good: boolean };
  hint?: string;
  icon?: IconName;
  alert?: boolean;
}> = ({ label, value, delta, hint, icon, alert = false }) => (
  <Card tone={alert ? "alert" : "default"} style={{ flex: "1 1 45%", minWidth: 140, minHeight: 116, gap: Spacing.one }}>
    <div style={{ display: "flex", alignItems: "center", gap: Spacing.two }}>
      {icon ? <Icon name={icon} size={16} color={alert ? Colors.danger : Colors.textSecondary} /> : null}
      <Text type="small" color={alert ? "danger" : "textSecondary"}>
        {label}
      </Text>
    </div>
    <Text type="cardValue" color={alert ? "danger" : undefined}>
      {value}
    </Text>
    {delta ? (
      <Text type="small" color={delta.good ? "success" : "danger"}>
        {delta.text}
      </Text>
    ) : hint ? (
      <Text type="small" color={alert ? "danger" : "textMuted"}>
        {hint}
      </Text>
    ) : null}
  </Card>
);

export const PrimaryButton: React.FC<{
  label: string;
  variant?: "primary" | "secondary";
  style?: React.CSSProperties;
}> = ({ label, variant = "primary", style }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: `${Spacing.three}px ${Spacing.four}px`,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderStyle: "solid",
      backgroundColor: variant === "primary" ? Colors.accent : Colors.surfaceRaised,
      borderColor: variant === "primary" ? Colors.accent : Colors.surfaceRaised,
      ...style,
    }}
  >
    <span
      style={{
        fontSize: 17,
        fontWeight: 700,
        color: variant === "primary" ? Colors.accentInk : Colors.text,
      }}
    >
      {label}
    </span>
  </div>
);

export const Stepper: React.FC<{ label: string; value: number; contribution: string; alert?: boolean }> = ({
  label,
  value,
  contribution,
  alert,
}) => (
  <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.three }}>
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: Spacing.half }}>
      <Text type="smallBold">{label}</Text>
      <Text type="small" color={alert ? "danger" : "textSecondary"}>
        {contribution}
      </Text>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: Spacing.three, flexShrink: 0 }}>
      <StepButton glyph="−" />
      <span
        style={{
          fontSize: 20,
          fontWeight: 700,
          minWidth: 28,
          textAlign: "center",
          color: Colors.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <StepButton glyph="+" />
    </div>
  </Card>
);

const StepButton: React.FC<{ glyph: string }> = ({ glyph }) => (
  <div
    style={{
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.surfaceRaised,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 20,
      fontWeight: 700,
      color: Colors.text,
    }}
  >
    {glyph}
  </div>
);

/** The company's square identity tile — emoji logo, or the name's initials. */
export const CompanyLogoTile: React.FC<{ name: string; logo?: string; size?: number }> = ({
  name,
  logo,
  size = 48,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: Radius.md,
      backgroundColor: Colors.surfaceRaised,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: Colors.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {logo ? (
      <span style={{ fontSize: Math.round(size * 0.55), lineHeight: 1 }}>{logo}</span>
    ) : (
      <Text type="smallBold">{name.slice(0, 2).toUpperCase()}</Text>
    )}
  </div>
);
