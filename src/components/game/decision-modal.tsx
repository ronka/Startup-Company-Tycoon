import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { ChoiceButton } from '@/components/game/choice-button';
import { HintBanner, useFirstRunHint } from '@/components/game/first-run-hint';
import { Pill } from '@/components/game/pill';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { acquisitionOfferValuationFor } from '@/game/balance';
import type { EventCard, EventEffects, EventStat, StatDelta } from '@/game/events/types';
import { formatMoney } from '@/lib/format';
import { ERA_LABEL } from '@/lib/strategy-copy';

const STAT_LABEL: Record<EventStat, string> = {
  cash: 'cash',
  morale: 'morale',
  hype: 'hype',
  productQuality: 'product quality',
  marketShare: 'market share',
};

function formatDelta(delta: StatDelta): string {
  const sign = delta.amount >= 0 ? '+' : '';
  if (delta.stat === 'hype' || delta.stat === 'marketShare') {
    return `${sign}${Math.round(delta.amount * 100)}% ${STAT_LABEL[delta.stat]}`;
  }
  if (delta.stat === 'cash') {
    return `${sign}${formatMoney(delta.amount)} ${STAT_LABEL[delta.stat]}`;
  }
  return `${sign}${delta.amount} ${STAT_LABEL[delta.stat]}`;
}

function summarizeEffects(effects: EventEffects, valuation: number): string {
  if (effects.acquisitionOffer) {
    const offer = acquisitionOfferValuationFor(valuation, effects.acquisitionOffer.valuationMultiplier);
    return `Ends the run — acquired for ~${formatMoney(offer)}`;
  }
  const parts = (effects.deltas ?? []).map(formatDelta);
  if (effects.timedEffect) {
    const { stat, multiplier, weeksLeft } = effects.timedEffect;
    const pct = Math.round((multiplier - 1) * 100);
    parts.push(`${pct >= 0 ? '+' : ''}${pct}% ${STAT_LABEL[stat]} for ${weeksLeft}wk`);
  }
  return parts.length ? parts.join(', ') : 'No effect';
}

/** Blocks the HQ screen until the player answers a decision card. */
export function DecisionModal({
  card,
  valuation,
  onChoose,
}: {
  card: EventCard | null;
  /** Current valuation, used to preview acquisition-offer amounts live. */
  valuation: number;
  onChoose: (choiceIndex: number) => void;
}) {
  const hint = useFirstRunHint('decision-cards');

  // Answering the card counts as reading the hint — otherwise it returns on
  // every card until the player happens to tap ✕.
  const choose = (index: number) => {
    if (hint.visible) hint.dismiss();
    onChoose(index);
  };

  // The card has to be answered, so the sheet has no ✕ and ignores backdrop taps.
  return (
    <BottomSheet visible={card !== null} dismissible={false}>
      {card ? (
        <>
          {hint.visible ? (
            <HintBanner
              text={'Decision cards are your weekly judgment calls. There’s rarely a "right" answer — just trade-offs.'}
              onDismiss={hint.dismiss}
            />
          ) : null}
          <View style={styles.badgeRow}>
            <Pill
              label={`${ERA_LABEL[card.era]} · Decision`}
              tone={endsTheRun(card) ? 'danger' : 'accent'}
            />
          </View>
          <ThemedText type="sheetTitle">{card.title}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.flavor}>
            {card.flavor}
          </ThemedText>
          <View style={styles.choices}>
            {card.choices?.map((choice, index) => (
              <ChoiceButton
                key={choice.label}
                label={choice.label}
                consequence={summarizeEffects(choice.effects, valuation)}
                // Tone is emphasis and irreversibility, never "this is the right
                // answer" — a choice that ends the run always reads as caution.
                tone={choice.effects.acquisitionOffer ? 'caution' : index === 0 ? 'primary' : 'neutral'}
                onPress={() => choose(index)}
              />
            ))}
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

/** True when any choice on the card would end the run (an acquisition offer). */
function endsTheRun(card: EventCard): boolean {
  return (card.choices ?? []).some((choice) => choice.effects.acquisitionOffer);
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
  },
  flavor: {
    lineHeight: 24,
  },
  choices: {
    gap: Spacing.two,
  },
});
