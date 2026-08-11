import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { retireAllHints } from '@/components/game/first-run-hint';
import { LINK_HIT_SLOP } from '@/components/game/legal-links-row';
import { PaywallFooter } from '@/components/game/paywall-footer';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { randomReviveReason } from '@/game/revive-reasons';
import type { GameOverReason } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { buildShareText } from '@/lib/share-card';
import { shareRunText } from '@/lib/share-run';
import { purchasesClient, purchasesAvailable, REVIVE_PRICE_LABEL, type PurchaseErrorCode } from '@/purchases';
import { useGame } from '@/state/game-store';
import { canRedeemRevive } from '@/state/revive';
import { bestScore } from '@/state/run-history';
import { notePurchaseFailed, requestReviewOnce } from '@/state/store-review';

/**
 * How long the personal-best review ask waits after this screen mounts. Longer
 * than the chrome's 350ms arming delays because this beat is a read, not a
 * transition: the score wants to land and be seen before anything is asked of the
 * player. Also keeps the sheet well clear of the modal presentation itself.
 */
const REVIEW_ARM_MS = 1200;

/**
 * How long the result gets to itself before the bailout card rises into view.
 * Short enough not to feel like a hang, long enough that the offer reads as a
 * second beat rather than part of the scoreboard.
 */
const OFFER_ARM_MS = 700;

const HEADLINE: Record<GameOverReason, string> = {
  bankruptcy: 'Bankrupt',
  acquired: 'Acquired',
  ipo: 'IPO',
};

/**
 * One line, under the score. Short on purpose: the long form ("Cash stayed
 * negative too long — out of runway after 36 weeks.") wrapped to two lines on
 * the narrowest phones and pushed the result off its own beat.
 */
const TAGLINE: Record<GameOverReason, (weeks: number) => string> = {
  bankruptcy: (weeks) => `Out of runway in week ${weeks}`,
  acquired: (weeks) => `Acquired in week ${weeks}`,
  ipo: (weeks) => `Rang the bell in week ${weeks}`,
};

export default function GameOverScreen() {
  const { state, revivePool, creditRevivePurchase, redeemRevive, runHistory, lastRunWasBest } = useGame();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const reason = state?.gameOver ?? null;
  const isBankruptcy = reason === 'bankruptcy';
  const best = runHistory ? bestScore(runHistory) : null;
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
  const [sharing, setSharing] = useState(false);
  const [errorCode, setErrorCode] = useState<PurchaseErrorCode | null>(null);
  // Set the instant we redeem, so the `!gameOver` re-render doesn't bounce to
  // `/` before the replace below has moved us to the live game.
  const [redeeming, setRedeeming] = useState(false);
  const [offerSlide] = useState(() => new Animated.Value(0));

  /**
   * Whether this run is over for good, as opposed to merely showing its ending.
   * A bailout still on the table means it isn't: the player can pay to carry on,
   * so `startFresh` is what settles it on that path.
   *
   * Waits for `revivePool` to resolve, or an unredeemed token would be missed in
   * the beat before the bailout offer appears.
   */
  const roundEndedForGood = reason !== null && revivePool !== null && !canBailout;

  // First-run hints are exactly that — first *run*. Retire the whole pass once
  // the round is settled, so the next company isn't taught the same lessons
  // again. A first-run player who pays to revive is continuing that run, not
  // ending it, and pulling their hints mid-game would be a strange thing to buy.
  // Idempotent, and Settings → Replay intro (and the debug reset) still bring
  // them back.
  useEffect(() => {
    if (roundEndedForGood) retireAllHints();
  }, [roundEndedForGood]);

  useEffect(() => {
    if (!reason) return;
    track(EVENTS.GAME_OVER_VIEWED, {
      reason,
      final_score: Math.round(state?.finalScore ?? 0),
      weeks: state?.week,
      is_new_best: lastRunWasBest,
    });
  }, [reason, state?.finalScore, state?.week, lastRunWasBest]);

  // The strongest "this player is happy" state the app can observe: a run that
  // survived *and* set a personal best — the same beat the "New personal best!"
  // line below celebrates. Never on bankruptcy, and never while the bailout pitch
  // is on screen, which would put an ask for a favour next to an ask for money.
  //
  // Armed rather than immediate, and the timer is cleared on unmount: this screen
  // is a modal, `startFresh` replaces it with `/onboarding`, and a stray timer
  // firing the system sheet mid-navigation is exactly this repo's documented
  // modal-hang class (docs/bug-stuck-decision-modal.md).
  const reviewDue = reason !== null && reason !== 'bankruptcy' && lastRunWasBest;
  useEffect(() => {
    if (!reviewDue) return;
    const timer = setTimeout(() => {
      requestReviewOnce('run_ended_best');
    }, REVIEW_ARM_MS);
    return () => clearTimeout(timer);
  }, [reviewDue]);

  // The offer is the screen's second beat: the result lands on its own, then
  // the bailout card rises from the bottom edge. A player holding a token has
  // already paid, so their claim button doesn't make them wait for the beat.
  useEffect(() => {
    if (!canBailout) return;
    const timer = setTimeout(
      () => {
        Animated.spring(offerSlide, {
          toValue: 1,
          useNativeDriver: true,
          damping: 18,
          stiffness: 140,
        }).start();
      },
      hasToken ? 0 : OFFER_ARM_MS,
    );
    return () => clearTimeout(timer);
  }, [canBailout, hasToken, offerSlide]);

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
  // (gameOver has just cleared and we're already navigating to `/hq` ourselves).
  if (!state || !state.gameOver) {
    if (redeeming) return null;
    return <Redirect href="/" />;
  }

  const startFresh = () => {
    // Walking away from the bailout ends the round for good, so this is the
    // other place the first-run pass retires (the mount effect above skips it
    // while a bailout is still being offered). A no-op when that effect has
    // already run.
    retireAllHints();
    // This screen is presented as a modal (see app/_layout.tsx). *Pushing*
    // onboarding would stack it inside this modal's sheet container, so it
    // would open in a bottom sheet instead of full screen — hence a replace,
    // which swaps this route out of the root stack and lets onboarding render
    // with its own (full-screen) presentation.
    //
    // Replace rather than `dismissAll()` + `push` because this screen is
    // usually the *only* route there is: launch runs `replace('/hq')`, and the
    // tab guards reach here via `<Redirect>`, which is also a replace. On that
    // single-route stack `dismissAll()` dispatches POP_TO_TOP at a navigator
    // with nothing to pop — it no-ops, warns, and leaves onboarding to be
    // pushed inside the modal after all.
    router.replace('/onboarding');
  };

  const handleShare = () => {
    // The guard above proves `gameOver` is set, but that narrowing doesn't
    // survive into a callback — pin it to a local.
    const endedWith = state.gameOver as GameOverReason;
    setSharing(true);
    const message = buildShareText({
      companyName: state.companyName,
      reason: endedWith,
      week: state.week,
      score: state.finalScore ?? 0,
      valuationHistory: state.valuationHistory,
    });
    shareRunText(message)
      .then((outcome) => {
        track(EVENTS.RUN_SHARED, {
          reason: endedWith,
          weeks: state.week,
          final_score: Math.round(state.finalScore ?? 0),
          is_new_best: lastRunWasBest,
          outcome,
        });
      })
      .finally(() => setSharing(false));
  };

  const finishRevive = () => {
    setRedeeming(true);
    // Redeem first (clears gameOver) so the tabs underneath stop redirecting
    // back to /game-over, then go straight to the live game.
    redeemRevive(windfallReason);
    // Named destination rather than `dismissAll()`, which lands somewhere
    // different depending on how deep the stack happens to be — and both
    // outcomes are wrong for a player who just paid for a bailout. On the
    // single-route stack this screen usually sits on, POP_TO_TOP has nothing
    // to pop, so the modal stays up while this component renders `null`
    // (`redeeming` is set): a blank screen. On a deeper stack it pops to `/`,
    // where `autoContinued` has already been spent for this launch, so the
    // start menu sits there instead of resuming. `/hq` is the intended
    // destination in both cases, so ask for it directly.
    router.replace('/hq');
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
          notePurchaseFailed();
          setErrorCode(result.code);
        }
      })
      .catch(() => {
        setPending(false);
        track(EVENTS.PURCHASE_FAILED, { pack_id: 'revive', error_code: 'unknown' });
        notePurchaseFailed();
        setErrorCode('unknown');
      });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/*
        Beat one: the result, alone, with the whole screen to land in. Nothing
        here asks the player for anything — the only control is the share link,
        and it sits well below the score.
      */}
      <View style={styles.result}>
        <ThemedText type="title" style={styles.centered}>
          {HEADLINE[state.gameOver]}
        </ThemedText>
        <ThemedText type="hero" style={[styles.centered, styles.score]}>
          {formatMoney(state.finalScore ?? 0)}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" style={styles.centered}>
          {TAGLINE[state.gameOver](state.week)}
        </ThemedText>
        {lastRunWasBest ? (
          <ThemedText type="smallBold" themeColor="success" style={[styles.centered, styles.personalBest]}>
            New personal best!
          </ThemedText>
        ) : best !== null && best > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={[styles.centered, styles.personalBest]}>
            Personal best {formatMoney(best)}
          </ThemedText>
        ) : null}
        <Pressable
          onPress={handleShare}
          disabled={sharing || pending}
          hitSlop={LINK_HIT_SLOP}
          accessibilityRole="button"
          accessibilityState={{ busy: sharing, disabled: sharing || pending }}
          style={styles.share}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.shareLabel}>
            {sharing ? 'Sharing…' : 'Share result'}
          </ThemedText>
        </Pressable>
      </View>

      {canBailout ? (
        /*
          Beat two: the offer, on its own surface at the bottom edge, arriving
          after the result has been read. Everything the purchase needs lives
          inside this card — pitch, price, the way out, and the compliance
          line — so the ending above stays an ending.
        */
        <Animated.View
          style={[
            styles.offer,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              paddingBottom: insets.bottom + Spacing.four,
              opacity: offerSlide,
              transform: [{ translateY: offerSlide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            },
          ]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            🎩 {windfallReason}
          </ThemedText>
          <PrimaryButton
            label={hasToken ? 'Claim your inheritance' : `Take the money — ${revivePrice ?? REVIVE_PRICE_LABEL}`}
            loading={pending}
            disabled={pending}
            onPress={handleBailout}
          />
          {errorCode ? (
            <ThemedText type="small" themeColor="danger" style={styles.centered}>
              {errorCode === 'cancelled' ? 'Purchase cancelled.' : "Purchase didn't go through — try again."}
            </ThemedText>
          ) : null}
          <PrimaryButton label="New Game" variant="ghost" onPress={startFresh} disabled={pending} />
          {/*
            This screen is a paywall too, so it carries the same disclosure,
            restore control and terms links the week-pack sheet does. Hidden once
            a token is already in hand: there is nothing left to restore at that
            point, and the CTA above is already "claim it".
          */}
          {hasToken ? null : <PaywallFooter source="game_over" disclosure="One-time purchase" />}
        </Animated.View>
      ) : (
        <View style={[styles.plainActions, { paddingBottom: insets.bottom + Spacing.four }]}>
          <PrimaryButton label="New Game" onPress={startFresh} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    textAlign: 'center',
  },
  /** Takes the whole screen when there's no offer, and the space above it when there is. */
  result: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.one,
  },
  score: {
    marginVertical: Spacing.two,
  },
  personalBest: {
    marginTop: Spacing.two,
  },
  share: {
    marginTop: Spacing.four,
  },
  shareLabel: {
    textDecorationLine: 'underline',
  },
  offer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  plainActions: {
    paddingHorizontal: Spacing.four,
  },
});
