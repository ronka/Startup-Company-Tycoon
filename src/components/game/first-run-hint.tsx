import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const HINT_KEY_PREFIX = 'startup-tycoon/hints/';

/**
 * One-line contextual tip shown the first time a screen is visited, then
 * dismissed for good — no modal tutorial, no forced walkthrough (PRD F11).
 * The seen-flag is written on dismiss, not on mount, so a quick tab flick
 * before the player has read it doesn't burn the one showing.
 */
export function FirstRunHint({ id, text }: { id: string; text: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(HINT_KEY_PREFIX + id).then((seen) => {
      if (!cancelled && seen !== 'true') setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    AsyncStorage.setItem(HINT_KEY_PREFIX + id, 'true').catch(() => {});
  };

  return (
    <ThemedView type="backgroundElement" style={styles.hint}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {text}
      </ThemedText>
      <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss hint">
        <ThemedText type="smallBold" themeColor="textSecondary">
          ✕
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  text: {
    flex: 1,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
