/**
 * Stops the buy-weeks flow from re-offering a purchase that keeps failing.
 *
 * In Sep 2026 one player tapped into 105 paywall failures in 34 minutes: the
 * store was unreachable, every tap re-ran the same doomed request, and
 * nothing on screen said so. After `FAILURE_THRESHOLD` consecutive failures
 * the flow shows an explanation instead of trying again.
 *
 * The block is time-boxed rather than session-long on purpose. Two network
 * blips shouldn't lock a paying player out until the next cold start — that
 * would cost exactly the revenue this exists to protect. Any clean close of
 * the paywall (purchase, restore, or a plain dismissal, which proves the
 * store answered) clears the count.
 *
 * Module-level rather than React state: the count must survive the chrome
 * remounting between tabs, and pure functions over a plain object keep the
 * policy testable without rendering anything.
 */

export const FAILURE_THRESHOLD = 2;
export const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

export interface PurchaseFailureGate {
  consecutiveFailures: number;
  lastFailureAt: number | null;
}

export const OPEN_GATE: PurchaseFailureGate = { consecutiveFailures: 0, lastFailureAt: null };

export function recordFailure(gate: PurchaseFailureGate, now: number): PurchaseFailureGate {
  // A failure after the cooldown starts a fresh streak rather than extending
  // the old one, so a single later blip can't re-trip the block on its own.
  const expired = gate.lastFailureAt !== null && now - gate.lastFailureAt >= FAILURE_COOLDOWN_MS;
  return { consecutiveFailures: (expired ? 0 : gate.consecutiveFailures) + 1, lastFailureAt: now };
}

export function isBlocked(gate: PurchaseFailureGate, now: number): boolean {
  return (
    gate.consecutiveFailures >= FAILURE_THRESHOLD &&
    gate.lastFailureAt !== null &&
    now - gate.lastFailureAt < FAILURE_COOLDOWN_MS
  );
}

let current: PurchaseFailureGate = OPEN_GATE;

/** Records a failed attempt; returns whether the flow is now blocked. */
export function notePurchaseAttemptFailed(now = Date.now()): boolean {
  current = recordFailure(current, now);
  return isBlocked(current, now);
}

export function notePurchaseSurfaceWorked(): void {
  current = OPEN_GATE;
}

export function purchasesBlocked(now = Date.now()): boolean {
  return isBlocked(current, now);
}
