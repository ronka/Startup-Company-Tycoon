import { useCallback, useEffect, useRef, useState } from 'react';

import { EVENTS, track } from '@/analytics/events';
import { presentWeeksPaywall } from '@/purchases';
import { useGame } from '@/state/game-store';
import { notePurchaseFailed } from '@/state/store-review';

/** Where the player asked for more weeks from — carried through to analytics. */
export type BuyWeeksTrigger = 'out_of_weeks' | 'hud';

/**
 * How long to wait before re-running the ledger diff when a completed purchase
 * credited nothing.
 *
 * The old in-app sheet got its transaction straight back from
 * `purchasePackage()`. The hosted paywall doesn't hand one back at all, so the
 * purchase is found by diffing `getCustomerInfo()` against the ledger — and
 * that can answer from a cache which hasn't caught the purchase that just
 * completed. Without a retry that's a player who paid and sees nothing until
 * the next cold start heals it. The pass is idempotent, so a redundant retry
 * costs nothing.
 */
const LEDGER_CATCHUP_RETRY_MS = 1200;

/**
 * Which buy-weeks surface currently owns the screen.
 *
 * One value rather than a handful of booleans, because the states are mutually
 * exclusive and the transitions are the whole point: `idle -> paywall` on a
 * tap, `paywall -> sheet` only when the hosted paywall couldn't be shown at
 * all, and everything back to `idle` when the surface closes.
 */
type BuyFlow =
  | { kind: 'idle' }
  | { kind: 'paywall'; trigger: BuyWeeksTrigger }
  | { kind: 'sheet'; trigger: BuyWeeksTrigger };

const IDLE: BuyFlow = { kind: 'idle' };

/**
 * Owns the whole "player wants more weeks" flow: presenting the RevenueCat
 * paywall, falling back to the in-app sheet when it can't be shown, crediting
 * what was bought, and reporting all of it.
 *
 * Lives here rather than in `GameChrome` because none of it is view work — it
 * is purchase policy, and keeping it out of the chrome is what lets it be read
 * (and one day tested) on its own.
 *
 * `runIsLive` is whether a run is actually on screen. Every value this hook
 * returns is derived through it, so a flow left over from a run that ended can
 * never render a surface or block one; see the release effect below.
 */
export function useBuyWeeksFlow(runIsLive: boolean): {
  /** A buy surface owns the screen — nothing else may present over it. */
  isOpen: boolean;
  /** Non-null only while the fallback sheet should be on screen. */
  sheetTrigger: BuyWeeksTrigger | null;
  open: (trigger: BuyWeeksTrigger) => void;
  closeSheet: () => void;
} {
  const { reconcileAfterPaywall } = useGame();
  const [flow, setFlow] = useState<BuyFlow>(IDLE);
  // Synchronous mirror of `flow`, in the same shape as the store's
  // `purchasedWeeksRef`. Two taps landing in the same render both read the old
  // committed state and would both present; a double-present is the iOS hang
  // this codebase keeps tripping over (docs/bug-stuck-decision-modal.md), so
  // the guard has to see the first tap immediately.
  const flowRef = useRef<BuyFlow>(IDLE);
  // Read by the async fallback below, which resolves long after the tap that
  // started it — by then the run may be over. Seeded at mount and updated on
  // commit, which is early enough: a run ends by way of a state change, so the
  // effect below has already run by the time any promise continuation is
  // scheduled off the back of it.
  const runIsLiveRef = useRef(runIsLive);

  const enter = useCallback((next: BuyFlow) => {
    flowRef.current = next;
    setFlow(next);
  }, []);

  // Ref-only: every value this hook returns is already derived through
  // `runIsLive`, so there is no state to reconcile here — just the guard to
  // release, or a run ending mid-flow would leave it armed and silently
  // no-op every later attempt.
  useEffect(() => {
    runIsLiveRef.current = runIsLive;
    if (!runIsLive) flowRef.current = IDLE;
  }, [runIsLive]);

  const open = useCallback(
    (trigger: BuyWeeksTrigger) => {
      if (flowRef.current.kind !== 'idle') return;
      enter({ kind: 'paywall', trigger });
      presentWeeksPaywall()
        .then(async (outcome) => {
          if (outcome === 'not_presented') {
            // Offerings failed to load, no paywall is attached, or this binary
            // predates the paywall UI native module. The sheet renders from a
            // hardcoded pack catalog, so it still works where this doesn't —
            // but only hand it the flow if there is still a run to hand it to.
            enter(runIsLiveRef.current ? { kind: 'sheet', trigger } : IDLE);
            return;
          }
          track(EVENTS.PAYWALL_SHOWN, { trigger, surface: 'revenuecat' });
          if (outcome === 'purchased' || outcome === 'restored') {
            let { weeks, revives } = await reconcileAfterPaywall();
            if (weeks === 0 && outcome === 'purchased') {
              await new Promise((resolve) => setTimeout(resolve, LEDGER_CATCHUP_RETRY_MS));
              // Summed, not replaced: each pass reports only what *it* newly
              // credited, so a revive the first pass picked up would be lost by
              // taking the second one's tally on its own.
              const retry = await reconcileAfterPaywall();
              weeks += retry.weeks;
              revives += retry.revives;
            }
            track(EVENTS.PURCHASE_COMPLETED, {
              trigger,
              surface: 'revenuecat',
              outcome,
              weeks_granted: weeks,
              revives_granted: revives,
            });
          } else if (outcome === 'error') {
            track(EVENTS.PURCHASE_FAILED, { trigger, surface: 'revenuecat', error_code: 'unknown' });
            // Only a genuine failure suppresses the review ask — deliberately
            // *not* `cancelled`. Dismissing a full-screen paywall is ordinary
            // browsing, and treating that as a failed purchase would mute the
            // review prompt for most players who ever glance at this screen.
            notePurchaseFailed();
          }
          enter(IDLE);
        })
        .catch(() => {
          track(EVENTS.PURCHASE_FAILED, { trigger, surface: 'revenuecat', error_code: 'unknown' });
          notePurchaseFailed();
          enter(IDLE);
        });
    },
    [enter, reconcileAfterPaywall],
  );

  const closeSheet = useCallback(() => enter(IDLE), [enter]);

  return {
    isOpen: runIsLive && flow.kind !== 'idle',
    sheetTrigger: runIsLive && flow.kind === 'sheet' ? flow.trigger : null,
    open,
    closeSheet,
  };
}
