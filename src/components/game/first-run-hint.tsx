import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { ALL_HINTS_RETIRED_ID, hintsRetired, pickActiveHint, type HintDef } from '@/lib/hints';

export type { HintDef };

const KEY_PREFIX = 'startup-tycoon/hints/';

/**
 * Which hints the player has already retired, as a module-level store.
 *
 * `null` until the one-time load resolves — hints stay hidden until then, so a
 * seen hint never flashes on app open. Every mutation replaces the Set rather
 * than mutating it, which is what lets `useSyncExternalStore` see the change.
 *
 * This module owns the storage format outright: no other file spells a hint
 * key. Callers mark, reset, and read through the functions below.
 */
let seenIds = new Set<string>();
let loaded = false;
let loadInFlight = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function load(): void {
  if (loaded || loadInFlight) return;
  loadInFlight = true;
  AsyncStorage.getAllKeys()
    .then((keys) => keys.filter((key) => key.startsWith(KEY_PREFIX)).map((key) => key.slice(KEY_PREFIX.length)))
    .catch(() => [] as string[])
    .then((ids) => {
      // Merge rather than replace: a hint retired while this read was in
      // flight (the player opening the ☰ menu) must not come back to life.
      seenIds = new Set([...ids, ...seenIds]);
      loaded = true;
      loadInFlight = false;
      emit();
    });
}

function subscribe(listener: () => void): () => void {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `null` while the seen-set is still loading, so no hint renders before we know it's unseen. */
function getSnapshot(): ReadonlySet<string> | null {
  return loaded ? seenIds : null;
}

/** Retires a hint for good. Safe to call for a hint that was never shown. */
export function markHintSeen(id: string): void {
  if (seenIds.has(id)) return;
  seenIds = new Set(seenIds).add(id);
  emit();
  AsyncStorage.setItem(KEY_PREFIX + id, 'true').catch(() => {});
}

/**
 * Retires the whole first-run pass for good — the player has finished a run
 * (IPO, acquisition, or bankruptcy), so the hints have done their job and
 * shouldn't teach the same lessons again on the next one.
 *
 * Written as an ordinary seen-flag, so it needs no special handling anywhere:
 * it loads with the rest and `resetAllHints` clears it. Idempotent.
 */
export function retireAllHints(): void {
  markHintSeen(ALL_HINTS_RETIRED_ID);
}

/** Un-retires every hint, so the whole first-run pass plays again (Settings → Reset / Replay intro). */
export async function resetAllHints(): Promise<void> {
  seenIds = new Set();
  loaded = true;
  emit();
  const keys = await AsyncStorage.getAllKeys();
  const hintKeys = keys.filter((key) => key.startsWith(KEY_PREFIX));
  if (hintKeys.length) await AsyncStorage.multiRemove(hintKeys);
}

/** Fires `hint_shown` once per id per mount, so a hint whose condition oscillates doesn't re-report. */
function useTrackShown(id: string | undefined): void {
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (id === undefined || reported.current === id) return;
    reported.current = id;
    track(EVENTS.HINT_SHOWN, { id });
  }, [id]);
}

function dismissHint(id: string): void {
  track(EVENTS.HINT_DISMISSED, { id });
  markHintSeen(id);
}

/**
 * The seen-flag logic behind `FirstRunHint`, for hints that need custom chrome
 * (the Next Week spotlight) or an external dismiss trigger (the decision modal
 * retires its hint when the card is answered, not only when ✕ is tapped).
 * The flag is written on dismiss, not on mount, so a quick tab flick before the
 * player has read it doesn't burn the one showing.
 */
export function useFirstRunHint(id: string): { visible: boolean; dismiss: () => void } {
  const seen = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // `pickActiveHint` gates the slot-based hints on this; the ones driven
  // through this hook (the Next Week spotlight, the decision-card banner) don't
  // go through the picker, so they check it here.
  const visible = seen !== null && !hintsRetired(seen) && !seen.has(id);

  useTrackShown(visible ? id : undefined);

  return { visible, dismiss: useCallback(() => dismissHint(id), [id]) };
}


/**
 * One hint slot, showing at most one tip at a time (PRD F11 — no modal
 * tutorial, no wall of tips). Given an ordered list, it renders the first
 * hint that is both unseen and currently eligible; array order *is* priority.
 *
 * Re-evaluated every render, so the slot advances the moment the holder is
 * dismissed and reacts to `when` flipping. A slot is scoped by construction —
 * hints that shouldn't compete simply live in different `HintSlot`s.
 */
export function HintSlot({ hints, style }: { hints: HintDef[]; style?: StyleProp<ViewStyle> }) {
  const seen = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const active = seen === null ? undefined : pickActiveHint(hints, seen);

  useTrackShown(active?.id);

  if (!active) return null;

  return (
    <View style={style}>
      <HintBanner text={active.text} onDismiss={() => dismissHint(active.id)} />
    </View>
  );
}

/** A screen with a single tip. Sugar over a one-entry `HintSlot`. */
export function FirstRunHint({ id, text }: { id: string; text: string }) {
  return <HintSlot hints={[{ id, text }]} />;
}

/**
 * The hint's chrome without the seen-flag logic, for callers that drive
 * visibility themselves via `useFirstRunHint`.
 */
export function HintBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <ThemedView type="surfaceRaised" style={styles.hint}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {text}
      </ThemedText>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss hint">
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
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  text: {
    flex: 1,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
