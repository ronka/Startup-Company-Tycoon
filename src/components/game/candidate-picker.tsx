import { BottomSheetModal, BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { C_LEVEL_DEPARTURE_MORALE_HIT } from '@/game/balance';
import type { CLevelCandidate, CLevelOffer } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';

/** How long the source banner holds the stage alone before the first candidate lands. */
const BANNER_SETTLE_MS = 320;
/** Gap between the two candidates arriving, so they read as a pair, not a block. */
const CANDIDATE_STAGGER_MS = 120;

export interface CandidatePickerHandle {
  present: () => void;
  dismiss: () => void;
}

/**
 * The result of one spin, plus the two things the player needs to decide with:
 * how many spins are left, and whether they can actually pay these people.
 *
 * `unaffordable` is a set of candidate ids rather than a flag on the candidate,
 * because affordability is a property of *this run right now* — the same legend
 * is out of reach at Seed and obvious at Growth. Unaffordable candidates are
 * shown, not hidden: seeing the person you cannot yet afford is the point.
 */
export function CandidatePicker({
  title,
  hired,
  offer,
  rollState,
  rollsRemaining,
  unaffordable,
  onRoll,
  onHire,
  onFire,
  ref,
}: {
  title: string;
  /** Who holds the seat right now, if anyone — the sheet is also where you let them go. */
  hired: CLevelCandidate | null;
  offer: CLevelOffer | null;
  /**
   * `loading` is the window before the budget read lands, where the store
   * swallows a spin rather than handing out a free one — so the button is
   * held rather than left live to eat a tap.
   */
  rollState: 'ready' | 'loading' | 'empty';
  /** Null when there is no count to show (dev free play, or not yet loaded). */
  rollsRemaining: number | null;
  unaffordable: ReadonlySet<string>;
  onRoll: () => void;
  onHire: (candidateId: string) => void;
  onFire: () => void;
  ref?: Ref<CandidatePickerHandle>;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const theme = useTheme();
  /**
   * Firing confirms *inside* this sheet rather than in a second modal. The tab
   * already stacks several RN `<Modal>`s, and presenting one into another's
   * dismiss frame is what `docs/bug-stuck-decision-modal.md` is about — an
   * inline step removes a modal instead of adding a fourth.
   */
  const [confirmingFire, setConfirmingFire] = useState(false);

  useImperativeHandle(ref, () => ({
    // Reset on the way *in*, not on dismiss: `enablePanDownToClose` lets the
    // player leave without going through `dismiss()`, and these sheets stay
    // mounted, so a stale flag would reopen straight onto the confirm step.
    present: () => {
      setConfirmingFire(false);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const isLegend = offer?.tier === 'legend';
  /**
   * `HIRE_CLEVEL` keeps the offer, so the person you just hired stays in their
   * own candidate list. Re-hiring your own incumbent is a no-op that still
   * charges the departure morale hit (`engine.ts`, `HIRE_CLEVEL`), and with the
   * "currently in the seat" block above they'd appear twice in one sheet — the
   * second time with a live Hire button. Drop them from the list instead.
   */
  const candidates = offer ? offer.candidates.filter((candidate) => candidate.id !== hired?.id) : [];

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['90%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: theme.background }}>
      <BottomSheetScrollView style={styles.scroll} contentContainerStyle={styles.sheet}>
        <ThemedText type="sectionLabel">{title} search</ThemedText>

        {hired ? (
          // Who you'd be replacing. On a filled seat every hire below is a
          // swap, and the salary you stop paying is half of that decision.
          <ThemedView type="backgroundElement" style={styles.incumbent}>
            <ThemedText type="footnote" themeColor="textMuted">
              CURRENTLY IN THE SEAT
            </ThemedText>
            <ThemedText type="smallBold">
              {hired.name} · {hired.exEmployer}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {hired.perk.label} · {formatMoney(hired.salary)}/wk
            </ThemedText>
          </ThemedView>
        ) : null}

        {offer && candidates.length > 0 ? (
          // The reveal: the wheel settles on the source, *then* the candidates
          // arrive. Keyed on the first candidate's id — which carries the rng
          // counter, so it is unique per spin — the entering animations replay
          // on every roll rather than only the first mount.
          <Animated.View key={offer.candidates[0]?.id} style={styles.reveal}>
            <Animated.View
              entering={isLegend ? ZoomIn.duration(360) : FadeIn.duration(240)}
              style={[
                styles.banner,
                {
                  backgroundColor: isLegend ? theme.accentSurface : theme.surface,
                  borderColor: isLegend ? theme.accent : theme.border,
                },
              ]}>
              <ThemedText type="smallBold" style={isLegend ? { color: theme.accent } : undefined}>
                {isLegend ? `★ ${offer.source.toUpperCase()}` : offer.source}
              </ThemedText>
            </Animated.View>

            {candidates.map((candidate, i) => (
              <Animated.View
                key={candidate.id}
                entering={FadeInDown.delay(BANNER_SETTLE_MS + i * CANDIDATE_STAGGER_MS).duration(260)}>
                <CandidateRow
                  candidate={candidate}
                  source={offer.source}
                  affordable={!unaffordable.has(candidate.id)}
                  onHire={() => {
                    onHire(candidate.id);
                    sheetRef.current?.dismiss();
                  }}
                />
              </Animated.View>
            ))}
          </Animated.View>
        ) : (
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText type="small" themeColor="textSecondary">
              Nobody in the pipeline yet. Spin to see who’s available.
            </ThemedText>
          </ThemedView>
        )}

        {rollState === 'empty' ? (
          // The wall. The offer above stays hireable at zero, which is the
          // whole mitigation for a second daily limit — you are never left
          // with nothing to do, only without a *new* set of names.
          <ThemedView type="backgroundElement" style={styles.wall}>
            <ThemedText type="smallBold">Out of spins for today</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {offer
                ? 'More tomorrow. Whoever is above is still yours to hire.'
                : 'More tomorrow, and they bank up while you are away.'}
            </ThemedText>
          </ThemedView>
        ) : (
          <PrimaryButton
            label={rollLabel(offer, rollsRemaining)}
            disabled={rollState === 'loading'}
            onPress={onRoll}
          />
        )}

        {hired ? (
          confirmingFire ? (
            <ThemedView type="backgroundElement" style={styles.fireConfirm}>
              <ThemedText type="smallBold">Let {hired.name} go?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Losing your {title} costs the team {C_LEVEL_DEPARTURE_MORALE_HIT} morale, and the seat
                goes back to empty.
              </ThemedText>
              <View style={styles.fireActions}>
                <PrimaryButton
                  variant="secondary"
                  label="Cancel"
                  onPress={() => setConfirmingFire(false)}
                  style={styles.fireButton}
                />
                {/* Filled danger, not the usual blue: this button sits a few
                    pixels under "Spin again", and two identical blues would
                    make the destructive one a mis-tap away. */}
                <PrimaryButton
                  variant="danger"
                  label="Fire them"
                  onPress={() => {
                    setConfirmingFire(false);
                    onFire();
                    sheetRef.current?.dismiss();
                  }}
                  style={styles.fireButton}
                />
              </View>
            </ThemedView>
          ) : (
            <Pressable
              onPress={() => setConfirmingFire(true)}
              accessibilityRole="button"
              accessibilityLabel={`Fire ${hired.name}`}
              hitSlop={8}
              style={styles.fireLink}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                Fire {hired.name}
              </ThemedText>
            </Pressable>
          )
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function rollLabel(offer: CLevelOffer | null, rollsRemaining: number | null): string {
  const verb = offer ? 'Spin again' : 'Spin';
  return rollsRemaining === null ? verb : `${verb} · ${rollsRemaining} left`;
}

function CandidateRow({
  candidate,
  source,
  affordable,
  onHire,
}: {
  candidate: CLevelCandidate;
  /** The offer's banner text, so the row can skip repeating it. */
  source: string;
  affordable: boolean;
  onHire: () => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.candidate}>
      <ThemedText type="smallBold">
        {/* On a company tier every candidate's employer *is* the banner, so
            repeating it just prints the same line three times — and a themed
            roster banner is long enough to wrap when it does. On the cluster
            and legend tiers it differs per candidate, which is the whole
            point of showing it. */}
        {candidate.name}
        {candidate.exEmployer === source ? '' : ` · ${candidate.exEmployer}`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {candidate.personality}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {candidate.perk.label} · {formatMoney(candidate.salary)}/wk
      </ThemedText>
      {candidate.quirk ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.quirk}>
          Quirk: {candidate.quirk.label}
        </ThemedText>
      ) : null}
      {affordable ? (
        <PrimaryButton label="Hire" onPress={onHire} />
      ) : (
        <>
          <PrimaryButton label="Hire" disabled onPress={onHire} />
          <ThemedText type="small" style={{ color: theme.warning }}>
            That salary would burn through your runway. Not yet.
          </ThemedText>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  sheet: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  reveal: {
    gap: Spacing.three,
  },
  banner: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  candidate: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  empty: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'flex-start',
  },
  wall: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  quirk: {
    fontStyle: 'italic',
  },
  incumbent: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
    alignItems: 'flex-start',
  },
  fireConfirm: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  fireActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  fireButton: {
    flex: 1,
  },
  fireLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
