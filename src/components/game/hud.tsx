import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '@/components/game/animated-number';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney, formatWeeks } from '@/lib/format';
import { useGame } from '@/state/game-store';

/**
 * Persistent strip rendered above every game tab: cash, runway, and week.
 * Owns the top safe-area inset, so tab screens no longer need to.
 */
export function Hud() {
  const { state } = useGame();
  const insets = useSafeAreaInsets();

  if (!state) return null;

  const { runway, insolvent } = deriveWeeklyStats(state);

  return (
    <ThemedView
      type={insolvent ? 'dangerBackground' : 'backgroundElement'}
      style={[styles.hud, { paddingTop: insets.top + Spacing.two }]}>
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
    justifyContent: 'space-around',
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  stat: {
    alignItems: 'center',
    gap: Spacing.half,
  },
});
