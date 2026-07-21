import { Modal, StyleSheet, View } from 'react-native';

import { FirstRunHint } from '@/components/game/first-run-hint';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { acquisitionOfferValuationFor } from '@/game/balance';
import type { EventCard, EventEffects, EventStat, StatDelta } from '@/game/events/types';
import { formatMoney } from '@/lib/format';

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
  return (
    <Modal visible={card !== null} transparent animationType="fade">
      <View style={styles.backdrop}>
        {card ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <FirstRunHint
              id="decision-cards"
              text={'Decision cards are your weekly judgment calls. There’s rarely a "right" answer — just trade-offs.'}
            />
            <ThemedText type="smallBold">{card.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flavor}>
              {card.flavor}
            </ThemedText>
            <View style={styles.choices}>
              {card.choices?.map((choice, index) => (
                <View key={choice.label} style={styles.choiceRow}>
                  <PrimaryButton
                    label={choice.label}
                    variant={index === 0 ? 'primary' : 'secondary'}
                    onPress={() => onChoose(index)}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {summarizeEffects(choice.effects, valuation)}
                  </ThemedText>
                </View>
              ))}
            </View>
          </ThemedView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  flavor: {
    lineHeight: 20,
  },
  choices: {
    gap: Spacing.three,
  },
  choiceRow: {
    gap: Spacing.one,
    alignItems: 'stretch',
  },
});
