import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/game/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Era } from '@/game/events/types';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

const HYPE_MIN = 0.5;
const HYPE_MAX = 2.5;
const ERA_ORDER: Era[] = ['scrappy', 'boom', 'reckoning'];
const ERA_LABEL: Record<Era, string> = { scrappy: 'Scrappy', boom: 'Boom', reckoning: 'Reckoning' };
const RIVAL_COLORS = ['#f59e0b', '#ef4444'];

export default function MarketScreen() {
  const { state } = useGame();
  const theme = useTheme();

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const rivalShareTotal = state.rivals.reduce((sum, rival) => sum + rival.marketShare, 0);
  const restOfMarket = Math.max(0, 1 - state.marketShare - rivalShareTotal);
  const hypePercent = ((state.hype - HYPE_MIN) / (HYPE_MAX - HYPE_MIN)) * 100;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Market</ThemedText>

        <View style={styles.shareSection}>
          <ShareRow label="You" percent={state.marketShare * 100} color="#3c87f7" />
          {state.rivals.map((rival, index) => (
            <ShareRow
              key={rival.name}
              label={rival.name}
              percent={rival.marketShare * 100}
              color={RIVAL_COLORS[index % RIVAL_COLORS.length]}
              edge={rival.productQuality - state.productQuality}
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
            {ERA_ORDER.map((era) => (
              <View key={era} style={styles.eraStop}>
                <ThemedText type="small" themeColor={era === state.era ? 'text' : 'textSecondary'}>
                  {ERA_LABEL[era]}
                </ThemedText>
                {era === state.era ? (
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

function ShareRow({
  label,
  percent,
  color,
  edge,
}: {
  label: string;
  percent: number;
  color: string;
  /** Your product quality minus this rival's — positive means you have the edge. */
  edge?: number;
}) {
  const edgeLabel =
    edge === undefined
      ? null
      : edge >= 0
        ? `+${Math.round(edge)} edge`
        : `${Math.round(edge)} behind`;
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareLabelRow}>
        <ThemedText type="small">{label}</ThemedText>
        <View style={styles.shareLabelRight}>
          {edgeLabel ? (
            <ThemedText type="small" themeColor={edge! >= 0 ? 'success' : 'danger'}>
              {edgeLabel}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {percent.toFixed(1)}%
          </ThemedText>
        </View>
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
    paddingTop: Spacing.four,
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
  shareLabelRight: {
    flexDirection: 'row',
    gap: Spacing.two,
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
