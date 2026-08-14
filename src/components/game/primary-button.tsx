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
}: PressableProps & {
  label: string;
  /**
   * `ghost` has no fill and no visible border — for tertiary actions that shouldn't compete with the CTA.
   * `danger` is a filled destructive confirm, for when the action sits next to a blue CTA and must not
   * be mistaken for it.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';
  const isDisabled = !!disabled || !!loading;

  // Ghost keeps the shared hairline border so every variant occupies the same
  // height in a stack, but paints it transparent. Its disabled state is the
  // muted label alone — the `theme.surface` fill would give it the body the
  // variant is defined by not having.
  const background = isGhost
    ? 'transparent'
    : isDisabled
      ? theme.surface
      : isDanger
        ? theme.danger
        : isPrimary
          ? theme.accent
          : theme.surfaceRaised;
  const borderColor = isGhost ? 'transparent' : isDisabled ? theme.border : background;
  const labelColor = isDisabled
    ? theme.textMuted
    : isGhost
      ? theme.accent
      : isPrimary || isDanger
        ? theme.accentInk
        : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.button,
        { backgroundColor: background, borderColor },
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
