/**
 * An iPhone 16 Pro shell at its real logical size (402×874pt), so the app UI
 * inside is laid out at the exact dimensions it gets on device rather than
 * being squeezed into an arbitrary rectangle. Scale the whole thing with the
 * `scale` prop; nothing inside needs to know.
 */

import React from "react";

import { Colors, FONT_STACK } from "./theme";

export const PHONE_WIDTH = 402;
export const PHONE_HEIGHT = 874;
/** iOS top safe-area inset on a Dynamic Island device. */
export const SAFE_TOP = 59;

export const PhoneFrame: React.FC<{
  scale?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ scale = 1, style, children }) => (
  <div
    style={{
      width: PHONE_WIDTH,
      height: PHONE_HEIGHT,
      scale,
      position: "relative",
      borderRadius: 56,
      // The titanium band, then the black bezel inside it.
      background: "linear-gradient(160deg, #6E6E73 0%, #2A2A2E 30%, #1A1A1C 60%, #55555A 100%)",
      padding: 3,
      boxShadow: "0 60px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)",
      fontFamily: FONT_STACK,
      ...style,
    }}
  >
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 53,
        backgroundColor: "#000",
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 44,
          overflow: "hidden",
          backgroundColor: Colors.background,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <StatusBar />
        {children}
        {/* Home indicator */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            translate: "-50% 0",
            width: 140,
            height: 5,
            borderRadius: 3,
            backgroundColor: "rgba(250,250,250,0.55)",
          }}
        />
      </div>
    </div>
  </div>
);

const StatusBar: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: SAFE_TOP,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 30px 0",
      boxSizing: "border-box",
      zIndex: 3,
      pointerEvents: "none",
    }}
  >
    <span style={{ color: Colors.text, fontSize: 17, fontWeight: 600, letterSpacing: 0.2 }}>9:41</span>
    {/* Dynamic Island */}
    <div
      style={{
        position: "absolute",
        top: 11,
        left: "50%",
        translate: "-50% 0",
        width: 125,
        height: 37,
        borderRadius: 20,
        backgroundColor: "#000",
      }}
    />
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {/* Cellular bars */}
      <svg width={18} height={12} viewBox="0 0 18 12">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 4.6}
            y={11 - (i + 1) * 2.6}
            width={3.1}
            height={(i + 1) * 2.6}
            rx={1}
            fill={Colors.text}
          />
        ))}
      </svg>
      {/* Wi-Fi */}
      <svg width={16} height={12} viewBox="0 0 16 12">
        <path
          d="M8 10.6 5.7 8.2a3.3 3.3 0 0 1 4.6 0L8 10.6Zm-4-4.1L2.2 4.7a8.2 8.2 0 0 1 11.6 0L12 6.5a5.7 5.7 0 0 0-8 0Z"
          fill={Colors.text}
        />
      </svg>
      {/* Battery */}
      <svg width={26} height={13} viewBox="0 0 26 13">
        <rect x={0.5} y={0.5} width={22} height={12} rx={3.6} stroke={Colors.text} strokeOpacity={0.4} fill="none" />
        <rect x={2} y={2} width={19} height={9} rx={2.4} fill={Colors.text} />
        <path d="M24 4.6v3.8a2 2 0 0 0 0-3.8Z" fill={Colors.text} fillOpacity={0.4} />
      </svg>
    </div>
  </div>
);
