/**
 * The SF Symbols the app draws through `expo-symbols`, redrawn as inline SVG.
 * Emoji were the obvious shortcut and the wrong one — they render in colour
 * and at the wrong weight, which is instantly the tell that this isn't the app.
 */

import React from "react";

export type IconName = "building" | "people" | "dollar" | "trendUp" | "flame" | "bolt";

export const Icon: React.FC<{ name: IconName; size?: number; color: string }> = ({ name, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: "block" }}>
    {PATHS[name](color)}
  </svg>
);

const PATHS: Record<IconName, (color: string) => React.ReactNode> = {
  /** building.2.fill */
  building: (c) => (
    <>
      <rect x="3" y="4" width="8.5" height="17" rx="1.2" fill={c} />
      <rect x="12.8" y="9" width="8.2" height="12" rx="1.2" fill={c} opacity={0.75} />
      {[6, 9.4].map((x) =>
        [6.4, 9.6, 12.8, 16].map((y) => <rect key={`${x}-${y}`} x={x - 1.2} y={y} width="2" height="2" rx="0.4" fill="#0A0A0A" />),
      )}
      {[15.6, 18.4].map((x) =>
        [11.4, 14.6, 17.8].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="1.8" height="1.8" rx="0.4" fill="#0A0A0A" />),
      )}
    </>
  ),
  /** person.2.fill */
  people: (c) => (
    <>
      <circle cx="9" cy="8" r="3.6" fill={c} />
      <path d="M2.4 19.4c0-3.3 2.9-5.4 6.6-5.4s6.6 2.1 6.6 5.4c0 .7-.5 1.1-1.2 1.1H3.6c-.7 0-1.2-.4-1.2-1.1Z" fill={c} />
      <circle cx="17.4" cy="9.2" r="2.9" fill={c} opacity={0.7} />
      <path d="M15 14.3c.8-.2 1.6-.3 2.4-.3 2.9 0 4.8 1.6 4.8 4 0 .6-.4 1-1 1h-3.7c.1-.4.1-.7.1-1.1 0-1.4-.9-2.7-2.6-3.6Z" fill={c} opacity={0.7} />
    </>
  ),
  /** dollarsign.circle.fill */
  dollar: (c) => (
    <>
      <circle cx="12" cy="12" r="9.4" fill={c} />
      <path
        d="M12 5.6v1.6m0 9.2v1.6M15 9.1c-.4-1-1.6-1.7-3-1.7-1.7 0-3 .9-3 2.2 0 1.4 1.2 1.9 3 2.3 1.9.4 3.2.9 3.2 2.4 0 1.4-1.4 2.3-3.2 2.3-1.6 0-2.8-.7-3.2-1.8"
        stroke="#0A0A0A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
  /** chart.line.uptrend.xyaxis */
  trendUp: (c) => (
    <>
      <path d="M3 4v15.2c0 .7.6 1.3 1.3 1.3H21" stroke={c} strokeWidth="1.8" strokeLinecap="round" opacity={0.55} />
      <path d="M6.5 15.6 10.4 11l3 2.6 4.4-5.7" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.6 7.5h4.2v4.2" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /** flame.fill */
  flame: (c) => (
    <path
      d="M12.7 2.2c.3 2.6-.7 4-2 5.3-1.5 1.5-3.3 3-3.3 6.1 0 3.6 2.5 6.2 5.6 6.2 3.2 0 5.6-2.5 5.6-6 0-3.9-2.6-6.5-4.2-8.3-.7-.8-1.2-1.6-1.7-3.3Zm-.4 10.3c.2 1.3-.3 1.9-.8 2.5-.5.5-1.1 1.1-1.1 2.1 0 1.3.9 2.2 2 2.2 1.2 0 2.1-.9 2.1-2.2 0-1.4-1-2.3-1.6-3-.3-.4-.5-.8-.6-1.6Z"
      fill={c}
    />
  ),
  /** bolt.fill */
  bolt: (c) => <path d="M13.9 2 5.4 13.1c-.4.5 0 1.2.6 1.2h4.2l-1.2 7.5c-.1.7.8 1.1 1.2.5l8.5-11.1c.4-.5 0-1.2-.6-1.2h-4.2l1.2-7.5c.1-.7-.8-1.1-1.2-.5Z" fill={c} />,
};
