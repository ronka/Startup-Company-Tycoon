import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'default'
  | 'title'
  | 'small'
  | 'smallBold'
  | 'subtitle'
  | 'link'
  | 'linkPrimary'
  | 'code'
  /** The one huge number on a hero card (e.g. HQ valuation). */
  | 'hero'
  /** The headline number inside a stat card. */
  | 'cardValue'
  /** Uppercase, tracked-out section divider (e.g. "THIS WEEK"). */
  | 'sectionLabel'
  /** Bottom-sheet headline. */
  | 'sheetTitle';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

/** Types that carry their own ink unless the caller overrides `themeColor`. */
const DEFAULT_COLOR: Partial<Record<ThemedTextType, ThemeColor>> = {
  linkPrimary: 'accent',
  sectionLabel: 'textMuted',
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[{ color: theme[themeColor ?? DEFAULT_COLOR[type] ?? 'text'] }, themedTextStyles[type], style]}
      {...rest}
    />
  );
}

/**
 * Exposed so animated variants (e.g. AnimatedNumber) can match a `type`'s font
 * styling without going through this component. Numeric styles are
 * tabular-figure so count-up animations don't reflow the layout mid-tick.
 */
export const themedTextStyles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    fontVariant: ['tabular-nums'],
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  hero: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: 700,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  cardValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
    letterSpacing: -0.4,
  },
});
