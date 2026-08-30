/**
 * The chrome every game tab sits inside: the HUD strip up top (`hud.tsx`), the
 * tab bar and the Next Week button at the bottom (`(tabs)/_layout.tsx` +
 * `game-chrome.tsx`).
 */

import React from "react";

import { formatCount, formatMoney, formatWeeks } from "./format";
import { Icon, type IconName } from "./icons";
import { SAFE_TOP } from "./PhoneFrame";
import type { WeekSnapshot } from "./run";
import { Colors, Radius, Spacing } from "./theme";
import { PrimaryButton, Text } from "./ui";

export type TabId = "hq" | "team" | "money" | "market";

export const Hud: React.FC<{ state: WeekSnapshot }> = ({ state }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: Spacing.two,
      paddingTop: SAFE_TOP + Spacing.two,
      paddingBottom: Spacing.two,
      paddingLeft: Spacing.three,
      paddingRight: Spacing.three,
      borderBottom: `1px solid ${Colors.border}`,
      backgroundColor: Colors.background,
      flexShrink: 0,
    }}
  >
    <div style={{ paddingRight: Spacing.one, color: Colors.textSecondary, fontSize: 22, lineHeight: "26px" }}>☰</div>
    <HudChip label="Cash" value={formatMoney(state.cash)} />
    <HudChip label="Runway" value={state.runway === null ? "∞" : formatWeeks(state.runway)} />
    <HudChip label="Users" value={formatCount(Math.round(state.customers))} />
    <HudChip label="Week" value={`${state.week}`} />
  </div>
);

const HudChip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: Spacing.half,
      padding: `${Spacing.one}px ${Spacing.two}px`,
      borderRadius: Radius.sm,
      border: `1px solid ${Colors.border}`,
      backgroundColor: Colors.surface,
    }}
  >
    <Text type="small" color="textMuted">
      {label}
    </Text>
    <Text type="smallBold">{value}</Text>
  </div>
);

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "hq", label: "HQ", icon: "building" },
  { id: "team", label: "Team", icon: "people" },
  { id: "money", label: "Money", icon: "dollar" },
  { id: "market", label: "Market", icon: "trendUp" },
];

export const BottomChrome: React.FC<{ tab: TabId }> = ({ tab }) => (
  <div style={{ flexShrink: 0, backgroundColor: Colors.background, borderTop: `1px solid ${Colors.border}` }}>
    <div style={{ display: "flex", paddingTop: Spacing.two, paddingBottom: Spacing.one }}>
      {TABS.map((entry) => (
        <div
          key={entry.id}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Icon name={entry.icon} size={24} color={entry.id === tab ? Colors.accent : Colors.textSecondary} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: entry.id === tab ? Colors.accent : Colors.textSecondary,
            }}
          >
            {entry.label}
          </span>
        </div>
      ))}
    </div>
    <div style={{ padding: `${Spacing.two}px ${Spacing.four}px ${Spacing.five}px` }}>
      <PrimaryButton label="Next Week  →" />
    </div>
  </div>
);

/**
 * A tab screen: HUD, scrolling body, tab bar + Next Week.
 *
 * `scrollY` stands in for the body's ScrollView offset, in points — a scene
 * animates it to bring the part of the screen it is talking about into view,
 * the way a player's thumb would.
 */
export const AppScreen: React.FC<{
  state: WeekSnapshot;
  tab: TabId;
  scrollY?: number;
  children: React.ReactNode;
}> = ({ state, tab, scrollY = 0, children }) => (
  <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: Colors.background }}>
    <Hud state={state} />
    <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
      <div style={{ translate: `0px ${-scrollY}px` }}>{children}</div>
    </div>
    <BottomChrome tab={tab} />
  </div>
);
