import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PillTone = 'default' | 'strong' | 'danger' | 'accent';

/** One outlined stat chip: a label, optionally a bolder value after it. */
export function Pill({ label, value, tone = 'default' }: { label: string; value?: string; tone?: PillTone }) {
  const theme = useTheme();
  const ink =
    tone === 'danger' ? theme.danger : tone === 'accent' ? theme.accent : tone === 'strong' ? theme.text : theme.textSecondary;
  const borderColor =
    tone === 'danger' ? theme.danger : tone === 'accent' ? theme.accent : tone === 'strong' ? theme.textMuted : theme.border;

  return (
    <View style={[styles.pill, { borderColor, backgroundColor: theme.surface }]}>
      <ThemedText type="small" style={{ color: ink }} numberOfLines={1}>
        {label}
        {value ? ' ' : ''}
        {value ? <ThemedText type="smallBold" style={{ color: ink }}>{value}</ThemedText> : null}
      </ThemedText>
    </View>
  );
}

/** Horizontally scrollable strip of `Pill`s, bleeding to the screen edges. */
export function PillRow({ children, style, ...rest }: ViewProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.row, style]}
      contentContainerStyle={styles.rowContent}
      {...rest}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexGrow: 0,
  },
  rowContent: {
    gap: Spacing.two,
    paddingRight: Spacing.four,
  },
});
