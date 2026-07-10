import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney, formatWeeks } from '@/lib/format';
import { FOCUS_LABEL, TREND_LABEL, TREND_PHASE_LABEL } from '@/lib/strategy-copy';
import { useGame } from '@/state/game-store';

/** Capitalize the first letter of a lowercase enum value for display (e.g. 'boom' → 'Boom'). */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A single stat card: label + current live value on top, an always-visible explanation below. */
function HelpStat({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="default">{label}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {value}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
        {description}
      </ThemedText>
    </ThemedView>
  );
}

export default function HelpScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useGame();

  useEffect(() => {
    track(EVENTS.HELP_VIEWED);
  }, []);

  if (!state) return <Redirect href="/" />;

  const derived = deriveWeeklyStats(state);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <ThemedText type="default" themeColor="textSecondary">
            ‹ Back
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Help</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Every stat you track, what it means, and how it moves the run. Values below are live from your current
          company.
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Money
        </ThemedText>
        <HelpStat
          label="Cash"
          value={formatMoney(state.cash)}
          description="Cash on hand. Each week it changes by revenue minus burn. Three straight weeks below $0 and you go bankrupt (score 0); it also caps how fast you can hire."
        />
        <HelpStat
          label="Burn / week"
          value={formatMoney(derived.burn)}
          description="Weekly payroll plus fixed costs, adjusted by your CFO perk and focus. The higher your burn, the shorter your runway."
        />
        <HelpStat
          label="Revenue / week"
          value={formatMoney(derived.revenue)}
          description="Customers × ARPC × your focus’s revenue multiplier. Feeds valuation and offsets burn."
        />
        <HelpStat
          label="Runway"
          value={formatWeeks(derived.runway)}
          description="Weeks of cash left = cash ÷ (burn − revenue). Low runway is the main signal that it’s time to raise; ∞ means you’re profitable."
        />
        <HelpStat
          label="Valuation"
          value={formatMoney(derived.valuation)}
          description="Revenue capitalized at the era’s industry multiple and boosted by hype. Drives how much cash a funding round brings, your take-home stake, and IPO/acquisition offers."
        />
        <HelpStat
          label="Founder equity"
          value={`${Math.round(state.founderEquity * 100)}%`}
          description={`Your ownership share, diluted a little with each funding round. Your final score is equity × exit valuation, so protecting it matters as much as growing valuation. At today’s valuation your stake is ${formatMoney(
            derived.stake,
          )}.`}
        />

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Growth
        </ThemedText>
        <HelpStat
          label="Customers"
          value={formatCount(state.customers)}
          description="Your paying base. Revenue is customers × ARPC. Grows from leads that convert (driven by sales headcount and product quality) and shrinks from churn."
        />
        <HelpStat
          label="Market Share"
          value={`${(state.marketShare * 100).toFixed(1)}%`}
          description="Your slice of the total addressable market (customers ÷ market size). It’s a scoreboard against your two rivals — winning share means you’re out-converting them on quality."
        />
        <HelpStat
          label="Hype"
          value={`${state.hype.toFixed(2)}×`}
          description="A marketing multiplier (neutral is 1.0). Above 1.0 it boosts demand (more leads) and inflates valuation; it decays back toward 1.0 every week unless you pump it with a hype focus or events."
        />
        <HelpStat
          label="Product Quality"
          value={`${Math.round(state.productQuality)}`}
          description="The core lever. Higher quality (relative to your rivals’ average) raises conversion and cuts churn. Grown by devs × morale, eroded by tech debt when you under-invest."
        />

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Team
        </ThemedText>
        <HelpStat
          label="Morale"
          value={`${Math.round(state.morale)}/100`}
          description="Scales dev effort from 0.5× to 1.5×. Below 40, employees start quitting; below 25, a crisis cuts productivity and demand. Layoffs tank it; the offsite lever lifts it."
        />

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Strategy modifiers
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          These don’t have a single number — they reshape the formulas above.
        </ThemedText>
        <HelpStat
          label="Focus"
          value={FOCUS_LABEL[state.focus]}
          description="Your strategic bet (Core / AI / Hardware / Hype). Each reshapes quality growth, ARPC, churn, hype, and burn. Switching costs a 4-week productivity drag."
        />
        <HelpStat
          label="Tech Trend"
          value={`${TREND_LABEL[state.trend.id]} · ${TREND_PHASE_LABEL[state.trend.phase]}`}
          description="A live tech wave that rises, peaks, then crashes. A focus aligned with the trend gets demand and hype bonuses while it rises, and penalties when it crashes."
        />
        <HelpStat
          label="Era"
          value={capitalize(state.era)}
          description="The macro climate (Scrappy → Boom → Reckoning). It scales valuation multiples, funding terms, morale baseline, and how violently trends crash. IPOs only open during Boom."
        />
        <HelpStat
          label="Stage"
          value={capitalize(state.stage)}
          description="Garage → Seed → Series A → Growth. Advances when you raise. You must reach Growth (plus an open IPO window and four weeks of strong revenue) to IPO."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  description: {
    lineHeight: 18,
  },
});
