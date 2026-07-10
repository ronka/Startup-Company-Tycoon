import { useNavigation } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { AnimatedNumber } from '@/components/game/animated-number';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney, formatWeeks } from '@/lib/format';
import { useGame } from '@/state/game-store';

/**
 * Persistent strip rendered above every game tab: cash, runway, and week.
 * Owns the top safe-area inset, so tab screens no longer need to.
 */
export function Hud() {
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  if (!state) return null;

  const { runway, insolvent } = deriveWeeklyStats(state);

  // The Hud renders inside the drawer's `(tabs)` screen, so `navigation` here
  // is the drawer navigator — `openDrawer` slides in the settings menu.
  const openMenu = () => {
    track(EVENTS.MENU_OPENED);
    (navigation as unknown as { openDrawer?: () => void }).openDrawer?.();
  };

  return (
    <ThemedView
      type={insolvent ? 'dangerBackground' : 'backgroundElement'}
      style={[styles.hud, { paddingTop: insets.top + Spacing.two }]}>
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
      <View style={styles.stat}>
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
      <View style={styles.stat}>
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textSecondary'}>
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
      <View style={styles.stat}>
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textSecondary'}>
          Customers
        </ThemedText>
        <AnimatedNumber
          value={state.customers}
          format={formatCount}
          goodDirection="up"
          type="smallBold"
          themeColor={insolvent ? 'danger' : undefined}
        />
      </View>
      <View style={styles.stat}>
        <ThemedText type="small" themeColor={insolvent ? 'danger' : 'textSecondary'}>
          Week
        </ThemedText>
        <ThemedText type="smallBold" themeColor={insolvent ? 'danger' : undefined}>
          {state.week}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  menuButton: {
    justifyContent: 'center',
  },
  menuGlyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  stat: {
    alignItems: 'center',
    gap: Spacing.half,
  },
});
