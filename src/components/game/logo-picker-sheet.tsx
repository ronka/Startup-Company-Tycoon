import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { randomCompanyLogo, sanitizeCompanyLogo } from '@/game/company-logo';
import { useTheme } from '@/hooks/use-theme';

/**
 * Pick the company's emoji logo with the system emoji keyboard.
 *
 * The sheet owns a local draft — always one sanitized emoji or empty — and
 * commits **once**, on close, so trying a few emoji before settling costs one
 * dispatch, one analytics event and one autosave rather than one per keystroke.
 *
 * Every keystroke is normalized straight back into the field, which is what
 * makes the emoji keyboard behave like a picker: tapping a second emoji replaces
 * the first instead of appending to a growing string.
 */
export function LogoPickerSheet({
  visible,
  logo,
  onCommit,
  onClose,
}: {
  visible: boolean;
  logo?: string;
  /** Fired once as the sheet closes. `null` means "no logo — use initials". */
  onCommit: (logo: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  // Always exactly one emoji, or empty — never the raw text. Normalizing here
  // rather than at commit time is what makes each new emoji *replace* the last
  // one instead of the field piling them up; `sanitizeCompanyLogo` keeps the
  // most recent cluster, so tapping around the emoji keyboard just swaps the logo.
  const [draft, setDraft] = useState(logo ?? '');

  const close = () => {
    const next = draft || null;
    // Opening and closing without changing anything shouldn't dispatch, track an
    // event, or rewrite the save.
    if (next !== (logo ?? null)) onCommit(next);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="Company logo" avoidKeyboard>
      {/* The field itself is the preview — it holds exactly one emoji, at logo size. */}
      <TextInput
        value={draft}
        // Anything that isn't an emoji — a letter, a paste — clears the field
        // rather than sitting there, so what's shown is always what gets saved.
        onChangeText={(text) => setDraft(sanitizeCompanyLogo(text) ?? '')}
        autoFocus
        maxLength={24}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        textAlign="center"
        placeholder="🚀"
        placeholderTextColor={theme.textMuted}
        accessibilityLabel="Company logo emoji"
        style={[styles.input, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, color: theme.text }]}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        Tap 🙂 on your keyboard and pick an emoji. Each one replaces the last.
      </ThemedText>

      <PrimaryButton label="Random" variant="ghost" onPress={() => setDraft(randomCompanyLogo(draft))} />
      <PrimaryButton label="Done" onPress={close} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 34,
  },
  hint: {
    textAlign: 'center',
  },
});
