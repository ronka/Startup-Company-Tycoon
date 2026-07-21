import { useNavigation } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { AnimatedNumber } from '@/components/game/animated-number';
import { markHintSeen } from '@/components/game/first-run-hint';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney, formatWeeks } from '@/lib/format';
import { useGame } from '@/state/game-store';

/**
 * Persistent strip rendered above every game tab: cash, runway, customers and
 * week, each in its own outlined chip. Owns the top safe-area inset, so tab
 * screens no longer need to.
 */
export function Hud() {
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const theme = useTheme();

  if (!state) return null;

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
      style={[
        styles.hud,
        { backgroundColor: theme.background, borderBottomColor: theme.border, paddingTop: insets.top + Spacing.two },
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
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textMuted'}>
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
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textMuted'}>
          Runway
        </ThemedText>
        <AnimatedNumber
          value={runway}
          format={formatWeeks}
          goodDirection="up"
          type="smallBold"
          themeColor={insolvent ? 'danger' : undefined}
        />
      </View>
      <View style={chipStyle}>
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textMuted'}>
          Users
        </ThemedText>
        <AnimatedNumber
          value={state.customers}
          format={formatCount}
          goodDirection="up"
          type="smallBold"
          themeColor={insolvent ? 'danger' : undefined}
        />
      </View>
      <View style={chipStyle}>
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textMuted'}>
          Week
        </ThemedText>
        <ThemedText type="smallBold" themeColor={insolvent ? 'danger' : undefined}>
          {state.week}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuButton: {
    justifyContent: 'center',
    paddingRight: Spacing.one,
  },
  menuGlyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
