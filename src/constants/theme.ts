/**
 * The app's visual tokens. The game is **dark-only** — `Colors.light` and
 * `Colors.dark` are the same object, so `useTheme()` returns the same palette
 * whatever the OS appearance says. That keeps every existing `useTheme()` /
 * `ThemedView type=` / `themeColor=` call site working while making a stray
 * light-mode render impossible.
 */

import '@/global.css';

import { Platform } from 'react-native';

const Palette = {
  /** App canvas. */
  background: '#0A0A0A',
  /** Cards, pills, sheet bodies. */
  surface: '#161616',
  /** Nested rows inside a card, pressed states. */
  surfaceRaised: '#1F1F1F',
  /** 1px card/pill hairlines. */
  border: '#262626',
  text: '#FAFAFA',
  textSecondary: '#A1A1A1',
  /** Section labels, timestamps — quieter than `textSecondary`. */
  textMuted: '#6B6B6B',
  /**
   * Brand blue — primary actions, links, selected state. Same family as the
   * splash/icon navy, brightened so it carries on a near-black canvas.
   */
  accent: '#3C87F7',
  /** Ink on top of a solid `accent` fill. */
  accentInk: '#FFFFFF',
  /** Tinted background for accent pills/badges. */
  accentSurface: '#10243F',
  danger: '#FF6B5E',
  dangerBackground: '#2A1210',
  /** Risky / run-ending choices, mid-range morale. */
  warning: '#F59E0B',
  /** Tinted background for warning pills/badges — the legend-tier treatment. */
  warningBackground: '#2A1B04',
  /** Value moving the right way — deltas, healthy morale. Never an action colour. */
  success: '#4ADE80',
  successBackground: '#132B1D',
  /** Aliases kept so pre-redesign `ThemedView type=` call sites keep working. */
  backgroundElement: '#161616',
  backgroundSelected: '#1F1F1F',
} as const;

export const Colors = {
  light: Palette,
  dark: Palette,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Scrim behind every modal / bottom sheet. */
export const Overlay = 'rgba(0,0,0,0.6)';

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
