import { Button, Column, Host, ScrollView, Text, TextInput, type TextInputProps } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { DEFAULT_COMPANY_NAME } from '@/game/engine';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

const NAME_MAX_LENGTH = 40;

/** App accent, mirrored from PrimaryButton. Tints the native Button via the Host seed. */
const ACCENT = '#3c87f7';

export default function OnboardingScreen() {
  const { profile, setCeoName, startNewGame } = useGame();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const isReturningCeo = !!profile?.ceoName;
  // Native @expo/ui inputs manage their own text; we mirror it into React state
  // purely to drive the confirm button's enabled state.
  const [ceoName, setCeoNameInput] = useState('');
  const [companyName, setCompanyName] = useState('');

  const trimmedCeoName = ceoName.trim();
  const trimmedCompanyName = companyName.trim();
  const canConfirm = isReturningCeo
    ? trimmedCompanyName.length > 0
    : trimmedCeoName.length > 0 && trimmedCompanyName.length > 0;

  const confirm = () => {
    if (!canConfirm) return;
    if (!isReturningCeo) setCeoName(trimmedCeoName);
    startNewGame(trimmedCompanyName || DEFAULT_COMPANY_NAME);
    router.replace('/hq');
  };

  return (
    // The @expo/ui ScrollView is a SwiftUI ScrollView on iOS / Compose on
    // Android, both of which lift their content above the keyboard automatically.
    <Host style={[styles.host, { backgroundColor: theme.background, paddingTop: insets.top }]} seedColor={ACCENT}>
      <ScrollView
        style={{
          paddingHorizontal: Spacing.four,
          paddingTop: Spacing.six,
          paddingBottom: Spacing.five,
        }}>
        <Column spacing={Spacing.four}>
          <Column spacing={Spacing.two}>
            <Text textStyle={{ fontSize: 34, fontWeight: '700', lineHeight: 40, color: theme.text }}>
              {isReturningCeo ? `Welcome back, ${profile!.ceoName}.` : 'Name yourself and your company.'}
            </Text>
            <Text textStyle={{ fontSize: 18, lineHeight: 26, color: theme.textSecondary }}>
              {isReturningCeo ? 'Name your next company.' : "You'll only be asked your own name once."}
            </Text>
          </Column>

          {!isReturningCeo ? (
            <Field
              label="Your name"
              placeholder="CEO name"
              onChangeText={setCeoNameInput}
              autoFocus
              returnKeyType="next"
            />
          ) : null}

          <Field
            label="Company name"
            placeholder="Company name"
            onChangeText={setCompanyName}
            autoFocus={isReturningCeo}
            returnKeyType="done"
            onSubmitEditing={confirm}
          />

          <Button label="Found the company" onPress={confirm} disabled={!canConfirm} />
        </Column>
      </ScrollView>
    </Host>
  );
}

/** A labeled text field. Shares the input chrome (padding, capitalization, length cap) across the CEO and company inputs. */
function Field({ label, ...input }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <Column spacing={Spacing.two}>
      <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>{label}</Text>
      <TextInput
        maxLength={NAME_MAX_LENGTH}
        autoCapitalize="words"
        placeholderTextColor={theme.textSecondary}
        style={{
          backgroundColor: theme.backgroundElement,
          borderRadius: Spacing.three,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.three,
        }}
        textStyle={{ fontSize: 17, color: theme.text }}
        {...input}
      />
    </Column>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
