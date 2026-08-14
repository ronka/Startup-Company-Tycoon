import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { CLevelCandidate, CLevelRole, PerkBand } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';

/** Monogram diameter, and — with the row padding and gap — the divider's inset. */
const MONOGRAM = 44;

export interface LeadershipSeat {
  role: CLevelRole;
  /** Display title for the seat, e.g. `CTO`. */
  title: string;
  hired: CLevelCandidate | null;
  /** Whether this seat is holding the result of a past spin. */
  hasOffer: boolean;
  /**
   * Mirrors the screen's roll budget so an empty seat can say whether tapping
   * it will spin or only re-open the last result.
   */
  rollState: 'ready' | 'loading' | 'empty';
}

/**
 * The three C-level seats as one roster, the way an org chart reads: a row per
 * seat, the whole row the tap target.
 *
 * Replaces the old card-per-seat grid, where each seat carried two full-size
 * buttons — roughly 340px of button stacked under an already-long screen, with
 * the loudest element on a *filled* seat being a browse action. Here the person
 * is the row and the action is the row, so a settled seat costs three lines and
 * the empty ones are the only thing asking for a tap.
 *
 * Firing lives inside the seat's picker sheet rather than out here: it belongs
 * next to "hire", and keeping it off the roster means one fewer RN `<Modal>`
 * mounted on this tab (see `docs/bug-stuck-decision-modal.md`).
 */
export function LeadershipRoster({
  seats,
  onOpenSeat,
}: {
  seats: LeadershipSeat[];
  onOpenSeat: (role: CLevelRole) => void;
}) {
  return (
    <Card tone="plain">
      {seats.map((seat, i) => (
        <View key={seat.role}>
          {i > 0 ? <RowDivider /> : null}
          <SeatRow seat={seat} onPress={() => onOpenSeat(seat.role)} />
        </View>
      ))}
    </Card>
  );
}

function RowDivider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

function SeatRow({ seat, onPress }: { seat: LeadershipSeat; onPress: () => void }) {
  const theme = useTheme();
  const { hired, title } = seat;
  const tone = tierTone(hired?.tier ?? null, theme);
  const hint = emptyHint(seat);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        hired
          ? `${title}, ${hired.name}. ${hired.perk.label}, ${formatMoney(hired.salary)} per week. Opens the market.`
          : `${title}, seat open. ${hint}`
      }
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.surfaceRaised }]}>
      <View
        style={[styles.monogram, { backgroundColor: tone.surface, borderColor: tone.border }]}>
        <ThemedText style={[styles.monogramText, { color: tone.ink }]}>
          {hired ? initials(hired.name) : '–'}
        </ThemedText>
      </View>

      <View style={styles.body}>
        {/* The badge rides the role line, not the name line. Beside the name it
            competed for width with the longest names in the pool and clipped
            "Margaret Hamiltton" to "Margaret Ha…" — on precisely the legend
            hire the badge exists to celebrate. The role line has room to spare.
            Only elite and legend are badged at all: colouring all six bands
            turns the roster into a rainbow and makes a bootcamp grad look as
            decorated as a legend. */}
        <View style={styles.roleRow}>
          <ThemedText type="sectionLabel">{title}</ThemedText>
          {hired && tone.badge ? (
            <View style={[styles.badge, { backgroundColor: tone.surface, borderColor: tone.border }]}>
              <ThemedText type="footnote" style={[styles.badgeText, { color: tone.ink }]}>
                {tone.badge}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <ThemedText
          style={[styles.name, hired ? null : { color: theme.textSecondary }]}
          numberOfLines={1}>
          {hired ? hired.name : 'Seat open'}
        </ThemedText>

        {hired ? (
          // Perk and salary share a line but not a text run: a long perk like
          // "+40% dev productivity, +35% tech-debt drag" would otherwise wrap
          // and strand the salary alone on the next line. The perk wraps, the
          // price stays pinned right, and the three salaries line up as a column.
          <View style={styles.metaRow}>
            <ThemedText type="small" style={[styles.perk, { color: theme.success }]} numberOfLines={2}>
              {hired.perk.label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatMoney(hired.salary)}/wk
            </ThemedText>
          </View>
        ) : (
          <ThemedText type="small" style={{ color: seat.hasOffer ? theme.accent : theme.textMuted }}>
            {hint}
          </ThemedText>
        )}
      </View>

      <ThemedText
        style={[styles.chevron, { color: theme.textMuted }]}
        accessibilityElementsHidden
        importantForAccessibility="no">
        ›
      </ThemedText>
    </Pressable>
  );
}

/** What an empty seat promises a tap will do — the roster has no button label to say it. */
function emptyHint(seat: LeadershipSeat): string {
  if (seat.hasOffer) return 'Candidates waiting';
  if (seat.rollState === 'empty') return 'Out of spins today';
  if (seat.rollState === 'loading') return 'Checking your spins…';
  return 'Tap to spin the market';
}

function tierTone(tier: PerkBand | null, theme: ReturnType<typeof useTheme>) {
  if (tier === 'legend') {
    return { surface: theme.warningBackground, border: theme.warning, ink: theme.warning, badge: '★ Legend' };
  }
  if (tier === 'elite') {
    return { surface: theme.accentSurface, border: theme.accent, ink: theme.accent, badge: 'Elite' };
  }
  return { surface: theme.surfaceRaised, border: theme.border, ink: theme.textSecondary, badge: null };
}

/** First and last initial — "Guido van Rossom" reads better as GR than GV. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + MONOGRAM + Spacing.three,
  },
  monogram: {
    width: MONOGRAM,
    height: MONOGRAM,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  perk: {
    flexShrink: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  badge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  badgeText: {
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chevron: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '400',
  },
});
