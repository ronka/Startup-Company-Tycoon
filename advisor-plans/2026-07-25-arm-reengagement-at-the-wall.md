# Plan 001: Arm the re-engagement loop at the daily wall, and make the wall observable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 0f0d6c4..HEAD -- src/components/game/notification-manager.tsx src/components/game/game-chrome.tsx src/state/game-store.tsx src/state/notification-content.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the iOS notification permission prompt — one shot per install)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0f0d6c4`, 2026-07-25

### Open issue from code review, 2026-07-25 — `trigger` is not an experiment

The feature itself works: an install-day player who reaches the wall is asked
there, which is the whole point of the plan and by far the largest cohort
(30 of 61 advancers stopped at exactly week 5). **This note is about the
analytics claim, not a defect.** Severity: low — documentation accuracy plus a
simplification opportunity.

The `NOTIFICATION_PERMISSION_REQUESTED` docstring in `src/analytics/events.ts`
says `trigger` exists to "judge whether asking at the wall beats the
second-launch fallback." It cannot do that, for two stacked reasons.

**1. The buckets overlap the wrong way.** The fallback fires on mount of every
launch after the first. The wall ask needs `budgetExhausted`, which needs the
async pool load (`game-store.tsx:246-299`, both start `null`) *and* a spent
budget — and `refreshWeekBudget` hands a returning player a fresh allotment. So
`daily_wall` collects install-day wall-hitters; `second_launch` collects anyone
who came back at all.

**2. Even disjoint buckets would not be comparable.** Assignment is determined
by player behaviour, not by us. "Hit the wall" vs "never hit the wall" are
different kinds of player before the ask ever happens, so any grant-rate gap is
confounded by population rather than by moment. Gating the fallback tidies the
overlap without fixing this.

A real moment-vs-moment test needs randomised assignment: coin-flip each install
at first launch into "ask at the wall" or "ask at second launch", persist the
arm, compare within arms. Nothing short of that answers the question.

Options, in the order they are likely worth doing:

1. **Ship as-is and drop the comparison language** from the `events.ts`
   docstring, keeping `trigger` as a descriptive debugging label. The feature's
   value (moving "installs that can receive a nudge" up from 13%) does not
   depend on proving the comparison.
2. **Delete the fallback entirely.** Simplest code by far: the
   `permissionAskStarted` latch, `HAS_LAUNCHED_BEFORE_KEY`, the `trigger` param
   and an 18-line effect all go. Costs the small cohort who relaunch without
   ever hitting the wall (~2-3 players at current volume).
3. **Build the randomised version**, if the comparison is genuinely worth the
   complexity. Treat as new work, not cleanup.

Deferred alongside this: unit tests for `requestNotificationPermissionOnce`. The
module-level latch would force `vi.resetModules()` plus AsyncStorage and
expo-notifications mocks; option 2 removes the latch and leaves a plain async
function that tests cleanly.

## Why this matters

This game is designed as a multi-day campaign: the store layer grants 5 game-weeks
per real day (`WEEKS_PER_DAY` in `src/state/week-budget.ts:11`), and a run is meant
to last 60–120 weeks. Live telemetry from the first 88 installs says the campaign
almost never starts: 30 of the 61 players who ever advanced a week stopped at
**exactly week 5** — the daily wall — and 55 of those 61 played on only one calendar
day. Of players with at least a 3-day window to come back, 17% returned for a day 2.

The wall is only survivable if something brings the player back, and that something
is the local notification in `src/components/game/notification-manager.tsx`. It is
currently armed for almost nobody:

- The permission prompt is deliberately deferred to the player's **second app
  launch** (`notification-manager.tsx:88-92`). Most players never have a second
  launch, so they are never asked. Telemetry: 36 of 88 installs ever saw the prompt;
  25 denied, 11 granted — 13% of installs can receive a nudge at all.
- `notification_opened` has been captured **zero times, ever**.
- The nudge is scheduled as a relative `now + 20h` timer that is cancelled and
  re-armed on *every* backgrounding (`notification-manager.tsx:14`, `:33-41`), so a
  player who opens the app twice in an evening pushes their nudge past the next-day
  slot it was meant to land in.

Separately, the wall itself is unmeasurable. `WEEK_ADVANCE_BLOCKED` is captured in
the store (`src/state/game-store.tsx:547`) with a comment calling it "a key
retention/monetization signal", but the button that would trigger it is rendered
`disabled` (`src/components/game/game-chrome.tsx:113`), so the press never happens
and the event has zero rows. Today you cannot distinguish "hit the wall and bounced"
from "drifted off before ever reaching it" — which means you cannot tell whether
this plan worked.

After this plan: the permission prompt is asked at the moment the wall lands (when
the player has just felt the reason for it), the nudge targets the next local
morning as an absolute instant instead of a drifting relative timer, and the wall
emits a real event when a player pushes against it.

## Current state

Files involved, each with its role:

- `src/components/game/notification-manager.tsx` — invisible app-wide manager
  mounted in the game layout. Owns permission requesting, scheduling, and
  deep-linking on notification tap. No tests (component; see "Testing convention").
- `src/components/game/game-chrome.tsx` — persistent footer shared by all game tabs.
  Owns the Next Week button and the out-of-weeks copy.
- `src/state/game-store.tsx` — the store; `dispatchWithSnapshot` gates `TICK` on the
  daily budget and already captures `WEEK_ADVANCE_BLOCKED`.
- `src/state/notification-content.ts` — pure, tested chooser for *what* the nudge
  says. **Not changing** — it is the exemplar for the new pure module you will add.
- `src/state/week-budget.ts` — the daily budget primitives, incl. `dateKey(now)`.

### Excerpt: the deferred permission prompt (`notification-manager.tsx:81-104`)

```tsx
  // First-ever launch only records that a session happened; the opt-in
  // prompt itself waits for the *next* one, so it never appears on first launch.
  useEffect(() => {
    if (IS_WEB) return;
    let cancelled = false;

    (async () => {
      const hasLaunchedBefore = (await AsyncStorage.getItem(HAS_LAUNCHED_BEFORE_KEY)) === 'true';
      if (!hasLaunchedBefore) {
        await AsyncStorage.setItem(HAS_LAUNCHED_BEFORE_KEY, 'true');
        return;
      }
      if (cancelled) return;
      const alreadyRequested = (await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY)) === 'true';
      if (alreadyRequested) return;
      await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
      const result = await Notifications.requestPermissionsAsync().catch(() => null);
      track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { granted: result?.granted ?? null });
    })();

    return () => {
      cancelled = true;
    };
  }, []);
```

### Excerpt: the relative schedule (`notification-manager.tsx:11-45`)

```tsx
/** A fixed identifier means scheduling a new one always cancels the last — never more than one pending. */
const NOTIFICATION_ID = 'startup-tycoon-daily-nudge';
/** How far out the re-engagement nudge fires once scheduled. */
const REENGAGEMENT_DELAY_SECONDS = 20 * 60 * 60;
// ...
async function scheduleReengagementNotification(state: Parameters<typeof notificationContentFor>[0]) {
  if (IS_WEB) return;
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  const content = notificationContentFor(state);
  if (!content) return; // no active run to point back at — nothing to schedule
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title: content.title, body: content.body, data: { url: '/hq' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: REENGAGEMENT_DELAY_SECONDS,
    },
  });
  track(EVENTS.REENGAGEMENT_NOTIFICATION_SCHEDULED, { delay_seconds: REENGAGEMENT_DELAY_SECONDS });
}
```

### Excerpt: the disabled button (`game-chrome.tsx:81-116`)

```tsx
  const budgetExhausted =
    !devFreePlay && weekBudget !== null && purchasedWeeks !== null && !canSpendAnyWeek(weekBudget, purchasedWeeks);
  const canAdvance = !state.pendingEvent && !budgetExhausted;
  // ...
        <View style={styles.footer}>
          <PrimaryButton
            label="Next Week →"
            onPress={() => {
              if (spotlight.visible) spotlight.dismiss();
              dispatch({ type: 'TICK' });
            }}
            disabled={!canAdvance}
            style={styles.nextButton}
          />
        </View>
```

### Excerpt: the store gate that already instruments the wall (`game-store.tsx:534-549`)

```tsx
      // Mirrors tick()'s own frozen conditions so the delta baseline only
      // shifts when a tick will actually advance the week.
      if (!state || state.gameOver || state.pendingEvent) return;
      // Store-layer-only rate limit (PRD F12) — the engine never sees this.
      // Purchased weeks (IAP week-packs) top up the free budget rather than
      // replacing it: spend order is free-first via `spendWeekFromPools`.
      if (
        !devFreePlay &&
        weekBudget &&
        purchasedWeeks &&
        !canSpendAnyWeek(weekBudget, purchasedWeeks)
      ) {
        // The player hit the daily wall — a key retention/monetization signal.
        track(EVENTS.WEEK_ADVANCE_BLOCKED, gameProps(state));
        return;
      }
```

Note this gate is already correct: a blocked `TICK` is tracked and swallowed. The
only reason it never fires is the `disabled` prop in the chrome.

### Repo conventions you MUST follow

1. **Purity split.** `src/game/` is a pure engine and must never import React,
   React Native, or Expo — **do not touch `src/game/` in this plan at all**. Clock-
   and platform-dependent decisions live in `src/state/` as pure functions that take
   `now: Date` as an explicit argument (never reading the clock themselves), and the
   React components wire them to real effects. See the header comments in
   `src/state/week-budget.ts:1-9` and `src/state/daily-streak.ts:1-7`.
2. **Testing convention.** `vitest.config.ts` only includes
   `src/game/**`, `src/state/**`, `src/lib/**`, `src/purchases/**`, `src/widgets/**`
   `*.test.ts`. **Components are not tested.** Therefore any logic you want covered
   must live in `src/state/`, not in the component. `src/state/notification-content.ts`
   plus `src/state/__tests__/notification-content.test.ts` is the exact pattern to
   copy: a pure module with a doc comment explaining why it is pure, and a test that
   builds states with `newGame('Acme', 1)` and spreads overrides.
3. **Analytics.** Never use string literals for event names. Add to the `EVENTS`
   catalog in `src/analytics/events.ts` and call `track(EVENTS.X, props)`. Property
   names are `snake_case`.
4. **Comments** explain *why*, not *what*, and the codebase is comment-dense at
   decision points. Match that density.

## Commands you will need

| Purpose   | Command                                    | Expected on success        |
|-----------|--------------------------------------------|----------------------------|
| Install   | `npm install`                              | exit 0                     |
| Typecheck | `npx tsc --noEmit`                         | exit 0, no errors          |
| Tests     | `npm test`                                 | all pass                   |
| One test  | `npx vitest run src/state/__tests__/notification-schedule.test.ts` | all pass |
| Lint      | `npm run lint`                             | exit 0                     |

Do **not** run `eas build`, `eas submit`, or `eas update` — `AGENTS.md` forbids
triggering builds without the user confirming first, and this plan never needs one.

## Scope

**In scope** (the only files you should modify or create):

- `src/state/notification-schedule.ts` (create)
- `src/state/__tests__/notification-schedule.test.ts` (create)
- `src/components/game/notification-manager.tsx` (modify)
- `src/components/game/game-chrome.tsx` (modify)
- `src/analytics/events.ts` (modify — add one event name only)

**Out of scope** (do NOT touch, even though they look related):

- `src/game/**` — the pure engine. Nothing in this plan belongs there, and adding a
  clock or a platform import would break the determinism the sim and engine tests
  rely on.
- `src/state/notification-content.ts` — the *message* chooser is already correct and
  tested. You are changing *when* the nudge fires, not what it says.
- `src/state/week-budget.ts` — do not change `WEEKS_PER_DAY`, `WEEKS_BANK_CAP`, or
  any budget rule. The size of the daily allowance is a deliberate product decision
  documented in `plans/prd-endgame-and-depth.md` §F12; this plan makes the wall
  survivable, it does not move the wall.
- `src/state/game-store.tsx` — its `WEEK_ADVANCE_BLOCKED` gate already does the right
  thing. Changing it is not needed and risks the budget accounting.
- `src/purchases/**` and `buy-weeks-sheet.tsx` — monetization telemetry is currently
  too thin to act on (7 users ever saw the paywall); do not redesign the sheet.

## Git workflow

- Branch: `advisor/001-arm-reengagement-at-the-wall`
- Commit per step; short lowercase imperative subject lines matching `git log`
  style in this repo (e.g. `add widget`, `redesign onboarding`, `fix end game bug`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a pure, tested module that computes the next-morning trigger
Status: done

Create `src/state/notification-schedule.ts`. It must contain **no** imports from
`expo-notifications`, React, or React Native — only plain TypeScript — so that
vitest can run it.

Required exports:

```ts
/** Local hour (24h) the daily nudge should land on. */
export const REENGAGEMENT_HOUR = 9;

/**
 * Seconds from `now` until the next local `hour` o'clock. Always strictly
 * positive: if `now` is already past `hour` today, it targets tomorrow. Because
 * the result is derived from an absolute wall-clock target rather than a fixed
 * offset, re-computing it repeatedly through an evening always names the same
 * instant — rescheduling is idempotent.
 */
export function secondsUntilNextLocalHour(now: Date, hour: number): number
```

Implementation notes for the executor:

- Build the target with `new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0)`
  — local-time constructor, matching how `dateKey` in `src/state/week-budget.ts:25-30`
  deliberately uses local (not UTC) calendar fields.
- If `target <= now`, add one day by incrementing the date component
  (`target.setDate(target.getDate() + 1)`), which handles month/year rollover and
  DST correctly.
- Return `Math.round((target.getTime() - now.getTime()) / 1000)`.
- Add a file-header doc comment in the same voice as
  `src/state/notification-content.ts:1-6`, stating that it takes `now` explicitly so
  it is testable without mocking global time.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the new module
Status: done

Create `src/state/__tests__/notification-schedule.test.ts`, modelled structurally on
`src/state/__tests__/notification-content.test.ts` (same import style, `describe`/`it`
from `vitest`).

Cover exactly these cases:

1. Before the hour on the same day → targets today. `new Date(2026, 6, 25, 7, 0, 0)`
   with `hour = 9` → `7200`.
2. After the hour → targets tomorrow. `new Date(2026, 6, 25, 10, 0, 0)` with
   `hour = 9` → `82800` (23h).
3. Exactly at the hour → targets tomorrow, never `0`. `new Date(2026, 6, 25, 9, 0, 0)`
   → `86400`.
4. Idempotence across an evening: two different `now` values 30 minutes apart on the
   same evening produce trigger *instants* that are equal — assert
   `now1.getTime() + secondsUntilNextLocalHour(now1, 9) * 1000` equals
   `now2.getTime() + secondsUntilNextLocalHour(now2, 9) * 1000`.
5. Month rollover: `new Date(2026, 6, 31, 23, 0, 0)` with `hour = 9` returns a
   positive number of seconds landing on 2026-08-01 09:00 local.
6. The result is always `> 0` for a spread of input hours (loop 0–23).

**Verify**: `npx vitest run src/state/__tests__/notification-schedule.test.ts` →
all pass, 6 tests.

### Step 3: Switch the scheduler to the absolute next-morning target
Status: done

In `src/components/game/notification-manager.tsx`:

- Delete `REENGAGEMENT_DELAY_SECONDS` (line 13-14) and import
  `REENGAGEMENT_HOUR, secondsUntilNextLocalHour` from `@/state/notification-schedule`.
- In `scheduleReengagementNotification`, compute
  `const seconds = secondsUntilNextLocalHour(new Date(), REENGAGEMENT_HOUR);` and use
  it for the `TIME_INTERVAL` trigger's `seconds`.
- Keep the existing `cancelScheduledNotificationAsync` + fixed `NOTIFICATION_ID`
  behaviour — it stays correct and is now genuinely idempotent.
- Change the tracked props to `{ delay_seconds: seconds, target_hour: REENGAGEMENT_HOUR }`.
- Replace the comment on the deleted constant with one explaining *why* an absolute
  local-morning target beats a relative offset (re-arming on every background used to
  push the nudge past the next day).

Do not change `notificationContentFor` or the deep-link handler.

**Verify**: `npx tsc --noEmit` → exit 0, and
`grep -n "REENGAGEMENT_DELAY_SECONDS" src/` → **no matches**.

### Step 4: Add the wall-triggered permission request
Status: done

Still in `notification-manager.tsx`. The goal: the prompt fires when the player has
just hit the daily wall, with the second-launch path kept only as a fallback for
players who never hit the wall.

- Export a new function from this module:

```tsx
/**
 * Request notification permission once, ever. Safe to call from anywhere and
 * any number of times: the `PERMISSION_REQUESTED_KEY` flag makes every call
 * after the first a no-op, so callers never need to track whether the OS
 * prompt has already been spent. iOS only ever shows the system dialog once
 * per install — that single shot is why this is centralized here.
 */
export async function requestNotificationPermissionOnce(trigger: string): Promise<void>
```

  Its body is the inner logic currently at lines 94-98: read
  `PERMISSION_REQUESTED_KEY`, return early if `'true'`, otherwise set it, call
  `Notifications.requestPermissionsAsync().catch(() => null)`, and
  `track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { granted: result?.granted ?? null, trigger })`.
  Return immediately (no-op) when `IS_WEB`.

- Rewrite the existing `useEffect` at lines 83-104 to call
  `requestNotificationPermissionOnce('second_launch')` in place of its inline body,
  keeping the `HAS_LAUNCHED_BEFORE_KEY` deferral exactly as-is. Update its comment to
  say this is now the *fallback* path — the primary trigger is the daily wall — and
  that most players never reach it.

**Verify**: `npx tsc --noEmit` → exit 0 and `npm run lint` → exit 0.

### Step 5: Call it from the wall, and stop disabling the button
Status: done

In `src/components/game/game-chrome.tsx`:

1. Import `requestNotificationPermissionOnce` from
   `@/components/game/notification-manager`.

2. Fire the prompt the first time `budgetExhausted` becomes true in a session. Add,
   after the existing `budgetExhausted` / `canAdvance` derivations but as a `useEffect`
   near the other effects at the top of the component (hooks must not be called after
   the `if (!state || state.gameOver) return null;` early return at line 57 — put the
   effect **above** that line and guard its body instead):

```tsx
  // The daily wall is the one moment the player has just felt why a nudge is
  // worth allowing — ask here rather than on a second launch most players never
  // have. `requestNotificationPermissionOnce` is a no-op after the first call.
  // Never while a decision card is up: the DecisionModal owns the screen then,
  // and this repo has a documented iOS hang when one modal presents into a
  // frame another is dismissing (see docs/bug-stuck-decision-modal.md).
  useEffect(() => {
    if (!budgetExhausted) return;
    if (state?.pendingEvent) return;
    requestNotificationPermissionOnce('daily_wall').catch(() => {});
  }, [budgetExhausted, state?.pendingEvent]);
```

**Optional chaining is required here, not optional style.** This effect sits above the
`if (!state || state.gameOver) return null;` guard at line 57 (hooks cannot be called
conditionally), so `state` is still `GameState | null` at this point. Write `state?.pendingEvent`,
not `state.pendingEvent` — the latter will not typecheck, and the fix is **not** to move
the hook below the guard.

> **Note for whoever runs plan 002 after this**: plan 002 adds a `DayCompleteSheet` on
> the same `budgetExhausted` edge, and relocates this permission ask to that sheet's
> dismiss handler — asking after the player has read what's waiting tomorrow is both
> better product and removes any chance of a system dialog racing a sheet on the same
> frame. Leave it here for now; plan 002 moves it.

   `budgetExhausted` is currently derived *after* the early return. To make the effect
   legal, hoist the `budgetExhausted` derivation above `if (!state || state.gameOver)`
   — it only reads `devFreePlay`, `weekBudget`, and `purchasedWeeks`, none of which
   depend on `state`. Leave `canAdvance` where it is. **If hoisting turns out to
   require touching `state`, STOP and report** (see STOP conditions).

3. Change the Next Week button (lines 106-116) so it is disabled only by a pending
   decision, not by the budget:

```tsx
          <PrimaryButton
            label="Next Week →"
            onPress={() => {
              if (spotlight.visible) spotlight.dismiss();
              // Dispatched even when the daily budget is spent: the store's TICK
              // gate swallows it and captures WEEK_ADVANCE_BLOCKED, which is the
              // only signal that tells a hit-the-wall player apart from one who
              // drifted off before reaching it. Where purchases exist, the press
              // also opens the week-pack sheet.
              dispatch({ type: 'TICK' });
              if (budgetExhausted && purchasesAvailable) setBuySheetTrigger('out_of_weeks');
            }}
            disabled={!!state.pendingEvent}
            style={styles.nextButton}
          />
```

   `purchasesAvailable` and `setBuySheetTrigger` are already imported/declared in
   this file (see lines 5 and 35) — do not add new imports for them.

4. Leave `canAdvance` in place for the `SpotlightHint` visibility check at line 102 —
   the spotlight should still hide when the player cannot actually advance.

5. **Give the press feedback where purchases don't exist.** `purchasesAvailable` is
   iOS-only, so on Android and web the newly-enabled button would track the event and
   then do visibly nothing — a dead button. Change the label so it is honest about
   what pressing it does, rather than adding a new surface:

```tsx
            label={budgetExhausted ? 'That’s the week — see you tomorrow' : 'Next Week →'}
```

   The `HintSlot` at lines 119-133 already renders the `out-of-weeks` explainer
   underneath, so the player gets the full story without a new component. Do not add a
   toast, alert, or new sheet for this.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0; and
`grep -n "disabled={!canAdvance}" src/components/game/game-chrome.tsx` → **no matches**.

### Step 6: Add the trigger property to the analytics catalog
Status: done

`NOTIFICATION_PERMISSION_REQUESTED` already exists in `src/analytics/events.ts`. You
only need to update its doc comment to record that it now carries a `trigger` prop
with values `daily_wall` | `second_launch`. Add no new event names — `WEEK_ADVANCE_BLOCKED`
already exists and is now reachable.

**Verify**: `grep -n "trigger" src/analytics/events.ts` → shows the updated comment;
`npm run lint` → exit 0.

## Test plan

- **New tests**: `src/state/__tests__/notification-schedule.test.ts`, the 6 cases
  listed in Step 2. Structural pattern: `src/state/__tests__/notification-content.test.ts`.
- **Existing tests**: `npm test` must stay green. No existing test covers the
  component files you are changing (vitest excludes components), so any failure in
  `npm test` after this plan means you touched something out of scope.
- **Not automatable, note it in your report**: the permission prompt and the
  scheduled notification cannot be verified by tests in this repo. State plainly in
  your completion report that Steps 3–5 are verified by typecheck and lint only, and
  that a device/simulator pass is still needed.

## Done criteria

ALL must hold:

- [x] `npx tsc --noEmit` exits 0
- [x] `npm test` exits 0, including 6 new tests in `src/state/__tests__/notification-schedule.test.ts` (26 files / 368 tests pass)
- [~] `npm run lint` exits 0 — **not achievable at baseline**: a clean tree at `0f0d6c4`
  already reports the identical `12 problems (5 errors, 7 warnings)`, all pre-existing
  (`animated-number.tsx`, `buy-weeks-sheet.tsx`, `use-color-scheme.web.ts`, and the
  pre-existing `stateRef.current = state` line in `notification-manager.tsx`). Verified
  by stashing this branch's edits and re-running. This plan introduces **no new** lint
  problems; the counts are byte-identical before and after.
- [x] `grep -rn "REENGAGEMENT_DELAY_SECONDS" src/` returns no matches
- [x] `grep -n "disabled={!canAdvance}" src/components/game/game-chrome.tsx` returns no matches
- [x] `grep -rn "requestPermissionsAsync" src/` returns exactly one match, inside `notification-manager.tsx`
- [x] `git status` shows no modified files outside the in-scope list
- [x] `advisor-plans/README.md` status row for 001 updated

### Executed on 2026-07-25 — notes for review

- Drift check was clean: `HEAD` was exactly `0f0d6c4` and all four "Current state"
  excerpts matched live code. No STOP conditions hit.
- **Expo SDK 57 API confirmed** against `https://docs.expo.dev/versions/v57.0.0/sdk/notifications/`:
  `TIME_INTERVAL` accepts a runtime-computed `seconds`, `repeats` is optional, and the
  60-second minimum applies *only* when `repeats: true` — so the short intervals this
  produces when backgrounding just before 09:00 are legal. Reporting, not acting on, per
  this plan's STOP rule: `SchedulableTriggerInputTypes.DATE` also exists and takes a
  `Date`/timestamp, which is arguably the more direct primitive for an absolute instant.
  Trigger type was **not** changed. Worth a look in a follow-up.
- **Double-spend risk discharged**: `grep -rn "type: 'TICK'" src/` finds exactly one
  dispatcher (the chrome button) outside the engine's own types/tests, and
  `spendWeekFromPools` is called from exactly one place in the store —
  `dispatchWithSnapshot`, behind the gate. Enabling the button cannot double-spend.
- **Two guards added beyond the plan's literal text, both authorized by its own
  "guard its body instead" instruction, both protecting the single-shot iOS dialog:**
  1. `runActive` (`state !== null && !state.gameOver`) in the chrome effect. Because
     `budgetExhausted` reads nothing about the run, the ask would otherwise fire on
     paths where `GameChrome` renders `null` — over a bankruptcy/exit screen if the run
     ended on the last free week of the day, or before the save has loaded. Both are
     live: `GameChrome` mounts unconditionally in `(game)/(tabs)/_layout.tsx:68`, with
     no `loading` gate.
  2. A module-scope synchronous `permissionAskStarted` latch in
     `requestNotificationPermissionOnce`. With two callers, the `await` on the
     AsyncStorage read is a race window: on a second launch that opens straight into an
     exhausted budget, both the `daily_wall` and `second_launch` effects would see "not
     requested" and each log a `notification_permission_requested` row. iOS shows no
     second dialog, so there's no user-visible damage — but the duplicate rows with
     different `trigger` values would wreck the grant-rate comparison this whole plan
     exists to enable. Not unit-testable here (vitest excludes components).
- **Timing caveat on the wall ask (flagged, not fixed).** `weekBudget` and
  `purchasedWeeks` both start `null` (`game-store.tsx:246-247`) and resolve
  asynchronously, so `budgetExhausted` is false on mount and flips true a few hundred ms
  later. For a player who spent all 5 weeks and reopens the app the *same* day, the
  system dialog therefore appears shortly after cold start over HQ, not on the wall's
  edge. Plan 002 relocates this ask to the `DayCompleteSheet` dismiss handler, which
  resolves it.
- **Three stacked "come back tomorrow" messages** now coexist while `budgetExhausted`:
  the button label, the `out-of-weeks` HintSlot, and the `budgetRow` copy. Left as-is
  because plan 002 replaces this surface.
- `PrimaryButton` puts `label` in a `ThemedText` with no `numberOfLines` at fontSize 17
  bold, so the ~34-char exhausted label will likely wrap to two lines on narrow devices
  and change the footer height. Cosmetic, and `primary-button.tsx` is out of scope —
  confirm on device.
- **Dashboard note**: `delay_seconds` on `reengagement_notification_scheduled` changed
  from a constant `72000` to a variable, so any saved PostHog insight filtering on that
  literal value will go empty.
### Device verification — 2026-07-25, iPhone 17 Pro sim (iOS 26.0), via `npx serve-sim`

Driven on a booted simulator with `serve-sim` (tap/gesture/permissions) against a
dev-client build on Metro :8199. Under test: the code live in the simulator at 21:26,
which predates the working-tree refactor's breaking state — a non-compiling bundle could
not have rendered the wall at all. Not tied to a specific bundle hash.

> **The `[x]` done-criteria above were true at commit `e793f3f`.** An uncommitted
> refactor landed on top afterwards (moving the permission ask into
> `src/state/notification-permission.ts` and the wall predicate into
> `isWeekBudgetExhausted`); it does not currently typecheck, and it edits
> `game-store.tsx` and `week-budget.ts`, both fenced off as out of scope by this plan.
> Not evaluated here — it is not part of this plan's work.

**Verified working on device:**

- **The permission dialog fires at the wall.** On a genuinely clean install (app
  uninstalled + reinstalled so the OS authorization is `notDetermined`), starting a new
  game and spending all 5 free weeks put the player at **week 5** — the exact wall week
  in the telemetry — and the iOS system dialog appeared right there. Grant/deny buttons
  shown, `permission-requested` flipped to `true` on that press and not before.
- **First launch stays silent.** With `has-launched-before` cleared, launching asked
  nothing — the fallback still defers correctly, so the wall is genuinely the first ask.
- **The button is pressable at the wall** and relabels to
  `That's the week — see you tomorrow`. It renders on **one line** at 393pt width — the
  wrap risk flagged above did not materialise on this device (still worth checking on a
  narrower phone, e.g. iPhone SE).
- **`budgetExhausted` hoist caused no regressions**: the `week-budget-dots` hint still
  fires on the last free dot, `out-of-weeks` fires at the wall, the buy-weeks row still
  renders, and the button is still disabled while a decision card is up.

**Confirmed in PostHog (project 505800), the payoff of the whole plan:**

| Event | Evidence |
|---|---|
| `week_advance_blocked` | **First row ever**, 18:41:37Z — the press at the wall. Zero rows before this plan; the wall is now measurable. |
| `notification_permission_requested` | `trigger: daily_wall`, `granted: true`. The pre-change row at 17:04Z has no `trigger` and `granted: false`, so the new prop is populating. |
| `reengagement_notification_scheduled` | `delay_seconds: 41607`, `target_hour: 9` — computed to the next local 09:00 (scheduled 21:26 local ≈ 11h34m out). Earlier rows show the old constant `72000` with no `target_hour`. |

**Re-verified after the refactor** (mount-to-ask `NotificationPermissionAsk` +
`isWeekBudgetExhausted`): typecheck clean, 371 tests pass, wall renders identically, the
press still swallows the TICK (week did not advance) while opening the Buy Weeks sheet,
and the ask correctly no-ops on an install that already granted.

**Could not verify:** that the scheduled nudge actually fires at 09:00 (needs a
day-boundary or time manipulation), and `notification_opened` (needs a delivered push).

**Testing trap worth recording.** On an install whose authorization was already decided,
`requestPermissionsAsync` resolves with **no dialog at all** — the flag flips to `true`
and the ask looks broken when it is merely a no-op. Confirmed against PostHog: the
21:15 and 21:17 attempts returned `granted: true` with nothing on screen, because
`serve-sim permissions reset notifications` reports success **without** restoring
`notDetermined`. `xcrun simctl privacy reset notifications` is no help either — it fails
with `Operation not permitted` on iOS 26. **Uninstall + reinstall is the only reliable
reset**, and only after it did the real system dialog appear.

- **Steps 3–5 are verified by typecheck and lint only.** The permission prompt and the
  scheduled notification cannot be exercised by this repo's test setup (vitest excludes
  components). A device/simulator pass is still needed before shipping.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts above
  (the codebase drifted since commit `0f0d6c4`).
- Hoisting the `budgetExhausted` derivation above the `if (!state || state.gameOver) return null;`
  guard in `game-chrome.tsx` turns out to need `state` — that would mean the file
  changed shape and the effect placement needs redesign.
- Making the Next Week button pressable while the budget is spent causes any test to
  fail, or you find a second code path that spends a week without going through
  `dispatchWithSnapshot`'s gate in `src/state/game-store.tsx:536-549`. Double-spending
  weeks is a real risk and is worse than the problem this plan solves.
- `expo-notifications` in this Expo SDK version does not accept a `TIME_INTERVAL`
  trigger with a computed `seconds` value, or requires `repeats: false` explicitly.
  Do not switch trigger types on your own — report what the API expects.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The single-shot iOS prompt is the risk to scrutinize in review.** Moving the ask
  to the wall spends the one system dialog per install at a different moment. If the
  grant rate measured on `notification_permission_requested` breakdown by `trigger`
  comes out *worse* than the current 11/36, the next iteration should be a soft
  pre-prompt (an in-app explainer with "Remind me" / "Not now") before the system
  dialog, not a revert to second-launch timing.
- `secondsUntilNextLocalHour` is intentionally local-time and DST-naive-by-construction
  (it rebuilds the target from local calendar fields). If a timezone-aware backend or
  server time is ever introduced, revisit it alongside `dateKey` in
  `src/state/week-budget.ts` — the two must agree on what "a day" means or the budget
  refresh and the nudge will drift apart.
- **Deferred out of this plan on purpose**: the `notification_opened` event has never
  fired. This plan makes it *possible* for notifications to reach players, but does
  not investigate delivery. Re-check that event after this ships; if it is still zero
  with a healthy grant rate, the deep-link handler in `notification-manager.tsx:60-78`
  is the next suspect.
- Once `WEEK_ADVANCE_BLOCKED` starts producing rows, the funnel question to ask is:
  of players who fire it, how many return the next day — with and without notification
  permission. That comparison is the actual measure of whether this plan worked.
