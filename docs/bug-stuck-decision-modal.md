# Bug: game stuck on the decision-card screen

**Status:** fixed (2026-07-05)

## Fix applied

Both same-commit present-while-dismiss races were removed by deferring the
follow-up modal off the frame that clears `pendingEvent`:

- **Standup re-injection** (`src/state/game-store.tsx`): the injection now runs
  inside a `setTimeout(..., 400)` instead of dispatching `SET_STATE`
  synchronously. The effect re-runs (and clears the timer) on every state
  change, so the captured `state` is always current when it fires — no
  stale-closure overwrite.
- **Week recap** (`src/components/game/game-chrome.tsx`): `WeekInReviewSheet` /
  `WeekTicker` now wait for a `recapArmedWeek` gate, set ~350ms after the tick's
  decision card is answered, so the recap never presents into the frame the
  `DecisionModal` is dismissing.

Original diagnosis below.

---

**Symptom:** Occasionally the game freezes on a decision-card modal (e.g. "An Early
Feeler"). The card's buttons don't respond and the **Next Week** button is greyed out.
Force-quitting and reopening the app, then continuing, works fine.

## It is a native RN `<Modal>` bug, not a reducer bug

The Early Feeler is a normal `decision` card with valid choices, and `ANSWER_EVENT`
clears it correctly (`src/game/engine.ts:655-683`). The engine logic is fine. The freeze is a
**native React Native `<Modal>` presentation bug**:

- `canAdvance = !state.pendingEvent && !budgetExhausted` (`src/components/game/game-chrome.tsx:61`).
  Next Week being greyed means `state.pendingEvent` is genuinely still set.
- The modal is on screen but its **buttons aren't receiving touches**, so the tap never
  dispatches `ANSWER_EVENT`, so `pendingEvent` never clears.
- Kill + relaunch re-hydrates the save and re-presents a *single* clean modal, so taps
  work again — matching "close, reopen, continue works."

## Root cause: stacked `<Modal>`s + a visibility toggle in the same frame

On the active tab there are three RN `<Modal>`s plus a `BottomSheetModal` mounted at once:

| Component | File | Modal |
|---|---|---|
| DecisionModal | `src/components/game/decision-modal.tsx:53` | `<Modal>` (always mounted, toggles `visible`) |
| WeekInReviewSheet | `src/components/game/week-in-review-sheet.tsx:46` | `<Modal>` (always mounted, toggles `visible`) |
| HQ "Switch focus?" | `src/app/(game)/(tabs)/hq.tsx:114` | `<Modal>` |
| FocusPicker | `src/components/game/focus-picker.tsx:52` | `@expo/ui` `BottomSheetModal` |

`GameChrome` renders DecisionModal and WeekInReviewSheet as always-mounted siblings
(`game-chrome.tsx:111` and `:117`), and the tab screens stay mounted in the background.
iOS UIKit serializes modal present/dismiss; when one modal presents while a sibling is
dismissing/presenting **in the same commit**, the top modal renders but its
`UIViewController`/window swallows touches — the classic "modal visible but
unresponsive" failure.

## Concrete trigger (why it's intermittent)

The smoking gun is the **standup re-injection effect** (`src/state/game-store.tsx:176-183`).
It runs on every state change and does a *full-state* `dispatch({ type: 'SET_STATE', ... })`
from a stale closure whenever `pendingEvent` is null and today's standup isn't credited yet.

When you answer a card on a day standup hasn't been credited (e.g. the card was hydrated as
pending from a prior session, so the on-open standup was skipped by the `state.pendingEvent`
guard at `game-store.tsx:177`):

1. Tap choice → `ANSWER_EVENT` → `pendingEvent = null` → render **R1**: DecisionModal
   `visible` flips `true→false` → iOS starts a *dismiss* animation.
2. R1's effects run → standup effect sees `pendingEvent` null → injects a new card → render
   **R2**: `visible` flips `false→true` → iOS starts a *present* while the dismiss is still
   in flight.

Present-while-dismissing on the same `<Modal>` within ~1 frame → stuck, unresponsive modal,
`pendingEvent` still set. It's intermittent because it only bites when the standup-credit
timing (or a WeekInReview `visible` flip, gated to swap in exactly as `pendingEvent` clears —
`game-chrome.tsx:44`) lands in the same commit as the decision-modal toggle.

## How to confirm

- Log `card?.id` in `DecisionModal` render and log inside the store's standup effect — the
  stuck runs will show a `pendingEvent: null → standup` flip immediately after an answer.
- Or temporarily `return` early from the standup effect and/or render only one `<Modal>` at
  a time; the freeze should stop reproducing.

## Contributing factors to address in the fix

1. `DecisionModal` renders for *any* non-null card regardless of `kind`
   (`decision-modal.tsx:53`).
2. Multiple always-mounted sibling `<Modal>`s. Collapsing to a single shared modal host
   would remove this whole class of races.
3. The standup effect dispatching a full stale-closure `SET_STATE` right as a modal toggles
   (`game-store.tsx:182`).
