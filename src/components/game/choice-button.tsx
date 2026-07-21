import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChoiceTone = 'primary' | 'neutral' | 'caution';

/**
 * One row of a decision card: the choice on the left, its consequence on the
 * right. Tone is about emphasis and irreversibility (`caution` = ends the
 * run), never about which answer is "correct" — decision cards are trade-offs.
 */
export function ChoiceButton({
  label,
  consequence,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  consequence: string;
  tone?: ChoiceTone;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isPrimary = tone === 'primary';
  const background = isPrimary ? theme.accent : theme.surfaceRaised;
  const labelColor = isPrimary ? theme.accentInk : tone === 'caution' ? theme.warning : theme.text;
  const consequenceColor = isPrimary ? theme.accentInk : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${consequence}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: background, borderColor: tone === 'caution' ? theme.warning : theme.border },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={[styles.label, { color: labelColor }]}>
        {label}
      </ThemedText>
      <View style={styles.consequence}>
        <ThemedText type="small" style={[styles.consequenceText, { color: consequenceColor }]}>
          {consequence}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
    flexShrink: 1,
  },
  consequence: {
    flexShrink: 1,
    maxWidth: '45%',
  },
  consequenceText: {
    textAlign: 'right',
  },
});
