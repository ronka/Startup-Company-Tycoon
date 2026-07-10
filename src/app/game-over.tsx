import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { randomReviveReason } from '@/game/revive-reasons';
import type { GameOverReason } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import {
  purchasesClient,
  purchasesAvailable,
  REVIVE_PRICE_LABEL,
  type PurchaseErrorCode,
} from '@/purchases';
import { useGame } from '@/state/game-store';
import { canRedeemRevive } from '@/state/revive';

const HEADLINE: Record<GameOverReason, string> = {
  bankruptcy: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

const SUBTITLE: Record<GameOverReason, (weeks: number) => string> = {
  bankruptcy: (weeks) =>
    `Cash stayed negative too long — out of runway after ${weeks} weeks.`,
  acquired: (weeks) => `Acquired after ${weeks} weeks.`,
  ipo: (weeks) => `Rang the bell after ${weeks} weeks.`,
};

export default function GameOverScreen() {
  const { state, revivePool, creditRevivePurchase, redeemRevive } = useGame();
  const router = useRouter();
  const theme = useTheme();

  const reason = state?.gameOver ?? null;
  const isBankruptcy = reason === 'bankruptcy';
  // The bailout is offered only on bankruptcy, and only where real purchases
  // work (iOS custom builds) — see `purchasesAvailable`. A revive already sitting
  // in the pool (a purchase that paid but never got redeemed, e.g. app killed
  // mid-flow) is claimable here too, even off the purchase path.
  const hasToken = revivePool ? canRedeemRevive(revivePool) : false;
  const canBailout = isBankruptcy && (purchasesAvailable || hasToken);

  // Random windfall flavor, picked once per mount so the pitch and the news-log
  // entry match. Cosmetic only — the cash granted is fixed in the engine.
  const [windfallReason] = useState(() => randomReviveReason());
  const [revivePrice, setRevivePrice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<PurchaseErrorCode | null>(null);
  // Set the instant we redeem, so the `!gameOver` re-render doesn't bounce to
  // `/` before `dismissAll` unwinds this modal.
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (!reason) return;
    track(EVENTS.GAME_OVER_VIEWED, {
      reason,
      final_score: Math.round(state?.finalScore ?? 0),
      weeks: state?.week,
    });
  }, [reason, state?.finalScore, state?.week]);

  // Load the live store price and log the bailout paywall impression.
  useEffect(() => {
    if (!canBailout) return;
    track(EVENTS.PAYWALL_SHOWN, { trigger: 'bankruptcy' });
    let cancelled = false;
    purchasesClient
      .getRevivePrice()
      .then((price) => {
        if (!cancelled) setRevivePrice(price ?? REVIVE_PRICE_LABEL);
      })
      .catch(() => {
        if (!cancelled) setRevivePrice(REVIVE_PRICE_LABEL);
      });
    return () => {
      cancelled = true;
    };
  }, [canBailout]);

  // Reached only when a run has actually ended — but not while we're redeeming
  // (gameOver has just cleared and we're about to dismiss this modal ourselves).
  if (!state || !state.gameOver) {
    if (redeeming) return null;
    return <Redirect href="/" />;
  }

  const startFresh = () => {
    // This screen is presented as a modal (see app/_layout.tsx). Pushing
    // onboarding directly would stack it *inside* this modal's sheet container,
    // so it would open in a bottom sheet instead of full screen. Dismiss the
    // modal first, then push onboarding onto the clean root stack.
    router.dismissAll();
    router.push('/onboarding');
  };

  const finishRevive = () => {
    setRedeeming(true);
    // Redeem first (clears gameOver) so the tabs underneath stop redirecting
    // back to /game-over, then dismiss this modal to reveal the live game.
    redeemRevive(windfallReason);
    router.dismissAll();
  };

  const handleBailout = () => {
    setErrorCode(null);
    // Crash-recovery path: a paid-but-unredeemed token is already waiting —
    // claim it, no new charge.
    if (hasToken) {
      finishRevive();
      return;
    }
    setPending(true);
    track(EVENTS.PURCHASE_STARTED, { pack_id: 'revive' });
    purchasesClient
      .purchaseRevive()
      .then((result) => {
        setPending(false);
        if (result.status === 'success') {
          track(EVENTS.PURCHASE_COMPLETED, { pack_id: 'revive', price_label: revivePrice ?? REVIVE_PRICE_LABEL });
          creditRevivePurchase(result.transactionId);
          finishRevive();
        } else {
          track(EVENTS.PURCHASE_FAILED, { pack_id: 'revive', error_code: result.code });
          setErrorCode(result.code);
        }
      })
      .catch(() => {
        setPending(false);
        track(EVENTS.PURCHASE_FAILED, { pack_id: 'revive', error_code: 'unknown' });
        setErrorCode('unknown');
      });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.body}>
        <ThemedText type="title" style={styles.headline}>
          {HEADLINE[state.gameOver]}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {SUBTITLE[state.gameOver](state.week)}
        </ThemedText>
        <ThemedText type="title" style={styles.score}>
          {formatMoney(state.finalScore ?? 0)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">Final score</ThemedText>
      </View>

      <View style={styles.actions}>
        {canBailout ? (
          <View style={styles.bailout}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.windfall}>
              🎩 {windfallReason}
            </ThemedText>
            <PrimaryButton
              label={
                hasToken
                  ? 'Claim your inheritance'
                  : `Take the money — ${revivePrice ?? REVIVE_PRICE_LABEL}`
              }
              loading={pending}
              disabled={pending}
              onPress={handleBailout}
            />
            {errorCode ? (
              <ThemedText type="small" themeColor="danger" style={styles.error}>
                {errorCode === 'cancelled' ? 'Purchase cancelled.' : "Purchase didn't go through — try again."}
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        <PrimaryButton
          label="New Game"
          variant={canBailout ? 'secondary' : 'primary'}
          onPress={startFresh}
          disabled={pending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  body: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  headline: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  score: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  actions: {
    gap: Spacing.three,
  },
  bailout: {
    gap: Spacing.two,
  },
  windfall: {
    textAlign: 'center',
  },
  error: {
    textAlign: 'center',
  },
});
