import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DEFAULT_COMPANY_NAME } from '@/game/engine';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

const NAME_MAX_LENGTH = 40;

export default function OnboardingScreen() {
  const { profile, setCeoName, startNewGame } = useGame();
  const router = useRouter();
  const theme = useTheme();

  const isReturningCeo = !!profile?.ceoName;
  const [ceoName, setCeoNameInput] = useState('');
  const [companyName, setCompanyName] = useState('');

  const trimmedCeoName = ceoName.trim();
  const trimmedCompanyName = companyName.trim();
  const canConfirm = isReturningCeo ? trimmedCompanyName.length > 0 : trimmedCeoName.length > 0 && trimmedCompanyName.length > 0;

  const confirm = () => {
    if (!canConfirm) return;
    if (!isReturningCeo) setCeoName(trimmedCeoName);
    startNewGame(trimmedCompanyName || DEFAULT_COMPANY_NAME);
    router.replace('/hq');
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.title}>
          {isReturningCeo ? `Welcome back, ${profile!.ceoName}.` : 'Name yourself and your company.'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.tagline}>
          {isReturningCeo ? 'Name your next company.' : "You'll only be asked your own name once."}
        </ThemedText>
      </View>

      <View style={styles.form}>
        {!isReturningCeo ? (
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Your name
            </ThemedText>
            <TextInput
              value={ceoName}
              onChangeText={setCeoNameInput}
              maxLength={NAME_MAX_LENGTH}
              placeholder="CEO name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              autoFocus
              returnKeyType="next"
            />
          </View>
        ) : null}

        <View style={styles.field}>
          <ThemedText type="small" themeColor="textSecondary">
            Company name
          </ThemedText>
          <TextInput
            value={companyName}
            onChangeText={setCompanyName}
            maxLength={NAME_MAX_LENGTH}
            placeholder="Company name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            autoFocus={isReturningCeo}
            returnKeyType="done"
            onSubmitEditing={confirm}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Found the company" onPress={confirm} disabled={!canConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
  },
  tagline: {
    fontSize: 18,
    lineHeight: 26,
  },
  form: {
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 17,
  },
  actions: {
    paddingBottom: Spacing.five,
    paddingTop: Spacing.five,
  },
});
