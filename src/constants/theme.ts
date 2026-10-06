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
  background: '#080E16',
  /** Cards, pills, sheet bodies. */
  surface: '#141E2B',
  /** Nested rows inside a card, pressed states. */
  surfaceRaised: '#202D3F',
  /** 1px card/pill hairlines. */
  border: '#3A495D',
  text: '#FAFAFA',
  textSecondary: '#AFBCD3',
  /** Section labels, timestamps — quieter than `textSecondary`. */
  textMuted: '#8493AB',
  /**
   * Brand blue — primary actions, links, selected state. Same family as the
   * splash/icon navy, brightened so it carries on a near-black canvas.
   */
  accent: '#2785FF',
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
  success: '#29E78B',
  successBackground: '#132B1D',
  /** Aliases kept so pre-redesign `ThemedView type=` call sites keep working. */
  backgroundElement: '#141E2B',
  backgroundSelected: '#202D3F',
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
  lg: 24,
  pill: 999,
  sheet: 28,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
