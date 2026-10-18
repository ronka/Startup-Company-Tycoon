import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { CompanyHeader } from '@/components/game/company-header';
import { HintSlot } from '@/components/game/first-run-hint';
import { FooterFade } from '@/components/game/footer-fade';
import { InsolvencyBanner } from '@/components/game/insolvency-banner';
import { LogoPickerSheet } from '@/components/game/logo-picker-sheet';
import { NewsFeed } from '@/components/game/news-feed';
import { officeHeadcount } from '@/components/game/office-card';
import { SectionHeader } from '@/components/game/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { GameState } from '@/game/types';
import { isGuided, isUnlocked } from '@/game/unlocks';
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
 * When banners and hints crowd the screen, the office shrinks to make room,
 * but not below this share. Past that the screen scrolls instead.
 */
const OFFICE_MIN_SCREEN_SHARE = 0.35;

/** One compact news row's height inside the card, so the news never collapses to nothing. */
const NEWS_MIN_HEIGHT = NEWS_CARD_PADDING + NEWS_ROW_HEIGHT - Spacing.three;
/** Slack before the content counts as overflowing, or as scrolled to the end. */
const OVERFLOW_SLOP = 4;

/**
 * HQ: the company at a glance, sized to fit one screen. The living
 * office is the centrepiece; under it, three numbers (valuation, MRR, morale)
 * and as much of this week's news as fits. Everything else has a home on
 * another tab: cash flow and the valuation chart on Money, strategy, hype,
 * and the leaderboard on Market, the team on Team. When banners, hints and the
 * quest strip push it past the screen, it scrolls, with a fade at the bottom
 * edge while there's more below.
 */
export default function HqScreen() {
  const { state, previousState, dispatch } = useGame();
  const theme = useTheme();
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [screenBox, setScreenBox] = useState<{ w: number; h: number } | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  // Where the office starts (everything above it) and the vitals row's height:
  // neither depends on the office's size, so the office can be sized to what's left.
  const [officeTop, setOfficeTop] = useState(0);
  const [vitalsHeight, setVitalsHeight] = useState(0);
  useTabView('hq');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const { valuation, revenue, insolvent, runway } = deriveWeeklyStats(state);
  const runwayIsShort = Number.isFinite(runway) && runway < SHORT_RUNWAY_WEEKS;
  const guided = isGuided(state);
  const previousValuation = previousState ? deriveWeeklyStats(previousState).valuation : null;
  const valuationChange =
    previousValuation && previousValuation > 0 ? ((valuation - previousValuation) / previousValuation) * 100 : null;

  const openLogoPicker = () => {
    track(EVENTS.COMPANY_LOGO_PICKER_OPENED, { surface: 'hq', had_logo: state.companyLogo != null });
    setLogoPickerOpen(true);
  };

  const viewportHeight = screenBox?.h ?? 0;
  const { gap, paddingBottom } = styles.content;
  const belowOffice = 2 * gap + vitalsHeight + NEWS_MIN_HEIGHT + paddingBottom;
  const officeMaxHeight = Math.max(
    viewportHeight * OFFICE_MIN_SCREEN_SHARE,
    Math.min(viewportHeight * OFFICE_MAX_SCREEN_SHARE, viewportHeight - officeTop - belowOffice),
  );
  const officeWidth = Math.min((screenBox?.w ?? 0) * OFFICE_MAX_ZOOM, officeMaxHeight / SCENE_ASPECT);
  const officeHeight = officeWidth * SCENE_ASPECT;
  // The news gets whatever is left under the vitals, and at least one row.
  // Sized here rather than with flex: inside a scroll view the content has no
  // fixed height to share out.
  const newsHeight = Math.max(
    NEWS_MIN_HEIGHT,
    viewportHeight - officeTop - officeHeight - 2 * gap - vitalsHeight - paddingBottom,
  );
  // As many rows as the leftover height holds, so nothing is cut mid-line.
  const newsRows = Math.max(0, Math.floor((newsHeight - NEWS_CARD_PADDING + Spacing.three) / NEWS_ROW_HEIGHT));
  const moreBelow =
    viewportHeight > 0 &&
    contentHeight > viewportHeight + OVERFLOW_SLOP &&
    scrollY + viewportHeight < contentHeight - OVERFLOW_SLOP;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setScreenBox({ w: width - styles.content.paddingHorizontal * 2, h: height });
        }}
        contentContainerStyle={styles.content}
        bounces={false}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        onContentSizeChange={(_, h) => setContentHeight(h)}>
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
              // A guided run's quest strip already says what to do first.
              when: !guided,
            },
            {
              id: 'runway-short',
              text: 'Runway is getting short. The Money tab is where founders raise cash — before terms get ugly.',
              when: runwayIsShort && isUnlocked(state, 'money'),
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
            width={officeWidth}
            height={officeHeight}
            onLayout={(e) => setOfficeTop(e.nativeEvent.layout.y)}
          />
        ) : null}

        <View style={styles.vitalsRow} onLayout={(e) => setVitalsHeight(e.nativeEvent.layout.height)}>
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
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {isUnlocked(state, 'money') ? 'MRR' : 'Income / mo'}
            </ThemedText>
            <ThemedText type="smallBold" numberOfLines={1}>{formatMoney(revenue * 4)}</ThemedText>
          </Card>
          <Card style={styles.vital}>
            <ThemedText type="small" themeColor="textSecondary">Morale</ThemedText>
            <ThemedText type="smallBold" themeColor={moraleTone(state.morale)}>
              {Math.round(state.morale)}
            </ThemedText>
          </Card>
        </View>

        <View style={[styles.news, { height: newsHeight }]}>
          {newsRows > 0 ? (
            <Pressable
              onPress={() => setNewsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="This week's news. Show all news.">
              <NewsFeed entries={state.newsLog.slice(0, newsRows)} variant="compact" titleLines={1} />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {moreBelow ? (
        <View pointerEvents="none" style={styles.fadeAnchor}>
          <FooterFade />
        </View>
      ) : null}

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
 * or below the room. Shrinks when the screen is too short, or too crowded, to fit it.
 */
function OfficeStage({ state, valuation, width, height, onLayout }: {
  state: GameState;
  valuation: number;
  width: number;
  height: number;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const theme = useTheme();
  const employees = officeHeadcount(state);
  const tier = useOfficeTier(employees, valuation, state.week);
  const { visible, overflow, crowded } = peopleShown(employees, sceneryFor(tier).map.capacity);

  return (
    <Card tone="plain" style={[styles.officeCard, { height }]} onLayout={onLayout}>
      <View style={styles.sceneClip}>
        <OfficeScene tier={tier} people={visible} width={width} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.officeCaption, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
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
  screen: { flex: 1 },
  content: {
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
  // Above every zIndex the scene animates its people and furniture to.
  officeCaption: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    maxWidth: '80%',
    zIndex: 1000,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  overflowBadge: {
    position: 'absolute',
    zIndex: 1000,
    right: Spacing.two,
    bottom: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  vitalsRow: { flexDirection: 'row', gap: Spacing.two },
  vital: { flex: 1, padding: Spacing.two, gap: 0, borderRadius: Radius.lg },
  news: { overflow: 'hidden' },
  // FooterFade hangs above its anchor, so a zero-height anchor on the bottom edge.
  fadeAnchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
