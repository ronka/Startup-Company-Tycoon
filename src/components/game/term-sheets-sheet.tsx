import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/game/bottom-sheet';
import { Card } from '@/components/game/card';
import { Pill } from '@/components/game/pill';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { BRIDGE_RUNWAY_THRESHOLD_WEEKS, founderStakeFor, runwayWeeks } from '@/game/balance';
import { ROUND_LABEL, acceptedDilutionFor, investorById, weeksToExpiry } from '@/game/investors';
import type { FundingOffer, GameState } from '@/game/types';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney, formatWeeks } from '@/lib/format';

/** A stake as the term sheet prints it: whole percents, or one decimal when it matters. */
export function formatStake(dilution: number): string {
  const pct = dilution * 100;
  return `${Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct) : pct.toFixed(1)}%`;
}

function expiryLabel(weeksLeft: number): string {
  return weeksLeft === 0 ? 'Last week to sign' : `Expires in ${formatWeeks(weeksLeft)}`;
}

function OfferCard({
  state,
  offer,
  onTake,
  onPass,
}: {
  state: GameState;
  offer: FundingOffer;
  onTake: () => void;
  onPass: () => void;
}) {
  const investor = investorById(offer.investorId);
  const dilution = acceptedDilutionFor(state, offer);
  const discounted = dilution < offer.dilution;
  const weeksLeft = weeksToExpiry(state, offer);

  return (
    <Card style={styles.offer}>
      <ThemedText type="smallBold">{investor?.name ?? 'An investor'}</ThemedText>
      {investor ? (
        <ThemedText type="footnote" themeColor="textMuted">
          {investor.pitch}
        </ThemedText>
      ) : null}
      <ThemedText type="default">
        {formatMoney(offer.amount)} for{' '}
        {dilution === 0 ? 'no equity' : discounted ? `${formatStake(dilution)} (was ${formatStake(offer.dilution)})` : formatStake(dilution)}
      </ThemedText>
      <View style={styles.chips}>
        {investor?.strings ? <Pill label={investor.strings.label} tone="accent" /> : null}
        {offer.isBridge ? <Pill label="Bridge terms" tone="danger" /> : null}
        <Pill label={expiryLabel(weeksLeft)} tone={weeksLeft === 0 ? 'danger' : 'default'} />
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="secondary" label="Pass" onPress={onPass} style={styles.button} />
        <PrimaryButton label="Take" onPress={onTake} style={styles.button} />
      </View>
    </Card>
  );
}

/**
 * Every term sheet on the table for the open round, with Take / Pass on each.
 * Take opens a confirm step in the same sheet with the equity and stake
 * before/after, since signing closes the round and withdraws the rest.
 */
export function TermSheetsSheet({
  state,
  visible,
  onClose,
  onAccept,
  onDecline,
}: {
  state: GameState;
  visible: boolean;
  onClose: () => void;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
}) {
  // The offer being confirmed, held by value: after Sign the table empties
  // at once, but the sheet keeps showing the confirm step while it slides
  // away. The Money tab remounts the sheet on every open (`key`), so each
  // open starts on the list.
  const [selected, setSelected] = useState<FundingOffer | null>(null);
  const offers = state.fundingOffers ?? [];

  const round = offers[0]?.round;
  const title = selected
    ? `Sign with ${investorById(selected.investorId)?.name ?? 'this investor'}?`
    : round
      ? `${ROUND_LABEL[round]} term sheets`
      : 'Term sheets';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}>
      {selected ? (
        <ConfirmOffer
          state={state}
          offer={selected}
          onBack={() => setSelected(null)}
          onSign={() => onAccept(selected.id)}
        />
      ) : offers.length === 0 ? (
        // Only reachable while the sheet is closing after the last Pass.
        visible ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing on the table right now.
          </ThemedText>
        ) : null
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            Taking one closes the round and the others walk away. Pass, or wait: new investors show up most weeks.
          </ThemedText>
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              state={state}
              offer={offer}
              onTake={() => setSelected(offer)}
              onPass={() => onDecline(offer.id)}
            />
          ))}
        </>
      )}
    </BottomSheet>
  );
}

function ConfirmOffer({
  state,
  offer,
  onBack,
  onSign,
}: {
  state: GameState;
  offer: FundingOffer;
  onBack: () => void;
  onSign: () => void;
}) {
  const { burn, revenue, valuation, stake } = deriveWeeklyStats(state);
  const investor = investorById(offer.investorId);
  const dilution = acceptedDilutionFor(state, offer);
  const equityAfter = state.founderEquity * (1 - dilution);
  const stakeAfter = founderStakeFor(equityAfter, valuation);
  const runwayAfter = runwayWeeks(state.cash + offer.amount, burn - revenue);
  const stillShort = offer.isBridge && runwayAfter < BRIDGE_RUNWAY_THRESHOLD_WEEKS;

  return (
    <>
      {offer.isBridge ? (
        <ThemedText type="small" themeColor="warning" style={styles.body}>
          Runway was under {formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)} when this came in, so it&apos;s priced as a
          bridge: less cash, more dilution.
          {stillShort
            ? ` It still leaves you under ${formatWeeks(BRIDGE_RUNWAY_THRESHOLD_WEEKS)}, so your next round will likely be a bridge too.`
            : ''}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        {dilution === 0
          ? `${formatMoney(offer.amount)} and you keep every share. Founder equity stays at ${Math.round(state.founderEquity * 100)}%.`
          : `${formatMoney(offer.amount)} for ${formatStake(dilution)} of the company. Founder equity goes from ${Math.round(
              state.founderEquity * 100,
            )}% to ${Math.round(equityAfter * 100)}%.`}
      </ThemedText>
      {dilution > 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          Your stake goes from {formatMoney(stake)} to ~{formatMoney(stakeAfter)}.
        </ThemedText>
      ) : null}
      {investor?.strings ? (
        <ThemedText type="small" themeColor="accent" style={styles.body}>
          Strings attached: {investor.strings.label}.
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textMuted" style={styles.body}>
        This closes the {ROUND_LABEL[offer.round]} round. Every other offer is withdrawn.
      </ThemedText>
      <View style={styles.actions}>
        <PrimaryButton variant="secondary" label="Back" onPress={onBack} style={styles.button} />
        <PrimaryButton label="Sign" onPress={onSign} style={styles.button} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  offer: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  button: {
    flex: 1,
  },
  body: {
    lineHeight: 20,
  },
});
