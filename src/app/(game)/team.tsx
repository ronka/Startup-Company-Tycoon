import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CandidatePicker, type CandidatePickerHandle } from '@/components/game/candidate-picker';
import { CLevelCard } from '@/components/game/clevel-card';
import { MoraleBar } from '@/components/game/morale-bar';
import { PrimaryButton } from '@/components/game/primary-button';
import { Stepper } from '@/components/game/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { LAYOFF_CONFIRM_THRESHOLD, cLevelPayroll, cLevelPerkMultiplier, weeklyBurnFor } from '@/game/balance';
import { CLevelRole, ROLES, Role } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
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
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [confirmRole, setConfirmRole] = useState<Role | null>(null);
  const ctoPickerRef = useRef<CandidatePickerHandle>(null);
  const cmoPickerRef = useRef<CandidatePickerHandle>(null);
  const cfoPickerRef = useRef<CandidatePickerHandle>(null);
  const pickerRefs: Record<CLevelRole, React.RefObject<CandidatePickerHandle | null>> = {
    cto: ctoPickerRef,
    cmo: cmoPickerRef,
    cfo: cfoPickerRef,
  };

  if (!state) return <Redirect href="/" />;
  if (state.gameOver) return <Redirect href="/game-over" />;

  const pendingBurn = weeklyBurnFor(state.pendingHeadcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplier(state.cLevels, 'cfo'),
  });
  const currentBurn = weeklyBurnFor(state.headcount, {
    execPayroll: cLevelPayroll(state.cLevels),
    fixedBurnMultiplier: cLevelPerkMultiplier(state.cLevels, 'cfo'),
  });

  const increment = (role: Role) => dispatch({ type: 'SET_PENDING_HIRES', role, delta: 1 });

  const hireCLevel = (role: CLevelRole, candidateId: string) =>
    dispatch({ type: 'HIRE_CLEVEL', role, candidateId });

  const fireCLevel = (role: CLevelRole) => dispatch({ type: 'FIRE_CLEVEL', role });

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
    if (confirmRole) dispatch({ type: 'SET_PENDING_HIRES', role: confirmRole, delta: -1 });
    setConfirmRole(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <ThemedText type="subtitle">Team</ThemedText>

        <View style={styles.moraleBlock}>
          <View style={styles.moraleHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              Morale
            </ThemedText>
            <ThemedText type="smallBold">{Math.round(state.morale)}/100</ThemedText>
          </View>
          <MoraleBar morale={state.morale} />
        </View>

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
                onFire={() => fireCLevel(role)}
                onViewCandidates={() => pickerRefs[role].current?.present()}
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
