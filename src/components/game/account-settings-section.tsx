import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { accountAvailable } from '@/account';
import { AppleSignInButton } from '@/components/game/apple-sign-in-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useGame } from '@/state/game-store';

/**
 * The Settings half of Apple's rejection fix (Guideline 3.1.1): an optional
 * account, offered here and again at the purchase point
 * (`legal-links-row.tsx`'s `AccountSignInHint`). Renders nothing off iOS
 * custom builds — `accountAvailable` is false on web, Android, and Expo Go.
 */
export function AccountSettingsSection() {
  const { account, signInWithApple, signOut, deleteAccount } = useGame();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!accountAvailable) return null;

  if (account.status === 'signed-out') {
    const handleSignIn = () => {
      if (pending) return;
      setError(null);
      setPending(true);
      signInWithApple()
        .then((outcome) => {
          if (outcome === 'error') setError("Couldn't sign in — try again.");
        })
        .finally(() => setPending(false));
    };

    return (
      <View style={styles.section}>
        <AppleSignInButton onPress={handleSignIn} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.copy}>
          Sign in to keep your purchases. Purchased weeks and bailouts are saved to your Apple
          ID, so you can restore them on your other devices. Signing in is optional — you can do
          it any time.
        </ThemedText>
        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}
      </View>
    );
  }

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your saved purchase balance from our server. Weeks and bailouts already on this device are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPending(true);
            setError(null);
            deleteAccount()
              .then((result) => {
                if (result === 'error') setError("Couldn't delete account — try again.");
              })
              .finally(() => setPending(false));
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleSignOut = () => {
    if (pending) return;
    signOut();
  };

  return (
    <View style={styles.section}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText type="default">Signed in with Apple</ThemedText>
      </ThemedView>
      <Pressable onPress={handleSignOut} disabled={pending} accessibilityRole="button">
        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="default">Sign out</ThemedText>
        </ThemedView>
      </Pressable>
      <Pressable onPress={confirmDeleteAccount} disabled={pending} accessibilityRole="button">
        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="default" themeColor="danger">
            Delete account
          </ThemedText>
        </ThemedView>
      </Pressable>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  copy: {
    paddingHorizontal: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
});
