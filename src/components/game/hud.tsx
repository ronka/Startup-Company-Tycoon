import { useNavigation } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { GameArt } from '@/components/game/game-art';
import { Glow } from '@/components/game/glow';
import { SurfaceSheen } from '@/components/game/surface-sheen';
import { AnimatedNumber } from '@/components/game/animated-number';
import { HintSlot, markHintSeen, useFirstRunHint } from '@/components/game/first-run-hint';
import { NextWeekChip } from '@/components/game/next-week-chip';
import { SpotlightHint } from '@/components/game/spotlight-hint';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney, formatWeeks } from '@/lib/format';
import type { BuyWeeksTrigger } from '@/state/buy-weeks-flow';
import { isUnlocked } from '@/game/unlocks';
import { hudSlotAction } from '@/lib/recommended-action';
import { useGame } from '@/state/game-store';
import { WEEK_REGEN_MS, WEEKS_BANK_CAP, isWeekBudgetExhausted } from '@/state/week-budget';

/**
 * Persistent strip rendered above every game tab: cash and runway in outlined
 * chips, then the Next Week control (with the free-week meter folded in) in
 * the third slot. Owns the top safe-area inset, so tab screens no longer need
 * to.
 *
 * The callouts that belong to Next Week — the first-run spotlight and the
 * week-budget tips — hang off the strip's bottom edge as an overlay, so they
 * point at the chip without pushing the screen down.
 */
export function Hud({ onBuyWeeks }: { onBuyWeeks: (trigger: BuyWeeksTrigger) => void }) {
  const { state, dispatch, weekBudget, purchasedWeeks, devFreePlay } = useGame();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const theme = useTheme();
  // The one-time "this is the whole game" callout. Retired by the chip's first press.
  const spotlight = useFirstRunHint('next-week-spotlight');
  // How far in from the right the chip's centre sits, so the spotlight's caret
  // lands on it whatever the device width.
  const [caretFromRight, setCaretFromRight] = useState<number | null>(null);
  // The strip's own height, where the callouts hang from. Measured because a
  // percentage `top` didn't resolve against it on iOS.
  const [hudHeight, setHudHeight] = useState<number | null>(null);

  if (!state) return null;

  const budgetExhausted = isWeekBudgetExhausted(weekBudget, purchasedWeeks, devFreePlay);
  // Guided week 0: the first two hires take Next Week's slot until they're made.
  const slotAction = hudSlotAction(state);
  // Only pitch "advance a week" while advancing is actually possible — and
  // while the chip it points at is actually there.
  const showSpotlight = spotlight.visible && !state.pendingEvent && !budgetExhausted && !slotAction;
  // Down to the final free dot, with nothing purchased to fall back on — the
  // moment the daily budget is worth explaining, before it bites.
  const onLastFreeWeek =
    !budgetExhausted && weekBudget?.weeksRemaining === 1 && (purchasedWeeks?.weeksRemaining ?? 0) === 0;

  const { runway, insolvent } = deriveWeeklyStats(state);

  // The Hud renders inside the drawer's `(tabs)` screen, so `navigation` here
  // is the drawer navigator — `openDrawer` slides in the settings menu.
  const openMenu = () => {
    track(EVENTS.MENU_OPENED);
    // Finding the menu on your own retires the "there's a glossary in here"
    // nudge HQ would otherwise show at week 6.
    markHintSeen('drawer-glossary');
    (navigation as unknown as { openDrawer?: () => void }).openDrawer?.();
  };

  const chipStyle = [
    styles.chip,
    {
      backgroundColor: insolvent ? theme.dangerBackground : theme.surface,
      borderColor: insolvent ? theme.danger : theme.border,
    },
  ];

  return (
    <View
      onLayout={(event) => setHudHeight(event.nativeEvent.layout.height)}
      style={[
        styles.hud,
        { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two },
      ]}>
      <Pressable
        onPress={openMenu}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        style={styles.menuButton}>
        <ThemedText themeColor={insolvent ? 'danger' : 'textSecondary'} style={styles.menuGlyph}>
          ☰
        </ThemedText>
      </Pressable>
      <View style={chipStyle}>
        <SurfaceSheen />
        <View pointerEvents="none" style={styles.chipArt}><GameArt name="money" size={32} /></View>
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textSecondary'}>
          Cash
        </ThemedText>
        <AnimatedNumber
          value={state.cash}
          format={formatMoney}
          goodDirection="up"
          type="smallBold"
          themeColor={insolvent ? 'danger' : undefined}
        />
      </View>
      <View style={chipStyle}>
        <SurfaceSheen />
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textSecondary'}>
          {/* Plain language until the guided run learns the word with Money. */}
          {isUnlocked(state, 'money') ? 'Runway' : 'Cash lasts'}
        </ThemedText>
        <AnimatedNumber
          value={runway}
          format={formatWeeks}
          goodDirection="up"
          type="smallBold"
          themeColor={insolvent ? 'danger' : undefined}
        />
      </View>
      {slotAction ? (
        <RecommendedActionChip
          label={slotAction.shortLabel}
          accessibilityLabel={slotAction.label}
          onPress={() => {
            track(EVENTS.RECOMMENDED_ACTION_TAPPED, { action: slotAction.id });
            dispatch({ type: 'SET_PENDING_HIRES', role: slotAction.id === 'hire-dev' ? 'devs' : 'sales', delta: 1 });
          }}
        />
      ) : (
        <NextWeekChip
          onBuyWeeks={onBuyWeeks}
          onLayout={(event) => {
            // The chip is the strip's last child and the callouts share the strip's
            // horizontal inset, so the chip's centre is half its width in from their right edge.
            setCaretFromRight(event.nativeEvent.layout.width / 2);
          }}
        />
      )}

      {caretFromRight !== null && hudHeight !== null ? (
        <View pointerEvents="box-none" style={[styles.callouts, { top: hudHeight }]}>
          {showSpotlight ? (
            <SpotlightHint
              text="This is the whole game → advance a week"
              onDismiss={spotlight.dismiss}
              below={{ caretFromRight }}
            />
          ) : null}
          {/* Held back while the spotlight is up, so the strip never hangs two callouts. */}
          <HintSlot
            hints={[
              {
                id: 'week-budget-dots',
                text: `The dots on Next Week are your free weeks. Spent ones come back — one every ${WEEK_REGEN_MS / 60_000} minutes.`,
                when: onLastFreeWeek && !spotlight.visible,
              },
              {
                id: 'out-of-weeks',
                text: `Sprint done. A week comes back every ${WEEK_REGEN_MS / 60_000} minutes, the full ${WEEKS_BANK_CAP} in ${(WEEKS_BANK_CAP * WEEK_REGEN_MS) / 3_600_000} hours.`,
                when: budgetExhausted && !spotlight.visible,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The guided run's recommended action, sitting where Next Week will be. One
 * tap makes the hire (it lands on the Team tab's stepper like any other), the
 * quest completes, and the slot goes back to the Next Week chip.
 */
function RecommendedActionChip({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Glow on style={styles.actionSlot}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.chip,
          // The Glow slot carries the row's flex; inside its column wrapper a
          // `flex: 1` would leave the chip's height to minHeight alone on native.
          styles.actionChip,
          { backgroundColor: theme.accent, borderColor: theme.accent },
          pressed && { opacity: 0.8 },
        ]}>
        <SurfaceSheen />
        <ThemedText type="small" style={{ color: theme.accentInk, opacity: 0.85 }}>Do this</ThemedText>
        <ThemedText type="smallBold" style={[styles.actionLabel, { color: theme.accentInk }]} numberOfLines={2}>
          {label}
        </ThemedText>
      </Pressable>
    </Glow>
  );
}

const styles = StyleSheet.create({
  actionSlot: { flex: 1 },
  actionChip: { flex: 0 },
  actionLabel: { textAlign: 'center' },
  hud: {
    // Above the tab screens, so the callouts hanging off the bottom edge draw over them.
    zIndex: 10,
    elevation: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  callouts: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
  },
  menuButton: {
    justifyContent: 'center',
    width: 20,
  },
  menuGlyph: {
    fontSize: 19,
    lineHeight: 26,
  },
  chipArt: { position: 'absolute', right: -4, bottom: -4, opacity: 0.3 },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    minHeight: 70,
    overflow: 'hidden',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
