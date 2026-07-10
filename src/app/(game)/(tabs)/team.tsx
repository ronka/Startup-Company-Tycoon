import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { useTabView } from '@/analytics/use-tab-view';
import { CandidatePicker, type CandidatePickerHandle } from '@/components/game/candidate-picker';
import { CLevelCard } from '@/components/game/clevel-card';
import { FirstRunHint } from '@/components/game/first-run-hint';
import { MoraleBar } from '@/components/game/morale-bar';
import { PrimaryButton } from '@/components/game/primary-button';
import { Stepper } from '@/components/game/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { teamContributionsFor } from '@/lib/team-contributions';
import { useGame } from '@/state/game-store';

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

export default function TeamScreen() {
  const { state, dispatch } = useGame();
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
        <ThemedText type="subtitle">Team</ThemedText>

        <FirstRunHint id="team" text="Devs raise product quality — quality wins market share." />

        <View style={styles.moraleBlock}>
          <View style={styles.moraleHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              Morale
            </ThemedText>
            <ThemedText type="smallBold">{Math.round(state.morale)}/100</ThemedText>
          </View>
          <MoraleBar morale={state.morale} />
        </View>

        <ThemedView type="backgroundElement" style={styles.leverCard}>
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
        </ThemedView>

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

        <ThemedView type="backgroundElement" style={styles.payrollPreview}>
          <ThemedText type="small" themeColor="textSecondary">
            Next week&apos;s payroll
          </ThemedText>
          <ThemedText style={styles.payrollValue}>{formatMoney(pendingBurn)}</ThemedText>
          {pendingBurn !== currentBurn ? (
            <ThemedText type="small" themeColor="textSecondary">
              {pendingBurn > currentBurn ? '+' : ''}
              {formatMoney(pendingBurn - currentBurn)} vs. this week
            </ThemedText>
          ) : null}
        </ThemedView>

        <View style={styles.cLevelSection}>
          <ThemedText type="small" themeColor="textSecondary">
            Leadership
          </ThemedText>
          <View style={styles.cLevelGrid}>
            {(Object.keys(C_LEVEL_TITLE) as CLevelRole[]).map((role) => (
              <CLevelCard
                key={role}
                title={C_LEVEL_TITLE[role]}
                hired={state.cLevels[role].hired}
                onFire={() => requestFire(role)}
                onViewCandidates={() => {
                  track(EVENTS.CANDIDATES_VIEWED, { role });
                  pickerRefs[role].current?.present();
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={confirmRole !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold">Cut deep?</ThemedText>
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
              <PrimaryButton
                variant="primary"
                label="Confirm layoff"
                onPress={confirmLayoff}
                style={styles.modalButton}
              />
            </View>
          </ThemedView>
        </View>
      </Modal>

      <Modal visible={confirmFireRole !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold">Let them go?</ThemedText>
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
          </ThemedView>
        </View>
      </Modal>

      {(Object.keys(C_LEVEL_TITLE) as CLevelRole[]).map((role) => (
        <CandidatePicker
          key={role}
          ref={pickerRefs[role]}
          title={C_LEVEL_TITLE[role]}
          candidates={state.cLevels[role].candidates}
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
  moraleBlock: {
    gap: Spacing.two,
  },
  moraleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leverCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
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
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  payrollValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  cLevelSection: {
    gap: Spacing.two,
  },
  cLevelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.three,
    padding: Spacing.four,
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
