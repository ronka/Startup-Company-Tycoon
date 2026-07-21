import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardTone = 'default' | 'alert' | 'accent' | 'plain';

/**
 * The one surface every screen sits its content on: dark fill, hairline
 * border, large radius. `plain` drops the padding for cards that manage their
 * own insets (e.g. a chart that bleeds to the edge).
 */
export function Card({
  tone = 'default',
  style,
  ...rest
}: ViewProps & { tone?: CardTone }) {
  const theme = useTheme();
  const background =
    tone === 'alert' ? theme.dangerBackground : tone === 'accent' ? theme.accentSurface : theme.surface;
  const borderColor =
    tone === 'alert' ? theme.danger : tone === 'accent' ? theme.accent : theme.border;

  return (
    <View
      style={[
        styles.card,
        tone !== 'plain' && styles.padded,
        { backgroundColor: background, borderColor },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
