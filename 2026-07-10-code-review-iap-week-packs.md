# Thermo-Nuclear Review: IAP week-packs

**Verdict: solid engine, messy seam.** The purchases/budget core is genuinely
well-designed — but the presentation layer (`game-chrome.tsx`) grew three-deep
`IS_IOS` branching that duplicates render subtrees, and it re-derives "can the
user buy?" instead of asking the layer that already knows. Two structural
findings; neither is a correctness bug, both are the kind of debt that hardens
if it ships.

---

## 1. `IS_IOS` ternaries in the budget row are spaghetti — highest-value finding

`game-chrome.tsx:106-135` is now a nested ternary tree:
`budgetExhausted ? (IS_IOS ? … : …) : weekBudget ? (IS_IOS ? … : …) : null`.
Look at the second pair (`:122-136`):

```jsx
IS_IOS ? (
  <Pressable onPress={() => setBuySheetTrigger('hud')} accessibilityRole="button">
    <WeekBudgetDots weeksRemaining={weekBudget.weeksRemaining} purchasedWeeksRemaining={purchasedWeeks?.weeksRemaining ?? 0} />
  </Pressable>
) : (
  <WeekBudgetDots weeksRemaining={weekBudget.weeksRemaining} purchasedWeeksRemaining={purchasedWeeks?.weeksRemaining ?? 0} />
)
```

The `<WeekBudgetDots …/>` is **byte-for-byte identical** in both branches — the
ternary exists only to add/drop a `Pressable` wrapper, at the cost of
duplicating the child. Same shape repeats for the exhausted-copy branch above
it. *This adds special-case branches into an already busy render flow — move it
behind its own abstraction.*

Two remedy altitudes:

- **Minimal** — a tiny `MaybePressable({ onPress, children })` that renders
  `children` bare when `onPress` is undefined. Each pair collapses to one
  branch, the duplication disappears, and the `IS_IOS` decision becomes
  `onPress={canBuy ? … : undefined}`.
- **Ambitious (the code-judo)** — extract the entire budget row *and* the
  `<BuyWeeksSheet>` (`:166-173`) into a `<WeekBudgetControl>` subcomponent that
  owns `buySheetTrigger`, the affordance, and the purchase wiring internally.
  `GameChrome` then renders one element and stops carrying any of this branching
  or the `buySheetTrigger` state (`:36`). This is the version that makes the
  change feel inevitable in hindsight — the IAP concern lives in one file, and
  `GameChrome` goes back to being pure layout.

Push for the second. The affordance, the sheet, the trigger state, and the
dots-vs-badge rendering are one cohesive concept currently smeared across
`GameChrome`.

## 2. "Can the user buy?" is re-derived in the UI instead of owned by `@/purchases`

`game-chrome.tsx:20` hardcodes `const IS_IOS = Platform.OS === 'ios'` as the
gate for the whole feature. But `src/purchases/index.native.ts:20` already
computes the *real* capability:

```ts
const canUseRevenueCat = Platform.OS === 'ios' && Constants.appOwnership !== 'expo';
```

These predicates **disagree on iOS in Expo Go**: `IS_IOS` is true, so the HUD
shows "Buy more weeks →" and opens the sheet — but the layer fell back to the
stub, whose `purchasePack` grants weeks *instantly and for free*
(`stub.ts:20`). So the paywall is live and every "purchase" is a free grant.
That's dev-only today, but it's the tell that the UI is gating on **OS** while
the layer gates on **actual capability** — exactly the boundary leak that
belongs in the canonical layer.

Fix: expose one flag from the canonical layer — `export const purchasesAvailable`
(or `getPacks()` returning `[]`) from `@/purchases`, derived from the same
`canUseRevenueCat` signal — and gate the UI on that instead of an inline
`Platform.OS` check. The UI stops knowing what "iOS" has to do with purchases,
and finding #1's extraction gets cleaner: `onPress={purchasesAvailable ? … : undefined}`.

## What's genuinely strong — don't touch it

The atomicity design is the best part of this PR and should be called out as the
bar to hold: `creditTransaction` (`week-budget.ts`) folds `weeksRemaining` and
the `grantedTransactionIds` ledger into a **single object literal**, persisted
in one write, so a crash can never mark a transaction granted without its weeks
landing. `reconcilePurchases` (`reconciliation.ts`) is pure — no SDK, no storage
— and correctly idempotent, so the launch-reconcile and post-purchase paths
share one tested code path. The spend-during-reconcile race is safe: the
functional `setPurchasedWeeks((prev) => creditTransactions(prev ?? …, newlyGranted))`
(`game-store.tsx`) combined with the idempotent ledger makes it so. The
pool/budget separation (cap-exempt, survives `NEW_GAME`, free-first spend via
`spendWeekFromPools`) is the right model. No notes.

## Minor

- `app.json` lost its trailing newline (`\ No newline at end of file`). Restore
  it — one-liner, not a blocker.

---

**No correctness bug found, and I looked** — `budgetExhausted` correctly
requires *both* pools empty via `canSpendAnyWeek`, so the dots/badge/copy states
stay consistent. The substance is the two structural items above.

**Approval bar: not yet** — finding #1 (spaghetti growth) and #2 (boundary leak)
are presumptive blockers under this review; both have a clear,
behavior-preserving decomposition. Land the `<WeekBudgetControl>` extraction + a
`purchasesAvailable` flag and this is a clean merge.
