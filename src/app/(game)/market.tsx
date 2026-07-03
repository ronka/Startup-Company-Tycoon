import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/game/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

const HYPE_MIN = 0.5;
const HYPE_MAX = 2.5;
const ERAS = ['Scrappy', 'Boom', 'Reckoning'] as const;
const RIVAL_COLORS = ['#f59e0b', '#ef4444'];

export default function MarketScreen() {
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const restOfMarket = Math.max(
    0,
    1 - state.marketShare - state.rivals[0].marketShare - state.rivals[1].marketShare,
  );
  const hypePercent = ((state.hype - HYPE_MIN) / (HYPE_MAX - HYPE_MIN)) * 100;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <ThemedText type="subtitle">Market</ThemedText>
        <ThemedText themeColor="textSecondary">Week {state.week}</ThemedText>

        <View style={styles.shareSection}>
          <ShareRow label="You" percent={state.marketShare * 100} color="#3c87f7" />
          {state.rivals.map((rival, index) => (
            <ShareRow
              key={rival.name}
              label={rival.name}
              percent={rival.marketShare * 100}
              color={RIVAL_COLORS[index % RIVAL_COLORS.length]}
            />
          ))}
          <ShareRow label="Rest of market" percent={restOfMarket * 100} color="#80808080" />
        </View>

        <View style={styles.hypeSection}>
          <View style={styles.hypeHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              Hype
            </ThemedText>
            <ThemedText type="smallBold">{state.hype.toFixed(2)}x</ThemedText>
          </View>
          <ProgressBar percent={hypePercent} color="#a855f7" />
        </View>

        <View style={styles.eraSection}>
          <ThemedText type="small" themeColor="textSecondary">
            Era
          </ThemedText>
          <View style={styles.eraStrip}>
            {ERAS.map((era) => (
              <View key={era} style={styles.eraStop}>
                <ThemedText type="small" themeColor={era === 'Scrappy' ? 'text' : 'textSecondary'}>
                  {era}
                </ThemedText>
                {era === 'Scrappy' ? (
                  <ThemedText type="small" style={styles.hereMarker}>
                    ▲ you are here
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ShareRow({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareLabelRow}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {percent.toFixed(1)}%
        </ThemedText>
      </View>
      <ProgressBar percent={percent} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  shareSection: {
    gap: Spacing.three,
  },
  shareRow: {
    gap: Spacing.one,
  },
  shareLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hypeSection: {
    gap: Spacing.two,
  },
  hypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eraSection: {
    gap: Spacing.two,
  },
  eraStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eraStop: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  hereMarker: {
    color: '#3c87f7',
  },
});
