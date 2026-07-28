import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Up to two initials from the company name — "Nimbus Labs" → "NL". */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The company's square identity tile: its emoji logo, or the name's initials
 * when no logo is set (existing saves, or a player who cleared theirs).
 *
 * Shared by the HQ header and the founding form so both read identically.
 * Given `onPress` it becomes a button that opens the logo picker.
 */
export function CompanyLogoTile({
  name,
  logo,
  size = 48,
  onPress,
  style,
}: {
  name: string;
  logo?: string | null;
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  const content = logo ? (
    // The initials type ramp is far too small for an emoji, so the glyph gets
    // its own size scaled off the tile.
    <Text style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.7), textAlign: 'center' }}>
      {logo}
    </Text>
  ) : (
    <ThemedText type="smallBold">{initialsFor(name)}</ThemedText>
  );

  const tileStyle = [
    styles.tile,
    { width: size, height: size, backgroundColor: theme.surfaceRaised, borderColor: theme.border },
    style,
  ];

  if (!onPress) return <View style={tileStyle}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Change company logo"
      style={({ pressed }) => [...tileStyle, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
