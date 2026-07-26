# Ask for an App Store review on a win

**Status:** IMPLEMENTED 2026-07-26 — typecheck, lint and 396 tests pass. Device verification still outstanding (see §5).
**Depends on:** `advisor-plans/2026-07-25-day-one-closing-panel.md` (DONE) — trigger T3 mounts in the slot that plan created.
**Ships in:** a native build. `expo-store-review` is a native module, so this **cannot go out as an OTA update** (`eas update`). See "Build & release" at the bottom.

## Two deviations from the plan as written, both forced by the code

1. **`store-review` is a platform-split directory, not a single file.** `game-store.tsx`
   imports it, and `game-store.test.ts` runs in a plain Node env that cannot parse
   `react-native`. So it follows `src/purchases/`'s convention exactly:
   `src/state/store-review/index.ts` (universal no-op, safe for web and vitest) and
   `index.native.ts` (the real one, resolved by Metro on device).
2. **`expo-store-review` is imported lazily, inside the async paths.** Its entry point
   calls `requireNativeModule('ExpoStoreReview')` at module scope, which **throws at
   import time** on a binary without the native module. Since `game-store.tsx` reaches
   this module on launch, a static import would mean that pushing this JS as an OTA to
   the current production build crashes every install on open. Lazy + guarded, an
   un-rebuilt binary just reports "review unavailable". `storeListingUrl()` reads
   `Constants.expoConfig` directly for the same reason — it must be synchronous for
   render and must work on a binary that predates the module.
3. **`notificationAskSettled(null, …)` returns `false`, not `true`** as this plan first
   specified. "Never spent" means the notification dialog is about to appear in the very
   beat T3 wants — it is the collision, not the absence of one. Installs that spent the
   shot before the day key existed are reconciled to a `'1970-01-01'` sentinel by
   `notificationAskSpentOnDateKey()` so they aren't blocked forever, and that function
   treats `PERMISSION_REQUESTED_KEY` as authoritative: a day key without it means an
   interrupted write, which reads as "never" and keeps the gate shut.

---

## The idea, and the one thing that constrains it

Ask for the rating on a beat the player already feels good about, never on a stop
sign, never after taking their money. Then ask almost never: the OS shows the sheet
at most a handful of times per year per device and **gives no callback** — you never
learn whether it appeared, whether they rated, or what they said. Every ask you spend
on a mediocre moment is one you can't spend on a good one.

That "no callback" property is what shapes the whole design:

- The app-side cap must sit **below** the OS cap, so the OS throttle never becomes
  the thing deciding your fate. **Max 2 asks ever, 45-day cooldown.**
- The only outcome signal is the **rating/review count in App Store Connect**. Plan the
  measurement around that, not around an event.
- `StoreReview.isAvailableAsync()` returns **`false` in TestFlight**. This is the same
  shape as the notification-permission trap already documented in memory: the
  distribution channel you'd normally test on is exactly the one where it can't fire.
  Verification runs on a dev build (§5), the live signal comes from App Store Connect.

## Population reality check — this is why the ladder looks like it does

From `advisor-plans/README.md` (PostHog 505800, first 88 installs):

| Moment | Players who ever reached it |
|---|---|
| Finished a run (any exit) | 9 |
| Reached streak ≥ 2 | 12 |
| Saw an era change | 3 |
| Raised a funding round | large (every run that survives past the early weeks) |

So "ask on IPO" is a prompt that fires for approximately nobody. The ladder below pairs
**one rare, very strong trigger** with **two that actually have population**.

---

## 1. The trigger ladder

Three triggers, checked independently, all funnelling through one gate module. First
eligible one wins; the gate makes sure they can't stack.

### T1 — `run_ended_best` (strongest signal, smallest population)

**Where:** `src/app/game-over.tsx`
**When:** `state.gameOver !== 'bankruptcy'` **and** `lastRunWasBest === true`.

The screen already renders "New personal best!" at line 156-159 — the ask rides that
beat. A survived run that set a personal best is the single most unambiguous "this
player is happy" state the app can observe.

**Timing hazard:** `/game-over` is presented as a modal (`app/_layout.tsx`, and
`startFresh` calls `router.dismissAll()`). Do **not** fire on mount (the modal is
presenting) and do **not** fire inside `startFresh` (it's dismissing). Arm on a
`setTimeout` after mount — same pattern and same reason as `DAY_COMPLETE_ARM_MS` and
`recapArmedWeek` in `game-chrome.tsx`. Use **1200ms**, longer than the chrome's 350ms,
so the score has settled and the player has read it. `docs/bug-stuck-decision-modal.md`
is the precedent for why overlapping presentations hang iOS.

**The effect must return `clearTimeout`** — copy `game-chrome.tsx:115-123` rather than
inventing a pattern. `startFresh` can run inside the 1200ms window (it calls
`router.dismissAll()` then `push('/onboarding')`), and an uncleaned timer would fire the
system sheet mid-navigation. That is precisely this repo's documented hang class.

### T2 — `funding_round` (workhorse)

**Where:** `src/state/game-store.tsx` — alongside the existing
`track(EVENTS.FUNDING_ROUND_RAISED, …)` at line 117
**When:** the round being raised is **`seriesA` or `seriesB`**. Seed is too early to read
as an achievement, and a first-week raise from a player who will churn in three minutes
is an ask thrown away.

Express the condition by **round name, not by count**:

```ts
const round = ROUND_ORDER[state.roundsRaised]; // pre-action state — see below
if (round === 'seriesA' || round === 'seriesB') { /* arm */ }
```

Two facts make the naive `roundsRaised >= 2` wrong, and both are verified:

- `captureAction` is called with **pre-action** state (`game-store.tsx:558` — capture
  then `dispatch`), so `ROUND_ORDER[state.roundsRaised]` names the round *being* raised.
- `ROUND_ORDER` is `['seed', 'seriesA', 'seriesB']` (`game/types.ts:135`) — three rounds,
  no pre-seed. So Series A is `roundsRaised === 1`, and `>= 2` would have matched Series B
  only, halving the population this trigger exists to reach.

A named comparison also can't drift if someone inserts a round into `ROUND_ORDER`; a
magic `>= 2` silently would.

Additional guard: `!state.pendingEvent` and no sheet open. A raise can land in the same
beat as a decision card. Arm on the same 350ms delay the chrome uses and re-check the
gate when the timer fires, not when it's set.

### T3 — `day_streak` (retention-aligned, reuses a proven slot)

**Where:** `src/components/game/game-chrome.tsx` — the `DayCompleteSheet`'s `onDismiss`,
next to `setAskedAtWall(true)` (line 304-308)
**When:** streak ≥ 3 days **and** the notification permission ask is already spent
**from a previous launch**.

That last clause is not optional and is the subtlest part of this plan. Line 191 mounts
`NotificationPermissionAsk` on exactly this dismissal, and the comment above it explains
why that slot was chosen: it's the strongest context for a nudge, and it keeps the iOS
system dialog out of the frame the sheet is presenting into. **Two system dialogs in one
beat is the failure mode.** The notification ask is one-shot-per-install and it feeds the
retention loop that `advisor-plans/README.md` identifies as the app's actual constraint —
it wins the collision every time. The review ask gets this slot only on a later day, once
the notification shot is permanently spent.

**How to implement the "previous day" check — and two ways not to.**

Neither of the flags already in `notification-permission.ts` works:

- **`PERMISSION_REQUESTED_KEY` alone** is `true` from the moment the ask fires, including
  on the very launch that spends it — so on wall day 1 it reads `true` by the time the
  sheet is dismissed and T3 fires into the collision.
- **The in-memory `permissionAskStarted` latch** means "someone *called* the function this
  launch," not "the dialog appeared." `NotificationPermissionAsk` mounts on *every* wall
  dismissal (line 191 keys off `askedAtWall`, not off whether the shot is unspent), so on
  day 5 the call still happens, sets the latch, and returns early at `alreadyRequested`
  (`notification-permission.ts:54-57`). T3 reading that latch would be suppressed
  **forever**. It also fails the opposite way on day 1: `setAskedAtWall(true)` and T3's
  check live in the same `onDismiss` handler, so T3 evaluates before the ask component has
  mounted and run its effect — latch still `false`, and the double dialog happens anyway.

**Do this instead: persist *when* the shot was spent.** In `notification-permission.ts`,
write a second key alongside `PERMISSION_REQUESTED_KEY` holding `dateKey(new Date())` at
the moment the ask fires. T3 requires that stored dateKey to be **strictly earlier than
today**. That is a real previous-day test, it survives cold starts (which an in-memory
latch cannot), and it reuses `dateKey` from `week-budget.ts` — already imported by both
surfaces. Feed the comparison through the pure module in §2 so it's testable.

### Explicitly rejected triggers

- **After a completed purchase.** Asking for a favour immediately after taking money
  reads as transactional. `purchase_completed` also has n=2 — no population anyway.
- **Mid-tick, while a recap or decision card owns the screen.** Guaranteed modal
  collision, and the player is mid-thought.
- **App launch / cold start.** No earned moment, and Apple's guidance is explicit
  about not interrupting.
- **A "Rate us ⭐️⭐️⭐️⭐️⭐️" button that calls `requestReview()`.** Guidance says don't
  drive the native sheet from a button. The Settings row in §4 opens the store URL
  instead, which is the correct pattern.
- **Stage advance / era change.** Stage advance is frequent enough to feel cheap; era
  change has n=3.

---

## 2. The gate — two modules, mirroring the notification-permission pattern

`notification-permission.ts` is the shipped precedent for a scarce one-shot ask, and
the repo already separates pure state logic from OS-touching code (`notification-content.ts`
and `notification-schedule.ts` are pure and unit-tested; `notification-permission.ts` is
impure and isn't). Follow that split exactly.

### `src/state/review-ask.ts` — pure, unit-tested

```ts
export const MAX_REVIEW_ASKS = 2;
export const REVIEW_COOLDOWN_DAYS = 45;

export type ReviewTrigger = 'run_ended_best' | 'funding_round' | 'day_streak';

export interface ReviewAskRecord {
  /** How many times the native sheet has been requested, ever. */
  askCount: number;
  /** Epoch ms of the most recent request, or null if never asked. */
  lastAskedAtMs: number | null;
}

export function initialReviewAskRecord(): ReviewAskRecord;

/** Pure eligibility: cap not reached, and the cooldown has elapsed. */
export function canAskForReview(record: ReviewAskRecord, nowMs: number): boolean;

/**
 * True when the notification permission shot was spent on an earlier day (or never).
 * `spentOnDateKey` is the key persisted by notification-permission.ts; `todayKey` is
 * `dateKey(new Date())`. Pure so T3's one subtle condition is unit-testable.
 */
export function notificationAskSettled(spentOnDateKey: string | null, todayKey: string): boolean;

/** Returns the record as it should be after an ask at `nowMs`. */
export function recordReviewAsk(record: ReviewAskRecord, nowMs: number): ReviewAskRecord;
```

Tests in `src/state/__tests__/review-ask.test.ts`, in the style of `day-close.test.ts`:
first ask allowed from a fresh record; second ask blocked inside the cooldown; second
ask allowed past it; third ask blocked forever; a corrupt/missing record degrades to
"allowed once" rather than throwing. Plus `notificationAskSettled`: `null` → true (never
asked), same day → **false**, earlier day → true.

### `src/state/store-review.ts` — impure, mirrors `notification-permission.ts`

```ts
const REVIEW_ASK_KEY = 'startup-tycoon/store-review/asks';

/** Guards against two callers in the same launch — see notification-permission.ts. */
let reviewAskStarted = false;

export async function requestReviewOnce(trigger: ReviewTrigger): Promise<void>;
```

Body, in order — the ordering matters and each step is a real failure mode:

1. `if (Platform.OS === 'web') return;` and `if (reviewAskStarted) return;` then set the
   latch **before the first `await`**. Same reasoning as the comment at
   `notification-permission.ts:47-54`: the AsyncStorage read is async, so two triggers
   racing in one launch would both read "eligible" and both fire.
2. `if (!(await StoreReview.isAvailableAsync())) return;` — **gate on
   `isAvailableAsync()`, not `hasAction()`**. `hasAction()` factors in the store URLs
   from app config, and `app.json` currently has no `ios.appStoreUrl` (§4 adds it, but
   the prompt must not depend on that).
3. Read + parse the record from AsyncStorage; `canAskForReview(record, Date.now())`
   or return.
4. Write the incremented record **before** calling `requestReview()`. If the app is
   killed mid-flow, over-counting an ask is a far cheaper mistake than double-asking.
5. `await StoreReview.requestReview().catch(() => {})` — never let this throw into
   gameplay, same posture as `track()`.
6. `track(EVENTS.REVIEW_PROMPT_REQUESTED, { trigger, ask_number })`.

**Hard blockers.** All five shipped:

| Blocker | Where |
|---|---|
| Never on a bankruptcy game-over | T1's `reason !== 'bankruptcy'` |
| Never while insolvent (the HQ banner is up) | `deriveWeeklyStats(state).insolvent` on T2 and T3 |
| Never after a `PURCHASE_FAILED` this launch | `notePurchaseFailed()`, called from `buy-weeks-sheet.tsx` and `game-over.tsx`; checked in `requestReviewOnce` |
| Never when the notification ask was spent **today** | T3's `notificationAskSettled` clause |
| Never while `pendingEvent` is set | T2's guard; T1 and T3 fire from screens where no card can be up |

---

## 3. Analytics

Add to `src/analytics/events.ts` (keep the doc-comment style the file already uses —
every event there carries one explaining what the props are *for*):

```ts
/** The native review sheet was requested — `{ trigger, ask_number }`. Whether it
 *  actually appeared is unknowable: iOS gives no callback and throttles silently. */
REVIEW_PROMPT_REQUESTED: 'review_prompt_requested',
/** A trigger fired but the gate declined — `{ trigger, reason }`. This is the only
 *  way to tell "the gate is too tight" apart from "nobody reaches these moments". */
REVIEW_PROMPT_SUPPRESSED: 'review_prompt_suppressed',
/** The Settings "Rate this game" row was tapped — opens the store listing, not the
 *  native sheet. */
REVIEW_LINK_OPENED: 'review_link_opened',
```

`REVIEW_PROMPT_SUPPRESSED` earns its place: with no outcome callback, a silent gate
would be indistinguishable from a broken one. `reason` should be a small union —
`'cap_reached' | 'cooldown' | 'unavailable' | 'notification_ask_same_day' | 'modal_busy'`.

**Emit it at most once per session per reason.** Once an install hits `cap_reached`, T2
would otherwise fire this event on every Series A/B raise for the rest of that install's
life — the diagnostic value is in the first few, not the hundredth, and the volume would
swamp the trigger breakdown you're actually reading.

**How you'll actually measure this:** `review_prompt_requested` count in PostHog,
broken down by `trigger`, against the **ratings count in App Store Connect** over the
same window. That's the whole instrument. Nothing else will tell you.

---

## 4. Settings row + `app.json`

`StoreReview.storeUrl()` reads `ios.appStoreUrl` from app config, and `app.json`
currently has **no such key** — so this needs adding, with the real App Store ID:

```json
"ios": {
  "bundleIdentifier": "com.ronkaa.startuptycoon",
  "appStoreUrl": "https://apps.apple.com/app/id<APP_STORE_ID>"
}
```

> **You need to fill in `<APP_STORE_ID>`** from App Store Connect — it isn't anywhere
> in the repo.

Then add a "Rate this game" row to `src/app/(game)/settings.tsx`, in the **About**
section next to `Version` (line 186-193), styled like the existing `Pressable` +
`ThemedView type="backgroundElement"` rows. It calls `Linking.openURL(StoreReview.storeUrl())`
— **not** `requestReview()` — and tracks `REVIEW_LINK_OPENED`. Render it only when
`storeUrl()` is non-null.

This row matters more than it looks: it's the only rating path that works in TestFlight,
and the only one the player can choose for themselves.

---

## 5. Testing — and the trap

Same shape as the `notification-permission-testing-trap` memory. Write it into the
plan so the next person doesn't lose an afternoon:

- **`isAvailableAsync()` is `false` in TestFlight.** A TestFlight build cannot verify
  this feature. Nothing is broken; the API is telling the truth.
- **There is no callback.** A "successful" call looks identical to a throttled no-op.
- The iOS **simulator** on a dev build does display the sheet, which is enough to
  verify placement, timing, and that no modal collision hangs the screen.

Add a `__DEV__` debug action, following the pattern in `settings.tsx:98-154`
(triple-tap Version → Alert with dev actions):

- `Force review prompt` — calls `requestReviewOnce('run_ended_best')` bypassing the cap.
- `Reset review gate` — clears `REVIEW_ASK_KEY`, so the flow can be re-run.

Manual passes to run on a dev build, in order:

1. T1: force a non-bankrupt exit that sets a personal best (`Force bankruptcy` won't do
   — it's a bankruptcy; use free play to reach an exit). Sheet appears ~1.2s after the
   game-over screen settles, and dismissing it leaves the screen responsive.
2. T2: raise a Series A. Sheet appears, and does **not** appear if a decision card is
   pending in the same beat.
3. T3, the collision case: on a fresh install, hit the daily wall → the **notification**
   dialog appears and the review sheet does **not**. Relaunch the next day with streak
   ≥ 3 → the review sheet appears.
4. Cap: reset the gate, ask twice, confirm the third trigger logs
   `review_prompt_suppressed` with `reason: 'cap_reached'`.

---

## 6. Build & release

`expo-store-review` is a native module:

```sh
npx expo install expo-store-review
```

It has no config plugin, but it does add native code — **this cannot ship via
`eas update`**. It needs a new production build and a submission.

**One open decision — the runtime version.** `runtimeVersion.policy` is `appVersion` and
`version` is still `1.0.1`, so the new native build and the shipped production build
would share a runtime: an `eas update` would reach both. The lazy import (deviation 2)
makes that survivable — old installs report "review unavailable" instead of crashing —
but bumping `version` would give the new binary its own runtime so old installs never
see this JS at all. Both are defensible; pick deliberately rather than by default.

Per `AGENTS.md`: **do not run `eas build` or `eas submit` without confirming first.**
The gate, the events, the tests, and the Settings row can all be written and reviewed
before any build credit is spent. Batch this into the next production build you were
going to cut anyway rather than burning one on it alone.

---

## Step order

1. ✅ `npx expo install expo-store-review`; `ios.appStoreUrl` →
   `https://apps.apple.com/app/id6787488376` in `app.json`.
2. ✅ `src/state/review-ask.ts` (pure) + `src/state/__tests__/review-ask.test.ts` (17 tests).
3. ✅ `src/state/store-review/` (impure, platform-split — see deviations above).
4. ✅ Three events in `src/analytics/events.ts`.
5. ✅ T1 in `game-over.tsx` (armed 1200ms, `clearTimeout` on unmount).
6. ✅ T2 in `game-store.tsx` (`armFundingRoundReviewAsk`, matched by round name).
7. ✅ T3 in `game-chrome.tsx` (`maybeAskForReviewAtWall`) +
   `notificationAskSpentOnDateKey()` in `notification-permission.ts`.
8. ✅ Settings "Rate this game" row + `Force review prompt` / `Reset review gate` in the
   triple-tap debug menu.
9. ⬜ Manual passes on a dev build (§5) — **outstanding**.
10. ⬜ **Confirm with the user**, then fold into the next production build.

## STOP conditions

- **Stop if the App Store ID can't be found** — do step 1's `app.json` edit last rather
  than guessing a URL. Everything else proceeds without it.
- **Stop before any `eas build` / `eas submit` / `eas update`.**
- **Stop if T3's "previous day" check can't be made cleanly** — shipping T1 and T2
  alone is fine and loses little. Do not ship a T3 that can race the notification dialog.
