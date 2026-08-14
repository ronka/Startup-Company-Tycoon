import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { BottomSheet } from '@/components/game/bottom-sheet';
import { CandidatePicker, type CandidatePickerHandle } from '@/components/game/candidate-picker';
import { Card } from '@/components/game/card';
import { CLevelCard } from '@/components/game/clevel-card';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { MoraleBar } from '@/components/game/morale-bar';
import { RingGauge } from '@/components/game/ring-gauge';
import { SectionHeader } from '@/components/game/section-header';
import { PrimaryButton } from '@/components/game/primary-button';
import { Stepper } from '@/components/game/stepper';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  C_LEVEL_DEPARTURE_MORALE_HIT,
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

export default function TeamScreen() {
  const { state, dispatch, rollBudget, devFreePlay } = useGame();
  const theme = useTheme();
  const [confirmRole, setConfirmRole] = useState<Role | null>(null);
  const [confirmFireRole, setConfirmFireRole] = useState<CLevelRole | null>(null);
  const ctoPickerRef = useRef<CandidatePickerHandle>(null);
  const cmoPickerRef = useRef<CandidatePickerHandle>(null);
  const cfoPickerRef = useRef<CandidatePickerHandle>(null);
  const pickerRefs: Record<CLevelRole, React.RefObject<CandidatePickerHandle | null>> = {
    cto: ctoPickerRef,
    cmo: cmoPickerRef,
    cfo: cfoPickerRef,
  };
  useTabView('team');

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
  const ROLE_CONTRIBUTION: Record<Role, string> = {
    devs: `${state.pendingHeadcount.devs} devs → +${Math.round(contributions.devsQualityPerWeek)} quality/wk`,
    sales: `${state.pendingHeadcount.sales} sales → ~${Math.round(contributions.salesLeadsPerWeek)} leads/wk at ${Math.round(contributions.salesConversionRate * 100)}% conversion`,
    support: `${state.pendingHeadcount.support} support → covering ${Math.round(contributions.supportCovered)}/${Math.round(contributions.supportTotal)} customers`,
  };

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

  const searchLabel = (role: CLevelRole): string => {
    if (state.cLevels[role].hired) return 'Look at the market';
    if (state.cLevels[role].offer) return 'View candidates';
    return rollState === 'ready' ? 'Spin' : 'View candidates';
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

  const requestFire = (role: CLevelRole) => setConfirmFireRole(role);

  const confirmFire = () => {
    if (confirmFireRole) dispatch({ type: 'FIRE_CLEVEL', role: confirmFireRole });
    setConfirmFireRole(null);
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="sheetTitle">Team</ThemedText>

        <FirstRunHint id="team" text="Devs raise product quality — quality wins market share." />

        <Card style={styles.moraleCard}>
          <RingGauge percent={state.morale} label="team" tone={moraleTone(state.morale)} size={80} />
          <View style={styles.moraleText}>
            <SectionHeader label="Morale" />
            <MoraleBar morale={state.morale} />
            <ThemedText type="small" themeColor="textSecondary">
              Below 60 the team slows down; below 40 people start leaving.
            </ThemedText>
          </View>
        </Card>

        <Card style={styles.leverCard}>
          <View style={styles.leverHeader}>
            <ThemedText type="smallBold">Team offsite &amp; perks</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatMoney(MORALE_LEVER_WEEKLY_COST)}/wk · +{MORALE_LEVER_BOOST} morale/wk
            </ThemedText>
          </View>
          <PrimaryButton
            variant={state.moraleLeverActive ? 'secondary' : 'primary'}
            label={state.moraleLeverActive ? 'Turn off' : 'Turn on'}
            onPress={toggleMoraleLever}
          />
        </Card>

        <View style={styles.steppers}>
          {ROLES.map((role) => (
            <Stepper
              key={role}
              label={ROLE_LABEL[role]}
              value={state.pendingHeadcount[role]}
              hint={
                state.pendingHeadcount[role] !== state.headcount[role]
                  ? `current: ${state.headcount[role]}`
                  : undefined
              }
              contribution={ROLE_CONTRIBUTION[role]}
              contributionAlert={role === 'support' && supportShortfall}
              onIncrement={() => increment(role)}
              onDecrement={() => requestDecrement(role)}
            />
          ))}
        </View>

        <Card style={styles.payrollPreview}>
          <ThemedText type="sectionLabel">Next week&apos;s payroll</ThemedText>
          <ThemedText type="cardValue">{formatMoney(pendingBurn)}</ThemedText>
          {pendingBurn !== currentBurn ? (
            <ThemedText type="small" themeColor="textSecondary">
              {pendingBurn > currentBurn ? '+' : ''}
              {formatMoney(pendingBurn - currentBurn)} vs. this week
            </ThemedText>
          ) : null}
        </Card>

        <View style={styles.cLevelSection}>
          <SectionHeader label="Leadership" />
          <View style={styles.cLevelGrid}>
            {(Object.keys(C_LEVEL_TITLE) as CLevelRole[]).map((role) => (
              <CLevelCard
                key={role}
                title={C_LEVEL_TITLE[role]}
                hired={state.cLevels[role].hired}
                hasOffer={state.cLevels[role].offer !== null}
                searchLabel={searchLabel(role)}
                onFire={() => requestFire(role)}
                onViewCandidates={() => openSearch(role)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

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

      <BottomSheet visible={confirmFireRole !== null} onClose={() => setConfirmFireRole(null)} title="Let them go?">
        <ThemedText type="small" themeColor="textSecondary" style={styles.modalBody}>
          {confirmFireRole
            ? `Firing your ${C_LEVEL_TITLE[confirmFireRole]} costs the team ${C_LEVEL_DEPARTURE_MORALE_HIT} morale.`
            : ''}
        </ThemedText>
        <View style={styles.modalActions}>
          <PrimaryButton
            variant="secondary"
            label="Cancel"
            onPress={() => setConfirmFireRole(null)}
            style={styles.modalButton}
          />
          <PrimaryButton variant="primary" label="Confirm" onPress={confirmFire} style={styles.modalButton} />
        </View>
      </BottomSheet>

      {(Object.keys(C_LEVEL_TITLE) as CLevelRole[]).map((role) => (
        <CandidatePicker
          key={role}
          ref={pickerRefs[role]}
          title={C_LEVEL_TITLE[role]}
          offer={state.cLevels[role].offer}
          rollState={rollState}
          rollsRemaining={devFreePlay ? null : (rollBudget?.rollsRemaining ?? null)}
          unaffordable={unaffordable(role)}
          onRoll={() => dispatch({ type: 'ROLL_CANDIDATES', role })}
          onHire={(candidateId) => hireCLevel(role, candidateId)}
        />
      ))}
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
  moraleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  moraleText: {
    flex: 1,
    gap: Spacing.two,
  },
  leverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leverHeader: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  steppers: {
    gap: Spacing.three,
  },
  payrollPreview: {
    gap: Spacing.half,
  },
  cLevelSection: {
    gap: Spacing.two,
  },
  cLevelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
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
