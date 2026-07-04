import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const ACCENT = '#3c87f7';

export function PrimaryButton({
  label,
  variant = 'primary',
  style,
  disabled,
  ...rest
}: PressableProps & { label: string; variant?: 'primary' | 'secondary' }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={(state) => [
        styles.button,
        isPrimary ? styles.primary : styles.secondary,
        state.pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <ThemedText
        style={[
          styles.label,
          isPrimary ? styles.primaryLabel : styles.secondaryLabel,
          disabled && styles.disabledLabel,
        ]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: ACCENT,
  },
  secondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ACCENT,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    backgroundColor: '#8b93a1',
    borderColor: '#8b93a1',
    opacity: 0.5,
  },
  disabledLabel: {
    color: '#ffffff',
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
  },
  primaryLabel: {
    color: '#ffffff',
  },
  secondaryLabel: {
    color: ACCENT,
  },
});
