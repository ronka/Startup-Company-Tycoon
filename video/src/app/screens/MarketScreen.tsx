/** Port of `src/app/(game)/(tabs)/market.tsx`. */

import React from "react";

import { AppScreen } from "../chrome";
import { ERA_LABEL, FOCUS_LABEL, formatCount, TREND_LABEL, TREND_PHASE_LABEL } from "../format";
import type { WeekSnapshot } from "../run";
import { Colors, Radius, Spacing } from "../theme";
import { Card, ProgressBar, SectionHeader, Text } from "../ui";

const HYPE_MIN = 0.5;
const HYPE_MAX = 2.5;
const ERA_ORDER = ["scrappy", "boom", "reckoning"];

export const MarketScreen: React.FC<{ state: WeekSnapshot; scrollY?: number }> = ({ state, scrollY = 0 }) => {
  const rivalColors = [Colors.warning, Colors.danger];
  const rivalShareTotal = state.rivals.reduce((sum, rival) => sum + rival.marketShare, 0);
  const restOfMarket = Math.max(0, 1 - state.marketShare - rivalShareTotal);
  const hypePercent = ((state.hype - HYPE_MIN) / (HYPE_MAX - HYPE_MIN)) * 100;

  return (
    <AppScreen state={state} tab="market" scrollY={scrollY}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: Spacing.four,
          padding: `${Spacing.four}px ${Spacing.four}px ${Spacing.six}px`,
        }}
      >
        <Text type="sheetTitle">Market</Text>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text type="sectionLabel">Trend</Text>
            <Text type="smallBold">
              {TREND_LABEL[state.trend.id]} · {TREND_PHASE_LABEL[state.trend.phase]}
            </Text>
          </div>
          <Text type="small" color="textSecondary">
            {state.trend.weeksInPhase} wk in phase · chasing whatever is hot.
          </Text>
        </Card>

        <Card style={{ gap: Spacing.three }}>
          <SectionHeader label="Market share" />
          <ShareRow
            label="You"
            percent={state.marketShare * 100}
            color={Colors.accent}
            customers={Math.round(state.customers)}
          />
          {state.rivals.map((rival, index) => (
            <ShareRow
              key={rival.name}
              label={rival.name}
              percent={rival.marketShare * 100}
              color={rivalColors[index % rivalColors.length]}
              edge={state.productQuality - rival.productQuality}
              focus={rival.focus}
              customers={Math.round(rival.marketShare * state.marketCustomers)}
            />
          ))}
          <ShareRow label="Rest of market" percent={restOfMarket * 100} color={Colors.border} />
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text type="sectionLabel">Hype</Text>
            <Text type="smallBold">{state.hype.toFixed(2)}x</Text>
          </div>
          <ProgressBar percent={hypePercent} color={Colors.accent} />
        </Card>

        <Card>
          <SectionHeader label="Era" />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {ERA_ORDER.map((era) => (
              <div key={era} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Spacing.half }}>
                <Text type="small" color={era === state.era ? "text" : "textSecondary"}>
                  {ERA_LABEL[era]}
                </Text>
                {era === state.era ? (
                  <Text type="small" color="accent">
                    ▲ you are here
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppScreen>
  );
};

const ShareRow: React.FC<{
  label: string;
  percent: number;
  color: string;
  edge?: number;
  focus?: string;
  customers?: number;
}> = ({ label, percent, color, edge, focus, customers }) => {
  // `edge` is your product quality minus this rival's: positive means you have
  // the edge, which is what `market.tsx`'s prop doc specifies. (The app's own
  // call site passes the subtraction the other way round, so a run that is
  // comfortably ahead reads "behind" in red there — see the notes on this video.)
  const edgeLabel = edge === undefined ? null : edge >= 0 ? `+${Math.round(edge)} edge` : `${Math.round(edge)} behind`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: Spacing.one }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: Spacing.two }}>
          <Text type="small">{label}</Text>
          {focus ? (
            <span
              style={{
                border: `1px solid ${Colors.border}`,
                borderRadius: Radius.pill,
                padding: "1px 8px",
                fontSize: 14,
                fontWeight: 500,
                color: Colors.textSecondary,
              }}
            >
              {FOCUS_LABEL[focus]}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: Spacing.two }}>
          {edgeLabel ? (
            <Text type="small" color={edge! >= 0 ? "success" : "danger"}>
              {edgeLabel}
            </Text>
          ) : null}
          <Text type="small" color="textSecondary">
            {percent.toFixed(1)}%
          </Text>
        </div>
      </div>
      <ProgressBar percent={percent} color={color} />
      {customers !== undefined ? (
        <Text type="small" color="textSecondary">
          {formatCount(customers)} customers
        </Text>
      ) : null}
    </div>
  );
};
