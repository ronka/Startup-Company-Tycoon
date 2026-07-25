# Plan 002: Close the day with a "tomorrow's agenda" panel instead of a stop sign

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 0f0d6c4..HEAD -- src/components/game/game-chrome.tsx src/state/notification-content.ts src/game/types.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive UI + one new pure module; no engine or budget changes)
- **Depends on**: `advisor-plans/2026-07-25-arm-reengagement-at-the-wall.md` (plan 001)
- **Category**: direction
- **Planned at**: commit `0f0d6c4`, 2026-07-25

## Why this matters

The game grants 5 game-weeks per real day (`WEEKS_PER_DAY` in
`src/state/week-budget.ts:11`) and expects a run to play out as a multi-day campaign.
Telemetry from the first 88 installs says day 2 rarely happens: 30 of the 61 players
who ever advanced a week stopped at exactly week 5, 55 of 61 played on a single
calendar day, and the median first-day engagement span was 3 minutes against a
designed 5–10. The players who *do* cross the wall go deep — their furthest weeks are
10, 14, 15, 16, 24, 45, 50, 52 — so the content past the gate is working. The gate is
what fails.

Right now the day ends on a well-written full stop: *"That's the week planned out —
the team gets to work. Come back tomorrow."* (`game-chrome.tsx:147-149`). It closes
the session cleanly and leaves nothing dangling. Nothing in the app names a reason to
return, even though the game state usually contains one — a decision card is pending,
runway is about to get scary, a funding round has come off cooldown, or the next event
lands in two weeks.

After this plan, hitting the wall opens a short closing panel that names the run's
score-in-progress and **one concrete thing waiting tomorrow**, derived from real state.
This is the in-app twin of the notification content chooser that already exists, and
it is the moment plan 001 asks for notification permission — the two compose into a
single coherent "end of day" beat.

Design constraint you must respect: `plans/prd-endgame-and-depth.md` §F12 explicitly
forbids the daily limit reading as an F2P energy shakedown — no numeric energy meter,
absence is never punished, and rewards are choices rather than handouts. The panel is
diegetic ("the team gets to work overnight"), never guilt-based, never a countdown
timer, and always dismissible.

## Current state

Files involved:

- `src/components/game/game-chrome.tsx` — persistent footer on every game tab. Owns
  `budgetExhausted`, the out-of-weeks copy, and the existing sheets
  (`WeekInReviewSheet`, `BuyWeeksSheet`, `DecisionModal`).
- `src/state/notification-content.ts` — pure, tested chooser for the re-engagement
  message. **Read it before starting**: its priority ladder is the pattern you are
  extending, and its file-header comment is the voice to match.
- `src/components/game/bottom-sheet.tsx` — the shared sheet primitive used by
  `WeekInReviewSheet` and `BuyWeeksSheet`. Reuse it; do not build a new modal.
- `src/lib/derived-stats.ts` — `deriveWeeklyStats(state)` returns
  `{ burn, revenue, valuation, runway, insolvent, stake }`.
- `src/game/types.ts` — `GameState`, including `pendingEvent`, `weeksUntilNextEvent`,
  `roundsRaised`, `lastRoundRaisedWeek`, `companyName`, `week`.

### Excerpt: the current end-of-day copy (`game-chrome.tsx:135-150`)

```tsx
        <View style={styles.budgetRow}>
          {budgetExhausted ? (
            purchasesAvailable ? (
              <Pressable onPress={() => setBuySheetTrigger('out_of_weeks')} accessibilityRole="button">
                <ThemedText type="small" themeColor="textSecondary" style={styles.budgetCopy}>
                  That&apos;s the week planned out — the team gets to work.{' '}
                  <ThemedText type="smallBold" themeColor="text">
                    Buy more weeks →
                  </ThemedText>
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.budgetCopy}>
                That&apos;s the week planned out — the team gets to work. Come back tomorrow.
              </ThemedText>
            )
          ) : weekBudget ? (
```

This footer copy **stays**. The panel is an additional beat that fires once when the
wall lands; the footer remains as the persistent reminder afterwards.

### Excerpt: the priority ladder to extend (`src/state/notification-content.ts:22-45`)

```ts
export function notificationContentFor(state: GameState | null): NotificationContent | null {
  if (!state || state.gameOver) return null;

  if (state.pendingEvent) {
    return {
      title: `Week ${state.week}: a decision is waiting`,
      body: `${state.pendingEvent.title} needs your call.`,
    };
  }

  const { runway } = deriveWeeklyStats(state);
  if (Number.isFinite(runway) && runway <= LOW_RUNWAY_WARNING_WEEKS) {
    return {
      title: 'Runway warning',
      body: `Runway is down to ${Math.max(0, Math.floor(runway))} weeks.`,
    };
  }

  return {
    title: 'Startup Tycoon',
    body: `Week ${state.week} — come back and check on the team.`,
  };
}
```

### Excerpt: relevant `GameState` fields (`src/game/types.ts`)

```ts
  /** Set when a decision card is drawn; TICK is a no-op until it's answered. */
  pendingEvent: EventCard | null;
  /** Ticks remaining until the next card is drawn (2–4, reset on every draw). */
  weeksUntilNextEvent: number;
  /** How many of the 3 rounds (seed/A/B) have been raised so far. */
  roundsRaised: number;
  /** Week the last round closed; null before any round is raised. Gates the raise cooldown. */
  lastRoundRaisedWeek: number | null;
```

**Important gotcha**: when a deck is exhausted, the engine sets
`weeksUntilNextEvent` to `Number.MAX_SAFE_INTEGER` (`src/game/engine.ts:553`, the
`NO_MORE_EVENTS` sentinel). Any agenda line about an upcoming event must guard
against that value or it will render nonsense.

`canRaiseRound(week, lastRoundRaisedWeek)` is exported from `src/game/balance.ts:656`.
`ROUND_ORDER` (length 3) is exported from `src/game/types.ts`.

### Repo conventions you MUST follow

1. **Purity split.** `src/game/` is a pure engine and must never import React, React
   Native, or Expo — **do not modify anything under `src/game/` in this plan**.
   Importing *from* `@/game/...` into `src/state/` or `src/lib/` is fine and common
   (see `src/state/notification-content.ts:8-9`); the restriction is one-directional.
2. **Testing convention.** `vitest.config.ts` includes only
   `src/game/**`, `src/state/**`, `src/lib/**`, `src/purchases/**`, and
   `src/widgets/**` `*.test.ts` files. **Components are not tested.** All logic you
   want covered must live in `src/state/`. Copy the structure of
   `src/state/__tests__/notification-content.test.ts`: build states with
   `newGame('Acme', 1)` and spread overrides.
3. **Sheets.** Use the existing `BottomSheet` from `@/components/game/bottom-sheet`.
   `src/components/game/week-in-review-sheet.tsx` is the closest structural exemplar
   for a state-derived, dismissible, once-per-beat sheet — read it before writing.
4. **Theming.** Colors come from `useTheme()` (`@/hooks/use-theme`), spacing from
   `Spacing` in `@/constants/theme`, text from `ThemedText` with `type` and
   `themeColor` props. Never hardcode a color or a pixel spacing value.
5. **Analytics.** Add event names to the `EVENTS` catalog in
   `src/analytics/events.ts` and call `track(EVENTS.X, props)` — never a string
   literal. Props are `snake_case`.
6. **Comments** explain *why* at decision points; the codebase is comment-dense.
   Match that density.

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Install   | `npm install`                          | exit 0              |
| Typecheck | `npx tsc --noEmit`                     | exit 0, no errors   |
| Tests     | `npm test`                             | all pass            |
| One test  | `npx vitest run src/state/__tests__/day-close.test.ts` | all pass |
| Lint      | `npm run lint`                         | exit 0              |

Do **not** run `eas build`, `eas submit`, or `eas update` — `AGENTS.md` forbids
triggering builds without the user confirming first, and this plan never needs one.

## Scope

**In scope** (the only files you should modify or create):

- `src/state/day-close.ts` (create)
- `src/state/__tests__/day-close.test.ts` (create)
- `src/components/game/day-complete-sheet.tsx` (create)
- `src/components/game/game-chrome.tsx` (modify — includes one new AsyncStorage key,
  `startup-tycoon/day-complete/last-shown`, authorized in Step 4)
- `src/analytics/events.ts` (modify — add two event names)

**Out of scope** (do NOT touch, even though they look related):

- `src/game/**` — the pure engine. This plan adds a *presentation* of existing state;
  it must not change what the engine computes, or the seeded-determinism guarantees
  that `npm run sim` and the engine tests rely on break.
- `src/state/week-budget.ts` — do not change `WEEKS_PER_DAY`, `WEEKS_BANK_CAP`, or any
  budget rule. The size of the daily allowance is a deliberate product decision
  documented in `plans/prd-endgame-and-depth.md` §F12. This plan changes how the wall
  *feels*, not where it sits.
- `src/state/notification-content.ts` — leave it alone. It is tested and shipping;
  the new module borrows its shape, it does not absorb or replace it.
- `src/components/game/week-in-review-sheet.tsx` — a different beat (per-tick recap).
  Read it as a pattern; do not modify it.
- `src/components/game/buy-weeks-sheet.tsx` and `src/purchases/**` — monetization
  telemetry is currently far too thin to redesign against (7 users have ever seen the
  paywall). The panel may *link* to the existing sheet; it must not restyle it.

## Git workflow

- Branch: `advisor/002-day-one-closing-panel`
- Commit per step; short lowercase imperative subject lines matching this repo's
  `git log` style (e.g. `add widget`, `redesign onboarding`, `improve ui`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the pure "tomorrow's agenda" module

Create `src/state/day-close.ts`. No React, React Native, or Expo imports — plain
TypeScript plus imports from `@/game/*` and `@/lib/*` only, so vitest can run it.

Open with a file-header doc comment in the voice of
`src/state/notification-content.ts:1-6`: state that it is pure and state-derived, that
it is the in-app twin of the notification chooser, and that it deliberately never
reads a clock.

Required exports:

```ts
/** Runway at or below this many weeks is the thing worth naming for tomorrow. */
export const AGENDA_RUNWAY_WEEKS = 4;
/** An event landing this soon is worth teasing; further out is noise. */
export const AGENDA_EVENT_HORIZON_WEEKS = 3;

export interface TomorrowAgenda {
  /** Stable id for analytics — never rendered. */
  kind: 'decision' | 'runway' | 'raise' | 'event-soon' | 'steady';
  /** One short sentence naming what is waiting. Rendered verbatim. */
  line: string;
}

/**
 * The single most relevant thing waiting for the player tomorrow. Priority
 * order mirrors `notificationContentFor`: a decision already on the table beats
 * a runway scare, which beats an available raise, which beats a card landing
 * soon. Null when there is no live run to come back to.
 */
export function tomorrowAgendaFor(state: GameState | null): TomorrowAgenda | null
```

Ladder, in exactly this order:

1. `!state || state.gameOver` → `null`.
2. `state.pendingEvent` → `{ kind: 'decision', line: \`${state.pendingEvent.title} is waiting on your call.\` }`
3. `runway` from `deriveWeeklyStats(state)` is finite and `<= AGENDA_RUNWAY_WEEKS` →
   `{ kind: 'runway', line: \`Runway is down to ${Math.max(0, Math.floor(runway))} weeks — you'll need a plan.\` }`
4. Rounds remain and the cooldown has cleared —
   `state.roundsRaised < ROUND_ORDER.length && canRaiseRound(state.week, state.lastRoundRaisedWeek)` →
   `{ kind: 'raise', line: 'You're clear to raise — the terms are waiting on the Money tab.' }`
5. An event lands soon — `state.weeksUntilNextEvent <= AGENDA_EVENT_HORIZON_WEEKS`
   **and** `state.weeksUntilNextEvent > 0` **and**
   `Number.isSafeInteger(state.weeksUntilNextEvent)` and the value is not the
   deck-exhausted sentinel (guard with a plain `< 1000` bound as well, since
   `Number.MAX_SAFE_INTEGER` is itself a safe integer) →
   `{ kind: 'event-soon', line: \`Something lands on the calendar within ${n} week(s).\` }`
   (singularize correctly when `n === 1`).
6. Fallback → `{ kind: 'steady', line: \`${state.companyName} keeps building overnight — check in tomorrow.\` }`

Import `canRaiseRound` from `@/game/balance`, `ROUND_ORDER` and `GameState` from
`@/game/types`, `deriveWeeklyStats` from `@/lib/derived-stats`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the agenda ladder

Create `src/state/__tests__/day-close.test.ts`, modelled structurally on
`src/state/__tests__/notification-content.test.ts`.

Cover exactly these cases:

1. `tomorrowAgendaFor(null)` → `null`.
2. A state with `gameOver: 'bankruptcy'` → `null`.
3. A pending decision outranks everything: build a state with a `pendingEvent` **and**
   near-zero cash (which would otherwise hit the runway branch) → `kind === 'decision'`
   and `line` contains the card title. Copy the `pendingEvent` object shape from
   `notification-content.test.ts`'s third test.
4. Low runway when nothing is pending → `kind === 'runway'` and the line contains the
   week count. Build it the way `notification-content.test.ts` does (small `cash`,
   high burn from a large `headcount`).
5. Raise available, healthy runway, no pending event → `kind === 'raise'`.
6. Raise on cooldown (`lastRoundRaisedWeek` set to `state.week`), healthy runway,
   `weeksUntilNextEvent: 2` → `kind === 'event-soon'` and the line says "1 week" vs
   "2 weeks" correctly (add a second assertion with `weeksUntilNextEvent: 1`).
7. **The sentinel guard**: `weeksUntilNextEvent: Number.MAX_SAFE_INTEGER` with all
   three rounds raised and healthy runway → `kind === 'steady'`, and the line contains
   the company name. This is the regression test for the deck-exhausted case.
8. Every branch returns a non-empty `line` (assert `line.length > 0` across the cases).

**Verify**: `npx vitest run src/state/__tests__/day-close.test.ts` → all pass, 8 tests.

### Step 3: Build the closing sheet component

Create `src/components/game/day-complete-sheet.tsx`. Read
`src/components/game/week-in-review-sheet.tsx` first and match its structure: a
function component taking `visible` / `onDismiss` props, rendering a `BottomSheet`,
styles via `StyleSheet.create` at the bottom, colors from `useTheme()`, spacing from
`Spacing`.

Props — declare them as an inline type literal on the destructured parameter, the way
`WeekInReviewSheet` does (`week-in-review-sheet.tsx:22-43`), not as a separate exported
interface:

```tsx
{
  visible: boolean;
  companyName: string;
  week: number;
  /** Founder take-home at the current valuation — the run's score-in-progress. */
  stake: number;
  agenda: TomorrowAgenda | null;
  /** Present only where real purchases work; omit to render no purchase affordance. */
  onBuyWeeks?: () => void;
  onDismiss: () => void;
}
```

Content, top to bottom:

- Heading: `That's the week planned out` (`ThemedText type="title"`).
- Sub-line: `` `${companyName} — week ${week}` `` in `themeColor="textSecondary"`.
- The score-in-progress: the value `formatMoney(stake)` (import `formatMoney` from
  `@/lib/format`) under a small label `Your stake`. This is the run's score so far and
  is the thing worth protecting overnight.
- A section labelled `Tomorrow` showing `agenda.line`. Render nothing for this section
  when `agenda` is `null`.
- Primary action: `PrimaryButton` labelled `See you tomorrow` → `onDismiss`.
- Secondary action, **only when `onBuyWeeks` is provided**: a `PrimaryButton` with
  `variant="secondary"` labelled `Keep playing` → `onBuyWeeks`. Follow the
  variant usage at `src/app/game-over.tsx:193`.

Note `BottomSheet` (`src/components/game/bottom-sheet.tsx:22-29`) takes `visible` and
`onClose` — `WeekInReviewSheet` exposes `onDismiss` to its own callers and passes it
down as `onClose`. Mirror that: this component's prop is `onDismiss`.

Tone rules — these are product requirements from `plans/prd-endgame-and-depth.md` §F12,
not style preferences:

- No numeric energy meter, no "0/5", no battery or lightning iconography.
- No countdown timer and no "you'll lose your streak" guilt framing.
- The sheet must always be dismissible; nothing here is a hard gate.

**Verify**: `npx tsc --noEmit` → exit 0 and `npm run lint` → exit 0.

### Step 4: Show it once per local day when the wall lands

In `src/components/game/game-chrome.tsx`:

1. Import `DayCompleteSheet`, `tomorrowAgendaFor` from `@/state/day-close`, and
   `dateKey` from `@/state/week-budget` (already imported from that module — extend
   the existing import statement at line 20 rather than adding a second one).

2. Add exactly this state and this effect, verbatim. Do not invent a different shape.

```tsx
  // Which local calendar day the closing panel has already been shown for.
  // Persisted (see the load effect below) because the player who just hit the
  // wall is precisely the player about to kill the app — in-memory state alone
  // would re-show the panel on the next cold start, same day.
  const [dayCompleteShownFor, setDayCompleteShownFor] = useState<string | null>(null);
  const [dayCompleteLoaded, setDayCompleteLoaded] = useState(false);
  const [dayCompleteVisible, setDayCompleteVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DAY_COMPLETE_KEY)
      .then((value) => setDayCompleteShownFor(value))
      .catch(() => {})
      .finally(() => setDayCompleteLoaded(true));
  }, []);

  useEffect(() => {
    if (!dayCompleteLoaded) return;      // don't flash before we know
    if (!budgetExhausted) return;
    if (state?.pendingEvent) return;     // DecisionModal owns the screen
    if (buySheetTrigger !== null) return; // never stack on the purchase sheet
    const today = dateKey(new Date());
    if (dayCompleteShownFor === today) return;
    setDayCompleteShownFor(today);
    AsyncStorage.setItem(DAY_COMPLETE_KEY, today).catch(() => {});
    setDayCompleteVisible(true);
  }, [dayCompleteLoaded, budgetExhausted, state?.pendingEvent, buySheetTrigger, dayCompleteShownFor]);
```

   Declare the key next to the other module constants at the top of the file:

```tsx
/** Local calendar day the end-of-day panel was last shown for. This module owns the key outright. */
const DAY_COMPLETE_KEY = 'startup-tycoon/day-complete/last-shown';
```

   Add `import AsyncStorage from '@react-native-async-storage/async-storage';` as the
   first import. The single-module-owns-its-key convention is the one
   `src/components/game/first-run-hint.tsx:13` follows with its `KEY_PREFIX` — match it.

   **Guard sequencing matters.** Three things now key off the same `budgetExhausted`
   edge: this sheet, the buy-weeks sheet (plan 001 Step 5), and the notification
   permission dialog. This codebase has a documented iOS hang when one modal presents
   into a frame another is dismissing — see `docs/bug-stuck-decision-modal.md` and the
   `recapArmedWeek` machinery at `game-chrome.tsx:38-55`. The three guards above
   (`pendingEvent`, `buySheetTrigger`, and the day key) are what keep them apart; do
   not drop any of them, and do not add `setTimeout` delays instead.

   **Optional chaining is required, not style.** All of this must be declared **above**
   the `if (!state || state.gameOver) return null;` guard at line 57, because React
   hooks cannot be called conditionally. `state` is therefore still `GameState | null`
   here: write `state?.pendingEvent`, never `state.pendingEvent`. If it does not
   typecheck, the fix is **not** to move the hook below the guard.

   `budgetExhausted` is derived after that guard today; plan 001 hoists it above. If
   plan 001 has not landed yet, hoist it yourself — it reads only `devFreePlay`,
   `weekBudget`, and `purchasedWeeks`, never `state`.

4. Render the sheet next to the other sheets at the bottom of the returned fragment
   (after `WeekInReviewSheet`, before `BuyWeeksSheet`):

```tsx
      <DayCompleteSheet
        visible={dayCompleteVisible}
        companyName={state.companyName}
        week={state.week}
        stake={stake}
        agenda={tomorrowAgendaFor(state)}
        onBuyWeeks={
          purchasesAvailable
            ? () => {
                setDayCompleteVisible(false);
                setBuySheetTrigger('out_of_weeks');
              }
            : undefined
        }
        onDismiss={() => {
          setDayCompleteVisible(false);
          // Plan 001 asked for notification permission on the raw `budgetExhausted`
          // edge. Move it here: the player has just read what's waiting tomorrow,
          // which is the strongest possible context for the ask — and it guarantees
          // the iOS system dialog can never race this sheet's own presentation.
          requestNotificationPermissionOnce('daily_wall').catch(() => {});
        }}
      />
```

   Import `requestNotificationPermissionOnce` from
   `@/components/game/notification-manager`. **If plan 001 has not landed**, that
   export does not exist yet — in that case omit the call and note it in your report;
   do not implement the permission logic yourself, it belongs to plan 001.

   `stake` comes from the existing `deriveWeeklyStats(state)` call at line 59 — extend
   that destructuring to include `stake` rather than calling it a second time.

5. **Remove the now-duplicated permission ask that plan 001 added.** Plan 001 Step 5
   installed a `useEffect` calling `requestNotificationPermissionOnce('daily_wall')` on
   the `budgetExhausted` edge. Delete that effect — the dismiss handler above replaces
   it. Leave `requestNotificationPermissionOnce` itself and its `'second_launch'`
   fallback caller in `notification-manager.tsx` untouched.

   **Verify**: `grep -n "requestNotificationPermissionOnce" src/components/game/game-chrome.tsx`
   → exactly one match, inside the `onDismiss` handler.

6. Leave the existing footer copy at lines 135-150 exactly as it is.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 5: Instrument the panel

In `src/analytics/events.ts`, add two entries to the `EVENTS` catalog under the
"Retention / streak / notifications" section, each with a one-line doc comment in the
style of the surrounding entries:

```ts
  /** The end-of-day panel was shown — `{ agenda_kind }` is the hook it offered. */
  DAY_COMPLETE_SHOWN: 'day_complete_shown',
  /** How the end-of-day panel was closed — `{ action }` is 'dismiss' | 'buy_weeks'. */
  DAY_COMPLETE_DISMISSED: 'day_complete_dismissed',
```

Capture them from `game-chrome.tsx`: `DAY_COMPLETE_SHOWN` with
`{ agenda_kind: agenda?.kind ?? null, week: state.week }` at the moment visibility flips
to true, and `DAY_COMPLETE_DISMISSED` with `{ action }` in each of the two handlers.

**Verify**: `grep -n "DAY_COMPLETE" src/analytics/events.ts src/components/game/game-chrome.tsx`
→ two definitions and at least three call sites; `npm run lint` → exit 0.

## Test plan

- **New tests**: `src/state/__tests__/day-close.test.ts`, the 8 cases in Step 2.
  Structural pattern: `src/state/__tests__/notification-content.test.ts`.
- **Existing tests**: `npm test` must stay green. No existing test covers the
  component files you are changing (vitest excludes components), so a new failure in
  `npm test` means you touched something out of scope — most likely `src/game/`.
- **Not automatable, say so in your report**: the sheet's presentation, its
  once-per-day behaviour, and the modal-collision guards cannot be verified by tests in
  this repo — vitest excludes components and there is no RN test harness here. State
  plainly that Steps 3–6 are verified by typecheck and lint only, and that a simulator
  pass is still needed. The manual script, in order:
  1. Spend all 5 weeks → the sheet appears once, with a `Tomorrow` line.
  2. Dismiss it → on iOS the notification permission dialog appears immediately after.
  3. Press "Next Week →" again → the sheet does **not** reappear.
  4. Background the app and reopen → still does not reappear.
  5. **Force-quit and cold start** → still does not reappear. This is the step that
     actually exercises the persisted `DAY_COMPLETE_KEY`; in-memory state alone would
     pass steps 3–4 and fail here, so do not skip it.
  6. On a device with a decision card pending at the wall, confirm the `DecisionModal`
     shows and the day-complete sheet does not.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0, including 8 new tests in `src/state/__tests__/day-close.test.ts`
- [ ] `npm run lint` exits 0
- [ ] `git diff --stat 0f0d6c4..HEAD -- src/game/` shows **no changes** under `src/game/`
- [ ] `grep -rn "MAX_SAFE_INTEGER\|< 1000" src/state/day-close.ts` shows the
      deck-exhausted guard is present
- [ ] `grep -n "That's the week planned out" src/components/game/game-chrome.tsx`
      still matches — the existing footer copy was not deleted
- [ ] `grep -rn "startup-tycoon/day-complete" src/` returns exactly one match, the
      `DAY_COMPLETE_KEY` declaration in `game-chrome.tsx`
- [ ] `grep -n "requestNotificationPermissionOnce" src/components/game/game-chrome.tsx`
      returns exactly one match, inside the sheet's `onDismiss` handler (zero matches
      is also acceptable **only** if plan 001 has not landed — say which in your report)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `advisor-plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts above
  (the codebase drifted since commit `0f0d6c4`).
- You find a **second** AsyncStorage key is needed beyond `DAY_COMPLETE_KEY` (which
  Step 4 authorizes explicitly). Adding further storage surface changes what a save
  reset has to clear — report the need instead of adding it.
- `BottomSheet` cannot render the content described in Step 3 (e.g. it requires a
  fixed height or a snap-point API this plan did not account for). Report what the
  component's props actually require.
- Showing the sheet causes any modal to hang or stack on iOS, or you find that
  `WeekInReviewSheet` can be visible at the same moment. Read
  `docs/bug-stuck-decision-modal.md` first, then report — do not add timers or
  `setTimeout` delays on your own initiative.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **What a reviewer should scrutinize**: (1) that the sheet cannot appear twice in one
  day or stack with `DecisionModal` / `WeekInReviewSheet`; (2) that the copy stays
  within the §F12 constraints — no meter, no countdown, no guilt; (3) that
  `tomorrowAgendaFor`'s ladder order still matches `notificationContentFor`'s, since
  the in-app panel and the push notification saying different things about the same
  state would read as a bug.
- **`DAY_COMPLETE_KEY` is not cleared by `resetAll`** (`src/state/game-store.tsx:599-621`),
  which explicitly removes the profile, streak, and run-history keys. That matches the
  existing precedent — the first-run hint keys under `startup-tycoon/hints/` aren't
  cleared there either, they have their own reset in Settings. Consequence: an in-app
  reset on the same day the panel was shown will not re-show it. Acceptable, but if a
  QA flow ever needs it, add it to the Settings debug menu alongside "Reset hints"
  rather than to `resetAll`.
- **The two ladders are now coupled by intent, not by code.** If you add a priority
  tier to one of `src/state/day-close.ts` or `src/state/notification-content.ts`,
  consider the other. They were deliberately left as separate functions rather than
  one shared ladder because the notification has a title/body shape and a character
  budget the panel does not — merging them prematurely would force the panel's copy
  into a push-notification voice.
- **Deferred out of this plan on purpose**: a session summary ("here's what you got
  done today" — weeks played, cash delta, headline news beat). It needs the store to
  remember session-start state, which is new store surface and a larger change. The
  agenda line is the half that creates the reason to return; the recap half is polish
  and can follow once this is measured.
- **How to tell whether this worked**: it depends on plan 001's `WEEK_ADVANCE_BLOCKED`
  becoming reachable. The measure is next-day return rate among players who fired
  `DAY_COMPLETE_SHOWN`, broken down by `agenda_kind` — if `steady` (the fallback,
  meaning the state had nothing to offer) retains materially worse than the others,
  the follow-up is engine-side: guarantee that weeks 1–5 always end on a real hook.
  That is the D4 finding from the audit and is deliberately not in this plan.
