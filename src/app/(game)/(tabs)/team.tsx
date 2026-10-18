import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { CandidatePicker, type CandidatePickerHandle } from '@/components/game/candidate-picker';
import { Card } from '@/components/game/card';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { HeadlineStat } from '@/components/game/headline-stat';
import { LeadershipRoster } from '@/components/game/leadership-roster';
import { MoraleBar } from '@/components/game/morale-bar';
import { RingGauge } from '@/components/game/ring-gauge';
import { PrimaryButton } from '@/components/game/primary-button';
import { Stepper } from '@/components/game/stepper';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  LAYOFF_CONFIRM_THRESHOLD,
  MORALE_LEVER_BOOST,
  MORALE_LEVER_WEEKLY_COST,
  cLevelPayroll,
  cLevelPerkMultiplierFor,
  weeklyBurnFor,
} from '@/game/balance';
import { CLevelRole, ROLES, Role } from '@/game/types';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { moraleTone } from '@/lib/stat-colors';
import { teamContributionsFor } from '@/lib/team-contributions';
import { useGame } from '@/state/game-store';
import { isGuided, isUnlocked, unlockConditionFor } from '@/game/unlocks';
import { Glow } from '@/components/game/glow';
import { LockedFeature } from '@/components/game/locked-feature';
import { GuideAnchor, useGuideFor } from '@/components/game/guide-pointer';
import { isRollBudgetExhausted } from '@/state/roll-budget';

const ROLE_LABEL: Record<Role, string> = {
  devs: 'Developers',
  sales: 'Sales',
  support: 'Support',
};

const C_LEVEL_TITLE: Record<CLevelRole, string> = {
  cto: 'CTO',
  cmo: 'CMO',
  cfo: 'CFO',
};

/**
 * Runway a hire has to leave behind to be offerable. A legend at $70k/wk can
 * roll at Seed, where taking them ends the run in a month — the design doc's
 * call is to show that candidate with the price visible rather than hide them
 * or let the hire quietly kill the save.
 */
const MIN_RUNWAY_WEEKS_AFTER_CLEVEL_HIRE = 4;

const EMPTY_SET: ReadonlySet<string> = new Set();

/** How long a closing sheet gets before the next one presents. */
const SHEET_HANDOFF_MS = 350;
/** The Stepper's + button centre, in from the card's right edge: card padding plus half the 36pt button. */
const STEP_PLUS_FROM_RIGHT = Spacing.three + 18;

export default function TeamScreen() {
  const { state, dispatch, rollBudget, devFreePlay } = useGame();
  const theme = useTheme();
  const [confirmRole, setConfirmRole] = useState<Role | null>(null);
  const [moraleOpen, setMoraleOpen] = useState(false);
  const [leadershipOpen, setLeadershipOpen] = useState(false);
  const ctoPickerRef = useRef<CandidatePickerHandle>(null);
  const cmoPickerRef = useRef<CandidatePickerHandle>(null);
  const cfoPickerRef = useRef<CandidatePickerHandle>(null);
  const pickerRefs: Record<CLevelRole, React.RefObject<CandidatePickerHandle | null>> = {
    cto: ctoPickerRef,
    cmo: cmoPickerRef,
    cfo: cfoPickerRef,
  };
  useTabView('team');
  // The coach's tooltip, when it points at one of the hire steppers.
  const guideHire = useGuideFor((target) => target.kind === 'hire');

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const moraleLeverCost = state.moraleLeverActive ? MORALE_LEVER_WEEKLY_COST : 0;
  const pendingBurn = weeklyBurnFor(state.pendingHeadcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut'),
    moraleLeverCost,
  });
  const currentBurn = weeklyBurnFor(state.headcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplierFor(state.cLevels, 'cfo', 'cfo-burnCut'),
    moraleLeverCost,
  });
  const { revenue } = deriveWeeklyStats(state);
  const contributions = teamContributionsFor(state);
  const supportShortfall = contributions.supportCovered < contributions.supportTotal;
  // The role's name and count sit beside this line, so it only says what they do.
  const ROLE_CONTRIBUTION: Record<Role, string> = {
    devs: `→ +${Math.round(contributions.devsQualityPerWeek)} quality/wk`,
    sales: `→ ~${Math.round(contributions.salesLeadsPerWeek)} leads · ${Math.round(contributions.salesConversionRate * 100)}% win`,
    support: `→ covers ${Math.round(contributions.supportCovered)}/${Math.round(contributions.supportTotal)} customers`,
  };

  const guided = isGuided(state);

  const increment = (role: Role) => dispatch({ type: 'SET_PENDING_HIRES', role, delta: 1 });

  const hireCLevel = (role: CLevelRole, candidateId: string) =>
    dispatch({ type: 'HIRE_CLEVEL', role, candidateId });

  // Mirrors the store's own gate, so the wall and the swallowed dispatch can
  // never disagree — same reason `isWeekBudgetExhausted` is shared.
  const rollState: 'ready' | 'loading' | 'empty' = isRollBudgetExhausted(rollBudget, devFreePlay)
    ? 'empty'
    : !devFreePlay && rollBudget === null
      ? 'loading'
      : 'ready';

  /**
   * A seat with no offer and a spin in hand rolls on the same tap: a button
   * saying "Spin" that only opens a sheet saying "spin to see who's available"
   * is a wasted tap and tells the player nothing in between.
   */
  const openSearch = (role: CLevelRole) => {
    track(EVENTS.CANDIDATES_VIEWED, { role });
    if (!state.cLevels[role].offer && rollState === 'ready') {
      dispatch({ type: 'ROLL_CANDIDATES', role });
    }
    pickerRefs[role].current?.present();
  };

  /**
   * Candidates this run cannot pay for. A hire is refused if it would drop
   * runway below `MIN_RUNWAY_WEEKS_AFTER_CLEVEL_HIRE` — the case the design
   * doc flags, where a legend rolls at Seed and hiring them bankrupts the run
   * in four weeks. They stay visible; only the Hire button goes.
   */
  const unaffordable = (role: CLevelRole): ReadonlySet<string> => {
    const offer = state.cLevels[role].offer;
    if (!offer) return EMPTY_SET;
    // On a swap the incumbent's salary leaves with them, and `currentBurn`
    // already carries it — netting it out is what stops an affordable
    // replacement from being marked unaffordable by its predecessor's cost.
    const outgoingSalary = state.cLevels[role].hired?.salary ?? 0;
    return new Set(
      offer.candidates
        .filter((candidate) => {
          const netBurn = currentBurn - outgoingSalary + candidate.salary - revenue;
          if (netBurn <= 0) return false; // revenue covers them outright
          return state.cash / netBurn < MIN_RUNWAY_WEEKS_AFTER_CLEVEL_HIRE;
        })
        .map((candidate) => candidate.id),
    );
  };

  /**
   * The roster lives in a sheet, and a seat opens its own picker sheet. Close
   * the roster first and present the picker only once its dismiss has played:
   * presenting into another sheet's dismiss frame is the stuck-modal race in
   * `docs/bug-stuck-decision-modal.md` (same 350ms as the chrome's recap gate).
   */
  const openSeatFromRoster = (role: CLevelRole) => {
    setLeadershipOpen(false);
    setTimeout(() => openSearch(role), SHEET_HANDOFF_MS);
  };

  const toggleMoraleLever = () => dispatch({ type: 'SET_MORALE_LEVER', active: !state.moraleLeverActive });

  const requestDecrement = (role: Role) => {
    const active = state.headcount[role];
    const nextPending = Math.max(0, state.pendingHeadcount[role] - 1);
    const cutFraction = active > 0 ? (active - nextPending) / active : 0;
    if (nextPending < active && cutFraction >= LAYOFF_CONFIRM_THRESHOLD) {
      setConfirmRole(role);
    } else {
      dispatch({ type: 'SET_PENDING_HIRES', role, delta: -1 });
    }
  };

  const confirmLayoff = () => {
    if (confirmRole) {
      track(EVENTS.LAYOFF_CONFIRMED, { role: confirmRole });
      dispatch({ type: 'SET_PENDING_HIRES', role: confirmRole, delta: -1 });
    }
    setConfirmRole(null);
  };

  const seats = (Object.keys(C_LEVEL_TITLE) as CLevelRole[]).map((role) => ({
    role,
    title: C_LEVEL_TITLE[role],
    hired: state.cLevels[role].hired,
    hasOffer: state.cLevels[role].offer !== null,
    rollState,
  }));
  const seatsFilled = seats.filter((seat) => seat.hired).length;
  const payrollChange = pendingBurn - currentBurn;
  const perksUnlocked = isUnlocked(state, 'morale');
  const leadershipUnlocked = isUnlocked(state, 'leadership');
  // Both open on the same quest: one lock card says it once, and keeps the
  // steppers on screen under a tall quest strip.
  const sharedLock =
    !perksUnlocked && !leadershipUnlocked && unlockConditionFor('morale') === unlockConditionFor('leadership');

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Fits one iPhone 15 screen without scrolling; the ScrollView is only
          the fallback for shorter phones and large text. */}
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <ThemedText type="sheetTitle">Team</ThemedText>

        {/* A guided run's quest strip does the explaining. */}
        {guided ? null : <FirstRunHint id="team" text="Devs raise product quality — quality wins market share." />}

        <View style={styles.statsRow}>
          <HeadlineStat
            label="Morale"
            value={String(Math.round(state.morale))}
            valueColor={moraleTone(state.morale)}
            note="Slows below 60"
            onPress={() => setMoraleOpen(true)}
          />
          <HeadlineStat
            label="Next week's payroll"
            value={formatMoney(pendingBurn)}
            note={payrollChange !== 0 ? `${payrollChange > 0 ? '+' : ''}${formatMoney(payrollChange)} vs. this week` : 'Same as this week'}
          />
        </View>

        {perksUnlocked ? (
          <Card style={styles.rowCard}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">Team offsite &amp; perks</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {formatMoney(MORALE_LEVER_WEEKLY_COST)}/wk · +{MORALE_LEVER_BOOST} morale/wk
              </ThemedText>
            </View>
            <Switch
              value={state.moraleLeverActive}
              onValueChange={toggleMoraleLever}
              trackColor={{ true: theme.accent }}
              accessibilityLabel="Team offsite and perks"
            />
          </Card>
        ) : sharedLock ? null : (
          <LockedFeature feature="morale" title="Team offsite & perks" />
        )}

        <View style={styles.steppers}>
          {ROLES.map((role) => {
            const guide = guideHire?.target.kind === 'hire' && guideHire.target.role === role ? guideHire : null;
            return (
              <GuideAnchor key={role} step={guide} align="right" inset={STEP_PLUS_FROM_RIGHT}>
                <Glow on={guide !== null}>
                  <Stepper
                    label={ROLE_LABEL[role]}
                    value={state.pendingHeadcount[role]}
                    hint={
                      state.pendingHeadcount[role] !== state.headcount[role]
                        ? `now ${state.headcount[role]}`
                        : undefined
                    }
                    contribution={ROLE_CONTRIBUTION[role]}
                    contributionAlert={role === 'support' && supportShortfall}
                    onIncrement={() => increment(role)}
                    onDecrement={() => requestDecrement(role)}
                  />
                </Glow>
              </GuideAnchor>
            );
          })}
        </View>

        {leadershipUnlocked ? (
          <Pressable
            onPress={() => setLeadershipOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Leadership: ${seatsFilled} of ${seats.length} seats filled. Open the roster.`}>
            <Card style={styles.rowCard}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">Leadership</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {seats.map((seat) => `${seat.title} ${seat.hired ? '✓' : '–'}`).join('  ·  ')}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" themeColor={seatsFilled < seats.length ? 'accent' : 'textSecondary'}>
                {seatsFilled}/{seats.length} ›
              </ThemedText>
            </Card>
          </Pressable>
        ) : sharedLock ? (
          <LockedFeature feature="leadership" title="Team perks and C-level seats" />
        ) : (
          <LockedFeature feature="leadership" title="CTO, CMO and CFO seats" />
        )}

      </ScrollView>

      <BottomSheet visible={moraleOpen} onClose={() => setMoraleOpen(false)} title="Morale">
        <Card style={styles.moraleCard}>
          <RingGauge percent={state.morale} label="team" tone={moraleTone(state.morale)} size={80} />
          <View style={styles.moraleText}>
            <MoraleBar morale={state.morale} />
            <ThemedText type="small" themeColor="textSecondary">
              Below 60 the team slows down; below 40 people start leaving.
            </ThemedText>
          </View>
        </Card>
      </BottomSheet>

      <BottomSheet visible={leadershipOpen} onClose={() => setLeadershipOpen(false)} title="Leadership">
        <LeadershipRoster seats={seats} onOpenSeat={openSeatFromRoster} />
      </BottomSheet>

      <BottomSheet visible={confirmRole !== null} onClose={() => setConfirmRole(null)} title="Cut deep?">
        <ThemedText type="small" themeColor="textSecondary" style={styles.modalBody}>
          {confirmRole
            ? `Firing ${Math.round(LAYOFF_CONFIRM_THRESHOLD * 100)}% or more of ${ROLE_LABEL[confirmRole]} in one week will hit morale hard.`
            : ''}
        </ThemedText>
        <View style={styles.modalActions}>
          <PrimaryButton
            variant="secondary"
            label="Cancel"
            onPress={() => setConfirmRole(null)}
            style={styles.modalButton}
          />
          <PrimaryButton variant="primary" label="Confirm layoff" onPress={confirmLayoff} style={styles.modalButton} />
        </View>
      </BottomSheet>

      {(Object.keys(C_LEVEL_TITLE) as CLevelRole[]).map((role) => (
        <CandidatePicker
          key={role}
          ref={pickerRefs[role]}
          title={C_LEVEL_TITLE[role]}
          hired={state.cLevels[role].hired}
          offer={state.cLevels[role].offer}
          rollState={rollState}
          rollsRemaining={devFreePlay ? null : (rollBudget?.rollsRemaining ?? null)}
          unaffordable={unaffordable(role)}
          onRoll={() => dispatch({ type: 'ROLL_CANDIDATES', role })}
          onHire={(candidateId) => hireCLevel(role, candidateId)}
          onFire={() => dispatch({ type: 'FIRE_CLEVEL', role })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // flexGrow, not flex: a block that stretches (Money's chart) fills a tall
  // screen, and the content can still outgrow a short one.
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  rowText: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  moraleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  moraleText: {
    flex: 1,
    gap: Spacing.two,
  },
  steppers: {
    gap: Spacing.two,
  },
  modalBody: {
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  modalButton: {
    flex: 1,
  },
});
