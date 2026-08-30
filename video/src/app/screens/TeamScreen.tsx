/** Port of `src/app/(game)/(tabs)/team.tsx`. */

import React from "react";

import { AppScreen } from "../chrome";
import { formatMoney } from "../format";
import type { Candidate, WeekSnapshot } from "../run";
import { Colors, moraleTone, Radius, Spacing } from "../theme";
import { Card, PrimaryButton, ProgressBar, RingGauge, SectionHeader, Stepper, Text } from "../ui";

const MORALE_CRISIS_THRESHOLD = 60;
const MORALE_ATTRITION_THRESHOLD = 40;
/** `WEEKLY_SALARY` from the app's balance module. */
const WEEKLY_SALARY = { devs: 2500, sales: 2000, support: 1500 };
const CUSTOMERS_PER_SUPPORT = 200;

const SEATS: { role: "cto" | "cmo" | "cfo"; title: string }[] = [
  { role: "cto", title: "CTO" },
  { role: "cmo", title: "CMO" },
  { role: "cfo", title: "CFO" },
];

export const TeamScreen: React.FC<{
  state: WeekSnapshot;
  /** Roster rows revealed one at a time as the hire lands. 3 = all seats filled. */
  seatsFilled?: number;
  /** ScrollView offset in points — see `AppScreen`. */
  scrollY?: number;
}> = ({ state, seatsFilled = 3, scrollY = 0 }) => {
  const payroll =
    state.headcount.devs * WEEKLY_SALARY.devs +
    state.headcount.sales * WEEKLY_SALARY.sales +
    state.headcount.support * WEEKLY_SALARY.support;
  const supportCovered = Math.min(state.customers, state.headcount.support * CUSTOMERS_PER_SUPPORT);
  const shortfall = supportCovered < state.customers;

  return (
    <AppScreen state={state} tab="team" scrollY={scrollY}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: Spacing.four,
          padding: `${Spacing.four}px ${Spacing.four}px ${Spacing.six}px`,
        }}
      >
        <Text type="sheetTitle">Team</Text>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: Spacing.three }}>
          <RingGauge percent={state.morale} label="team" tone={moraleTone(state.morale)} size={80} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: Spacing.two }}>
            <SectionHeader label="Morale" />
            <ProgressBar
              percent={state.morale}
              color={Colors[moraleTone(state.morale)]}
              markers={[MORALE_CRISIS_THRESHOLD, MORALE_ATTRITION_THRESHOLD]}
            />
            <Text type="small" color="textSecondary">
              Below 60 the team slows down; below 40 people start leaving.
            </Text>
          </div>
        </Card>

        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: Spacing.half }}>
            <Text type="smallBold">Team offsite &amp; perks</Text>
            <Text type="small" color="textSecondary">
              $4K/wk · +3 morale/wk
            </Text>
          </div>
          <PrimaryButton label={state.moraleLeverActive ? "Turn off" : "Turn on"} variant={state.moraleLeverActive ? "secondary" : "primary"} />
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: Spacing.three }}>
          <Stepper
            label="Developers"
            value={state.headcount.devs}
            contribution={`${state.headcount.devs} devs → +${Math.round(state.headcount.devs * 42)} quality/wk`}
          />
          <Stepper
            label="Sales"
            value={state.headcount.sales}
            contribution={`${state.headcount.sales} sales → ~${Math.round(
              10 + 12 * Math.pow(state.headcount.sales, 0.9),
            )} leads/wk`}
          />
          <Stepper
            label="Support"
            value={state.headcount.support}
            alert={shortfall}
            contribution={`${state.headcount.support} support → covering ${Math.round(
              supportCovered,
            )}/${Math.round(state.customers)} customers`}
          />
        </div>

        <Card style={{ gap: Spacing.half }}>
          <Text type="sectionLabel">Next week&apos;s payroll</Text>
          <Text type="cardValue">{formatMoney(payroll)}</Text>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: Spacing.two }}>
          <SectionHeader label="Leadership" />
          <Card tone="plain">
            {SEATS.map((seat, i) => (
              <div key={seat.role}>
                {i > 0 ? <div style={{ height: 1, backgroundColor: Colors.border, marginLeft: 76 }} /> : null}
                <SeatRow title={seat.title} hired={i < seatsFilled ? state.cLevels[seat.role] : null} />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppScreen>
  );
};

const SeatRow: React.FC<{ title: string; hired: Candidate | null }> = ({ title, hired }) => (
  <div style={{ display: "flex", alignItems: "center", gap: Spacing.three, padding: Spacing.three }}>
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hired ? Colors.accentSurface : Colors.surfaceRaised,
        border: `1px solid ${hired ? Colors.accent : Colors.border}`,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, color: hired ? Colors.accent : Colors.textMuted }}>
        {hired ? initials(hired.name) : "–"}
      </span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: Spacing.two }}>
        <Text type="sectionLabel">{title}</Text>
        {hired ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: Colors.warning,
              border: `1px solid ${Colors.warning}`,
              borderRadius: Radius.pill,
              padding: "0 6px",
            }}
          >
            {hired.tier}
          </span>
        ) : null}
      </div>
      <Text type="smallBold">{hired ? hired.name : "Seat open"}</Text>
      <Text type="small" color="textSecondary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
        {hired ? `${hired.perk.label} · ${formatMoney(hired.salary)}/wk` : "Spin to see who's available"}
      </Text>
    </div>
    <Text type="small" color="textMuted">
      ›
    </Text>
  </div>
);

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
