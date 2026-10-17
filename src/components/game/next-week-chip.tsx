import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { SurfaceSheen } from '@/components/game/surface-sheen';
import { useFirstRunHint } from '@/components/game/first-run-hint';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { purchasesAvailable } from '@/purchases';
import type { BuyWeeksTrigger } from '@/state/buy-weeks-flow';
import { useGame } from '@/state/game-store';
import {
  WEEK_REGEN_MS,
  WEEKS_BANK_CAP,
  formatClockCountdown,
  isWeekBudgetExhausted,
  nextWeekRegenAt,
  type WeekBudget,
} from '@/state/week-budget';

/**
 * The Next Week control, living in the Hud's third slot: the one button the
 * whole game turns on, with the free-week meter folded into it.
 *
 * With weeks in the bank it shows the free-week dots (plus a `+N` for the
 * purchased pool). At the wall it swaps the dots for the countdown to the next
 * free week and a bar filling toward it — no "0/10", just when play resumes.
 * A press there still dispatches `TICK` (the store's gate swallows it and
 * records `week_advance_blocked`) and, where purchases exist, opens the
 * paywall.
 */
export function NextWeekChip({
  onBuyWeeks,
  onLayout,
  style,
}: {
  onBuyWeeks: (trigger: BuyWeeksTrigger) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { state, dispatch, weekBudget, purchasedWeeks, devFreePlay, setDevFreePlay } = useGame();
  const theme = useTheme();
  // Same seen-flag the Hud's spotlight reads, so pressing the button retires it.
  const spotlight = useFirstRunHint('next-week-spotlight');

  if (!state) return null;

  const exhausted = isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay);
  const pending = !!state.pendingEvent;
  const freeWeeks = weekBudget?.weeksRemaining ?? 0;
  const purchased = purchasedWeeks?.weeksRemaining ?? 0;
  // At the wall with nowhere to buy, the chip is a clock, not a call to action.
  const muted = pending || (exhausted && !purchasesAvailable);
  const ink = muted ? theme.textMuted : theme.accentInk;

  const accessibilityLabel = exhausted
    ? purchasesAvailable
      ? 'Next week. Out of free weeks. Get more weeks.'
      : 'Out of free weeks. A free week comes back soon.'
    : `Next week. ${freeWeeks} of ${WEEKS_BANK_CAP} free weeks${purchased > 0 ? ` plus ${purchased} purchased` : ''} remaining.`;

  return (
    <Pressable
      onLayout={onLayout}
      onPress={() => {
        if (spotlight.visible) spotlight.dismiss();
        // Dispatched even at the wall: the store's TICK gate swallows it and
        // captures WEEK_ADVANCE_BLOCKED, the only signal that tells a
        // hit-the-wall player apart from one who drifted off before reaching it.
        dispatch({ type: 'TICK' });
        if (exhausted && purchasesAvailable) onBuyWeeks('out_of_weeks');
      }}
      onLongPress={__DEV__ ? () => setDevFreePlay(!devFreePlay) : undefined}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: pending }}
      style={({ pressed }) => [
        styles.chip,
        muted
          ? { backgroundColor: theme.surface, borderColor: theme.border }
          : { backgroundColor: theme.accent, borderColor: theme.accent },
        pressed && styles.pressed,
        style,
      ]}>
      <SurfaceSheen />
      <ThemedText
        type="smallBold"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ color: ink }}>
        Next Week →
      </ThemedText>
      {devFreePlay ? (
        <ThemedText type="smallBold" style={[styles.infinity, { color: ink }]}>
          ∞
        </ThemedText>
      ) : exhausted && weekBudget ? (
        <WallCountdown weekBudget={weekBudget} ink={ink} track={muted ? theme.border : 'rgba(255,255,255,0.25)'} />
      ) : weekBudget ? (
        <View style={styles.meterRow}>
          <View style={styles.dotsRow}>
            {Array.from({ length: WEEKS_BANK_CAP }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: ink, opacity: i < freeWeeks ? 1 : 0.28 }]}
              />
            ))}
          </View>
          {purchased > 0 ? (
            <ThemedText type="footnote" style={[styles.purchased, { color: ink }]}>
              +{purchased}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The wall state: time to the next free week, plus a bar along the chip's
 * bottom edge filling toward it. The clock is read in effects, never during
 * render (the rule `week-budget.ts` follows); nothing here ends the wall —
 * when a week lands the store replaces `weekBudget` and the dots come back.
 */
function WallCountdown({ weekBudget, ink, track }: { weekBudget: WeekBudget; ink: string; track: string }) {
  const [progress, setProgress] = useState<{ next: string; fraction: number } | null>(null);

  useEffect(() => {
    const nextAt = nextWeekRegenAt(weekBudget)?.getTime() ?? null;
    const update = () => {
      if (nextAt === null) return;
      const remaining = Math.max(0, nextAt - Date.now());
      setProgress({
        next: formatClockCountdown(remaining),
        fraction: Math.min(1, Math.max(0, 1 - remaining / WEEK_REGEN_MS)),
      });
    };
    const timer = setInterval(update, 1_000);
    // First read deferred a tick rather than run synchronously in the effect.
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [weekBudget]);

  return (
    <>
      <ThemedText type="footnote" style={[styles.countdown, { color: ink }]}>
        in {progress?.next ?? '…'}
      </ThemedText>
      <View style={[styles.progressTrack, { backgroundColor: track }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: ink, width: `${Math.round((progress?.fraction ?? 0) * 100)}%` },
          ]}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 70,
    overflow: 'hidden',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dotsRow: { flexDirection: 'row', gap: 2 },
  dot: { width: 4, height: 9, borderRadius: 1.5 },
  purchased: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  infinity: { fontSize: 18, lineHeight: 20 },
  countdown: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  progressFill: { height: '100%' },
});
