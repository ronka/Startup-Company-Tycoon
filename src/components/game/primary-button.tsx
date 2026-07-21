import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function PrimaryButton({
  label,
  variant = 'primary',
  style,
  disabled,
  loading,
  ...rest
}: PressableProps & { label: string; variant?: 'primary' | 'secondary'; loading?: boolean }) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isDisabled = !!disabled || !!loading;

  const background = isDisabled ? theme.surface : isPrimary ? theme.accent : theme.surfaceRaised;
  const labelColor = isDisabled ? theme.textMuted : isPrimary ? theme.accentInk : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.button,
        { backgroundColor: background, borderColor: isDisabled ? theme.border : background },
        state.pressed && !isDisabled && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <ThemedText style={[styles.label, { color: labelColor }]}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
  },
});
