import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { CompanyHeader } from '@/components/game/company-header';
import { HintSlot } from '@/components/game/first-run-hint';
import { InsolvencyBanner } from '@/components/game/insolvency-banner';
import { LogoPickerSheet } from '@/components/game/logo-picker-sheet';
import { NewsFeed } from '@/components/game/news-feed';
import { officeHeadcount } from '@/components/game/office-card';
import { SectionHeader } from '@/components/game/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { GameState } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatCount, formatMoney } from '@/lib/format';
import { moraleTone } from '@/lib/stat-colors';
import { OFFICE_NAMES, SCENE_ASPECT, sceneryFor } from '@/office/maps';
import { OfficeScene } from '@/office/office-scene';
import { peopleShown } from '@/office/select-office';
import { useOfficeTier } from '@/office/use-office-tier';
import { useGame } from '@/state/game-store';

/** Runway below this many weeks is where a founder should be thinking about raising. */
const SHORT_RUNWAY_WEEKS = 10;
/** By this week, a player who still hasn't opened the drawer gets pointed at it. */
const DRAWER_HINT_WEEK = 6;
/**
 * How far the office may zoom past the card's width, cropping its side tips,
 * to use more of a tall screen. The room art runs nearly edge to edge, so
 * much more than this starts cutting into furniture.
 */
const OFFICE_MAX_ZOOM = 1.12;
/** One compact news row (one-line title + one-line flavor) plus the gap after it. */
const NEWS_ROW_HEIGHT = 60;
/** The compact news card's vertical padding, both edges together. */
const NEWS_CARD_PADDING = 32;
/** The office never takes more than this share of the screen, so the numbers and news always fit. */
const OFFICE_MAX_SCREEN_SHARE = 0.6;

/**
 * HQ: the company at a glance, on one screen with no scrolling. The living
 * office is the centrepiece; under it, three numbers (valuation, MRR, morale)
 * and as much of this week's news as fits. Everything else has a home on
 * another tab: cash flow and the valuation chart on Money, strategy, hype,
 * and the leaderboard on Market, the team on Team.
 */
export default function HqScreen() {
  const { state, previousState, dispatch } = useGame();
  const theme = useTheme();
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [screenBox, setScreenBox] = useState<{ w: number; h: number } | null>(null);
  const [newsHeight, setNewsHeight] = useState(0);
  useTabView('hq');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const { valuation, revenue, insolvent, runway } = deriveWeeklyStats(state);
  const runwayIsShort = Number.isFinite(runway) && runway < SHORT_RUNWAY_WEEKS;
  const previousValuation = previousState ? deriveWeeklyStats(previousState).valuation : null;
  const valuationChange =
    previousValuation && previousValuation > 0 ? ((valuation - previousValuation) / previousValuation) * 100 : null;

  // As many rows as the leftover height holds, so nothing is cut mid-line and
  // nothing scrolls.
  const newsRows = Math.max(0, Math.floor((newsHeight - NEWS_CARD_PADDING + Spacing.three) / NEWS_ROW_HEIGHT));

  const openLogoPicker = () => {
    track(EVENTS.COMPANY_LOGO_PICKER_OPENED, { surface: 'hq', had_logo: state.companyLogo != null });
    setLogoPickerOpen(true);
  };

  return (
    <View
      style={[styles.screen, { backgroundColor: theme.background }]}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setScreenBox({ w: width - styles.screen.paddingHorizontal * 2, h: height });
      }}>
      <View style={styles.companyRow}>
        <View style={styles.companyIdentity}>
          <CompanyHeader
            name={state.companyName}
            stage={state.stage}
            focus={state.focus}
            logo={state.companyLogo}
            onPressLogo={openLogoPicker}
          />
        </View>
        <View style={[styles.weekPill, { backgroundColor: theme.accentSurface }]}>
          <ThemedText type="smallBold" themeColor="accent">
            Year {Math.floor(state.week / 52) + 1} · Wk {state.week}
          </ThemedText>
        </View>
      </View>

      {/* At most one shows at a time; earlier entries win the slot. */}
      <HintSlot
        hints={[
          {
            id: 'hq',
            text: 'Top bar: your cash, how many weeks it lasts (runway), and Next Week — its dots are your free weeks. Cash at $0 for 3 weeks = game over.',
          },
          {
            id: 'runway-short',
            text: 'Runway is getting short. The Money tab is where founders raise cash — before terms get ugly.',
            when: runwayIsShort,
          },
          {
            id: 'drawer-glossary',
            text: 'Stuck on a term? The ☰ menu has a full glossary with your live numbers.',
            when: state.week >= DRAWER_HINT_WEEK,
          },
        ]}
      />

      {insolvent ? <InsolvencyBanner weeksInTheRed={state.weeksInTheRed} /> : null}

      {screenBox ? (
        <OfficeStage
          state={state}
          valuation={valuation}
          cardWidth={screenBox.w}
          maxHeight={screenBox.h * OFFICE_MAX_SCREEN_SHARE}
        />
      ) : null}

      <View style={styles.vitalsRow}>
        <Card style={styles.vital}>
          <ThemedText type="small" themeColor="textSecondary">Valuation</ThemedText>
          <ThemedText type="smallBold" numberOfLines={1}>{formatMoney(valuation)}</ThemedText>
          {valuationChange !== null && Math.abs(valuationChange) >= 0.1 ? (
            <ThemedText type="footnote" themeColor={valuationChange >= 0 ? 'success' : 'danger'}>
              {valuationChange >= 0 ? '↗' : '↘'} {Math.abs(valuationChange).toFixed(1)}%
            </ThemedText>
          ) : null}
        </Card>
        <Card style={styles.vital}>
          <ThemedText type="small" themeColor="textSecondary">MRR</ThemedText>
          <ThemedText type="smallBold" numberOfLines={1}>{formatMoney(revenue * 4)}</ThemedText>
        </Card>
        <Card style={styles.vital}>
          <ThemedText type="small" themeColor="textSecondary">Morale</ThemedText>
          <ThemedText type="smallBold" themeColor={moraleTone(state.morale)}>
            {Math.round(state.morale)}
          </ThemedText>
        </Card>
      </View>

      <View style={styles.news} onLayout={(e) => setNewsHeight(e.nativeEvent.layout.height)}>
        {newsRows > 0 ? (
          <Pressable
            onPress={() => setNewsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="This week's news. Show all news.">
            <NewsFeed entries={state.newsLog.slice(0, newsRows)} variant="compact" titleLines={1} />
          </Pressable>
        ) : null}
      </View>

      <BottomSheet visible={newsOpen} onClose={() => setNewsOpen(false)} title="News">
        <SectionHeader label={`Week ${state.week}`} />
        <NewsFeed entries={state.newsLog} variant="full" />
      </BottomSheet>

      <LogoPickerSheet
        visible={logoPickerOpen}
        logo={state.companyLogo}
        onCommit={(logo) => dispatch({ type: 'SET_COMPANY_LOGO', logo })}
        onClose={() => setLogoPickerOpen(false)}
      />
    </View>
  );
}

/**
 * The living office, zoomed slightly past the card's width (side tips
 * cropped) and with the card hugging the scene, so no empty band sits above
 * or below the room. Shrinks only when the screen is too short to fit it.
 */
function OfficeStage({ state, valuation, cardWidth, maxHeight }: {
  state: GameState;
  valuation: number;
  cardWidth: number;
  maxHeight: number;
}) {
  const theme = useTheme();
  const employees = officeHeadcount(state);
  const tier = useOfficeTier(employees, valuation, state.week);
  const { visible, overflow, crowded } = peopleShown(employees, sceneryFor(tier).map.capacity);
  const width = Math.min(cardWidth * OFFICE_MAX_ZOOM, maxHeight / SCENE_ASPECT);
  const height = width * SCENE_ASPECT;

  return (
    <Card tone="plain" style={[styles.officeCard, { height }]}>
      <View style={styles.sceneClip}>
        <OfficeScene tier={tier} people={visible} width={width} />
      </View>
      <View pointerEvents="none" style={styles.officeCaption}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {OFFICE_NAMES[tier]} · {formatCount(employees)} {employees === 1 ? 'person' : 'people'}
          {crowded ? ' · cramped' : ''}
        </ThemedText>
      </View>
      {overflow > 0 ? (
        <View style={[styles.overflowBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText type="smallBold">+{formatCount(overflow)}</ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  companyIdentity: { flex: 1 },
  weekPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill },
  officeCard: { padding: 0, overflow: 'hidden', justifyContent: 'center' },
  sceneClip: { alignItems: 'center', justifyContent: 'center' },
  officeCaption: { position: 'absolute', top: Spacing.three, left: Spacing.three },
  overflowBadge: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  vitalsRow: { flexDirection: 'row', gap: Spacing.two },
  vital: { flex: 1, padding: Spacing.two, gap: 0, borderRadius: Radius.lg },
  news: { flex: 1, overflow: 'hidden' },
});
