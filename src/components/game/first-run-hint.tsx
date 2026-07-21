import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export const HINT_KEY_PREFIX = 'startup-tycoon/hints/';

/**
 * One-hint-at-a-time queue. Hints sharing a `scope` (conventionally a screen
 * name) compete for a single slot: the first unseen one to claim it holds it
 * until it's dismissed or unmounts, then the next claims it. A queue, never a
 * stack — a first-time player should never face a wall of tips.
 *
 * Module-level rather than a context provider, because hints live on tab
 * screens that stay mounted in the background; a scope string is all the
 * coordination they need.
 */
const holders = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function claimSlot(scope: string, id: string): void {
  if (holders.has(scope)) return;
  holders.set(scope, id);
  notify();
}

function releaseSlot(scope: string, id: string): void {
  if (holders.get(scope) !== id) return;
  holders.delete(scope);
  notify();
}

/**
 * The seen-flag + queue logic behind `FirstRunHint`, exposed for hints that
 * need custom chrome (the Next Week spotlight) or an external dismiss trigger.
 * The flag is written on dismiss, not on mount, so a quick tab flick before
 * the player has read it doesn't burn the one showing.
 */
export function useFirstRunHint(id: string, scope?: string): { visible: boolean; dismiss: () => void } {
  const [unseen, setUnseen] = useState(false);
  const [, onSlotChange] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(HINT_KEY_PREFIX + id)
      .then((seen) => {
        if (!cancelled && seen !== 'true') setUnseen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!scope) return;
    listeners.add(onSlotChange);
    return () => {
      listeners.delete(onSlotChange);
    };
  }, [scope, onSlotChange]);

  useEffect(() => {
    if (!scope || !unseen) return;
    claimSlot(scope, id);
    return () => releaseSlot(scope, id);
  }, [scope, unseen, id]);

  const visible = unseen && (scope === undefined || holders.get(scope) === id);

  useEffect(() => {
    if (visible) track(EVENTS.HINT_SHOWN, { id });
  }, [visible, id]);

  const dismiss = useCallback(() => {
    track(EVENTS.HINT_DISMISSED, { id });
    setUnseen(false);
    if (scope) releaseSlot(scope, id);
    AsyncStorage.setItem(HINT_KEY_PREFIX + id, 'true').catch(() => {});
  }, [id, scope]);

  return { visible, dismiss };
}

/**
 * One-line contextual tip shown the first time a screen is visited, then
 * dismissed for good — no modal tutorial, no forced walkthrough (PRD F11).
 * Pass `scope` on screens that own more than one hint so they queue instead
 * of stacking.
 */
export function FirstRunHint({ id, text, scope }: { id: string; text: string; scope?: string }) {
  const { visible, dismiss } = useFirstRunHint(id, scope);

  if (!visible) return null;

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
