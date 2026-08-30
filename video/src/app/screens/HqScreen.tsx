/** Port of `src/app/(game)/(tabs)/hq.tsx`. */

import React from "react";

import { AppScreen } from "../chrome";
import { ERA_LABEL, FOCUS_LABEL, formatCount, formatMoney, STAGE_LABEL } from "../format";
import { COMPANY, HYPE_SCORE_SCALE, type WeekSnapshot } from "../run";
import { Colors, moraleTone, Spacing } from "../theme";
import { Card, CompanyLogoTile, Pill, RingGauge, SectionHeader, Sparkline, StatTile, Text } from "../ui";

const CHART_WIDTH = 370 - Spacing.three * 2;

export const HqScreen: React.FC<{
  state: WeekSnapshot;
  history: number[];
  valuationChange: number | null;
  /** Last week's numbers, for the ▲/▼ delta badges on the stat tiles. */
  previous?: WeekSnapshot;
  /** ScrollView offset in points — see `AppScreen`. */
  scrollY?: number;
}> = ({ state, history, valuationChange, previous, scrollY = 0 }) => {
  const hasChart = history.length > 1;
  const valuationUp = (valuationChange ?? 0) >= 0;
  const mrr = state.revenue * 4;

  return (
    <AppScreen state={state} tab="hq" scrollY={scrollY}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: Spacing.three,
          padding: `${Spacing.three}px ${Spacing.four}px ${Spacing.four}px`,
        }}
      >
        {/* CompanyHeader */}
        <div style={{ display: "flex", alignItems: "center", gap: Spacing.three }}>
          <CompanyLogoTile name={COMPANY.name} logo={COMPANY.logo} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Text type="sheetTitle">{COMPANY.name}</Text>
            <Text type="small" color="textSecondary">
              {STAGE_LABEL[state.stage]} · {FOCUS_LABEL[state.focus]}
            </Text>
          </div>
        </div>

        {/* PillRow — bleeds off the right edge exactly like the ScrollView does */}
        <div style={{ display: "flex", gap: Spacing.two, overflow: "hidden" }}>
          <Pill label="Year" value={`${Math.floor(state.week / 52) + 1}`} tone="strong" />
          <Pill label="MRR" value={formatMoney(mrr)} />
          <Pill label="Hype" value={`${Math.round(state.hype * HYPE_SCORE_SCALE)}`} />
          <Pill label="Share" value={`${Math.round(state.marketShare * 100)}%`} />
          <Pill label={`${ERA_LABEL[state.era]} era`} />
        </div>

        {/* Hero valuation card */}
        <Card tone="plain" style={{ paddingTop: Spacing.three, paddingLeft: Spacing.three, paddingRight: Spacing.three }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: Spacing.three }}>
            <div style={{ display: "flex", flexDirection: "column", gap: Spacing.half, flex: 1 }}>
              <Text type="small" color="textSecondary">
                Company valuation
              </Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: Spacing.two }}>
                <Text type="hero">{formatMoney(state.valuation)}</Text>
                {valuationChange !== null && Math.abs(valuationChange) >= 0.1 ? (
                  <Text type="smallBold" color={valuationUp ? "success" : "danger"} style={{ whiteSpace: "nowrap" }}>
                    {valuationUp ? "↗" : "↘"} {Math.abs(valuationChange).toFixed(1)}%
                  </Text>
                ) : null}
              </div>
              <Text type="small" color="textMuted">
                Week {state.week} · post-money est.
              </Text>
            </div>
            <RingGauge percent={state.morale} label="team" caption="Morale" tone={moraleTone(state.morale)} />
          </div>
          {hasChart ? (
            <div
              style={{
                marginTop: Spacing.three,
                marginLeft: -Spacing.three,
                marginRight: -Spacing.three,
                height: 72,
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              <Sparkline data={history} width={CHART_WIDTH + Spacing.three * 2} height={72} />
            </div>
          ) : null}
        </Card>

        {/* Stat grid */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: Spacing.three }}>
          <StatTile
            label="Revenue"
            value={formatMoney(state.revenue)}
            icon="trendUp"
            delta={deltaFor(state.revenue, previous?.revenue, formatMoney, "up")}
          />
          <StatTile
            label="Burn / wk"
            value={formatMoney(state.burn)}
            icon="flame"
            hint="Tap for breakdown"
            delta={deltaFor(state.burn, previous?.burn, formatMoney, "down")}
          />
          <StatTile
            label="Hype"
            value={`${Math.round(state.hype * HYPE_SCORE_SCALE)}`}
            icon="bolt"
            delta={deltaFor(
              state.hype * HYPE_SCORE_SCALE,
              previous ? previous.hype * HYPE_SCORE_SCALE : undefined,
              (n) => `${Math.round(n)}`,
              "up",
            )}
          />
          <StatTile
            label="Active users"
            value={formatCount(Math.round(state.customers))}
            icon="people"
            delta={deltaFor(state.customers, previous?.customers, (n) => formatCount(Math.round(n)), "up")}
          />
        </div>

        {/* Strategy */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: Spacing.one }}>
            <Text type="sectionLabel">Strategy</Text>
            <Text type="small" color="accent">
              Change
            </Text>
          </div>
          <Text type="default">{FOCUS_LABEL[state.focus]}</Text>
          <Text type="small" color="textSecondary">
            Riding the {state.trend.id} wave — {state.trend.phase} phase.
          </Text>
        </Card>

        {/* This week */}
        <div style={{ display: "flex", flexDirection: "column", gap: Spacing.two, marginTop: Spacing.two }}>
          <SectionHeader label="This week" action="View all" />
          <Card style={{ gap: Spacing.three }}>
            {state.news.slice(0, 3).map((entry, i) => (
              <div key={`${entry.week}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: Spacing.three }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginTop: 8,
                    flexShrink: 0,
                    backgroundColor:
                      entry.kind === "era"
                        ? Colors.accent
                        : entry.kind === "digest"
                          ? Colors.text
                          : entry.kind === "trend"
                            ? Colors.warning
                            : entry.choiceLabel
                              ? Colors.warning
                              : Colors.textMuted,
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <Text type="default" style={ELLIPSIS}>
                    {entry.title}
                  </Text>
                  <Text type="small" color="textSecondary" style={ELLIPSIS}>
                    {entry.choiceLabel ? `→ ${entry.choiceLabel}` : entry.flavor}
                  </Text>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppScreen>
  );
};

const ELLIPSIS: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * The ▲/▼ badge, using the app's rule: compare *formatted* values, so a move
 * too small to change the rendered number shows no badge at all.
 */
function deltaFor(
  value: number,
  previous: number | undefined,
  format: (n: number) => string,
  goodDirection: "up" | "down",
) {
  if (previous === undefined || !Number.isFinite(previous) || format(value) === format(previous)) return undefined;
  const delta = value - previous;
  const good = delta > 0 ? goodDirection === "up" : goodDirection === "down";
  return { text: `${delta > 0 ? "▲" : "▼"} ${format(Math.abs(delta))}`, good };
}
