/**
 * The app's design tokens, mirrored from `src/constants/theme.ts` in the
 * Startup Empire Tycoon repo so the screens rebuilt here render pixel-close to
 * the real thing. Kept as a plain copy rather than an import: the app's module
 * pulls in `global.css` and `react-native`, neither of which belongs in a
 * Remotion bundle.
 */

export const Colors = {
  background: "#0A0A0A",
  surface: "#161616",
  surfaceRaised: "#1F1F1F",
  border: "#262626",
  text: "#FAFAFA",
  textSecondary: "#A1A1A1",
  textMuted: "#6B6B6B",
  accent: "#3C87F7",
  accentInk: "#FFFFFF",
  accentSurface: "#10243F",
  danger: "#FF6B5E",
  dangerBackground: "#2A1210",
  warning: "#F59E0B",
  warningBackground: "#2A1B04",
  success: "#4ADE80",
  successBackground: "#132B1D",
} as const;

export type ThemeColor = keyof typeof Colors;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
  sheet: 28,
} as const;

/**
 * The app runs on iOS, so SF Pro *is* the app's typeface. Rendering happens in
 * headless Chrome on macOS, where `-apple-system` resolves to it — no webfont
 * needed, and the result matches a real device screenshot.
 */
export const FONT_STACK =
  '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

/** The app's `themedTextStyles` ramp, as CSS. */
export const TextStyles = {
  small: { fontSize: 14, lineHeight: "20px", fontWeight: 500 },
  smallBold: { fontSize: 14, lineHeight: "20px", fontWeight: 700 },
  default: { fontSize: 16, lineHeight: "24px", fontWeight: 500 },
  hero: {
    fontSize: 44,
    lineHeight: "50px",
    fontWeight: 700,
    letterSpacing: -1,
  },
  cardValue: {
    fontSize: 26,
    lineHeight: "32px",
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
  },
  sheetTitle: {
    fontSize: 24,
    lineHeight: "30px",
    fontWeight: 700,
    letterSpacing: -0.4,
  },
} as const;

/** Morale bands: red under 30, amber under 60, green above — `stat-colors.ts`. */
export function moraleTone(percent: number): ThemeColor {
  if (percent < 30) return "danger";
  if (percent < 60) return "warning";
  return "success";
}
