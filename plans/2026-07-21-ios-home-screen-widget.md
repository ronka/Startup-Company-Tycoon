# iOS Home Screen Widget — Plan

**Date:** 2026-07-21
**Status:** planned, not started
**Package:** `expo-widgets@57.0.6` (matches `expo ~57.0.4`; docs: https://docs.expo.dev/versions/v57.0.0/sdk/widgets/)

## Scope

A **home screen widget only** — no Live Activities, no lock screen families. iOS only; the
library has no Android support and Android home screen widgets are explicitly out of scope.

Two families: `systemSmall` and `systemMedium`.

### Hard constraint — this cannot ship OTA

Widgets add an app extension target and an App Group entitlement through CNG. That means:

1. A **new development build** is required before a single pixel can be tested on device.
2. A **new production build** is required to ship it. `eas update` cannot deliver it.

Per AGENTS.md, both builds must be confirmed with the user before running. Nothing in this
plan should trigger `eas build` implicitly.

## Decisions

Settled during the grilling session, in order:

| # | Decision | Choice |
|---|---|---|
| 1 | Surface | Home screen widget only |
| 2 | Purpose | Company dashboard |
| 3 | Staleness | Dashboard + one live element (weeks-ready) driven by a timeline |
| 4 | Families | `systemSmall` + `systemMedium` |
| 5 | Medium content | Cash · Runway · Valuation · Weeks-ready |
| 6 | Small content | Runway hero + weeks-ready footer |
| 7 | Timeline | Single entry at next local midnight |
| 8 | Week pools | Combined total (free + purchased) |

Decisions 9+ were delegated; they are recorded under [Delegated decisions](#delegated-decisions).

### Why a live element was required

Nothing in `GameState` moves in real time — the game only advances when the player taps. A
pure mirror of cash/runway/valuation would show identical numbers for days, which is how a
widget earns a deletion. The **week budget** is the only value in the system that changes on
a wall clock (`WEEKS_PER_DAY = 5` granted per local day, banked to `WEEKS_BANK_CAP = 10`), so
it carries the "something changed, come back" job on both tile sizes.

### Why the timeline is exactly two entries

`refreshWeekBudget` (`src/state/week-budget.ts`) grants `min(10, remaining + 5)` **once** per
new local calendar day, regardless of how many days were skipped. Therefore the value a
player would receive on their next launch is the same whether they return tomorrow or in a
week. A single forecast entry at next local midnight is truthful *indefinitely*, and any
multi-day ramp toward the cap would over-promise and be corrected downward at launch.

```
updateTimeline([
  { date: now,               props: { ...snapshot, weeksReady: free + purchased } },
  { date: nextLocalMidnight, props: { ...snapshot, weeksReady: min(10, free + 5) + purchased } },
])
```

## Architecture

Mirrors the existing pure-derivation pattern established by
`src/state/notification-content.ts`: a pure, `Date`-argument-taking, vitest-testable function
that turns state into presentation data, with the platform integration kept in a thin
separate layer.

```
src/widgets/
  snapshot.ts              # pure: (state, weekBudget, purchasedWeeks, now) -> WidgetSnapshot
  __tests__/snapshot.test.ts
  company-widget.tsx       # 'widget' directive component; small + medium layouts
  sync.ts                  # thin: calls CompanyWidget.updateTimeline(...), iOS-guarded
```

### `WidgetSnapshot`

```ts
export interface WidgetSnapshot {
  /** 'run' | 'none' | 'over' — drives which layout branch renders. */
  status: 'run' | 'none' | 'over';
  companyName: string;
  week: number;
  cash: number;
  runway: number;      // Infinity is possible; format as '∞'
  valuation: number;
  weeksReady: number;
  /** Set when a decision card is blocking TICK. */
  decisionPending: boolean;
}
```

`snapshot.ts` imports `deriveWeeklyStats` from `@/lib/derived-stats` and stays free of React,
React Native, and `expo-widgets` — same discipline as `notification-content.ts`, so it tests
under vitest with no native stubbing.

### Sync trigger

An effect in `src/state/game-store.tsx`, alongside the existing `AsyncStorage.setItem`
persistence effects (~lines 368–420), calling into `src/widgets/sync.ts`. It depends on
`[state, weekBudget, purchasedWeeks, loading]` and no-ops while `loading` is true or when
`Platform.OS !== 'ios'`.

Widget refreshes are a **budgeted** system resource on iOS — pushing on every keystroke-level
state change will get the app throttled. The sync layer therefore:

- skips the push when the derived snapshot is deep-equal to the last one pushed,
- debounces to at most one push every few seconds,
- always pushes once on app background (`AppState` change to `background`), which is the
  moment the widget's contents actually start mattering.

The `sync.ts` module is import-guarded so web and Android never load `expo-widgets`, matching
the existing `index.native.ts` / `index.ts` split under `src/purchases/`.

## Verified API surface

Checked against the raw markdown of the v57.0.0 doc (`curl .../widgets.md`), not a summary.

- Widget component is a plain function marked with the `'widget'` directive, registered via
  `createWidget('CompanyWidget', Component)`. It receives `(props, environment)`.
- Layout uses **`@expo/ui/swift-ui`** primitives — `VStack`, `HStack`, `Text`, `Image` — with
  styling applied through `modifiers` from `@expo/ui/swift-ui/modifiers`, e.g.
  `font({ weight: 'bold', size: 16 })`, `foregroundStyle('#0A0A0A')`, `padding(...)`.
  `@expo/ui@~57.0.1` is **already a dependency** — no new package beyond `expo-widgets`.
- `Widget.updateSnapshot(props)` — immediate, single entry, no timeline.
- `Widget.updateTimeline(entries)` — `{ date, props }[]`; schedules and reloads.
- `Widget.reload()` and `Widget.getTimeline()` also exist.
- `environment.widgetFamily` branches the layout; `environment.colorScheme` exists but is
  irrelevant here (the app is dark-only).
- `contentMarginsDisabled` is a per-widget config option if the system margins fight the design.

### Two corrections this forced

**Layout is SwiftUI stacks, not flexbox.** There is no grid primitive. The medium tile's
"4-cell grid" must be composed as a `VStack` of two `HStack`s. Hex colors *do* work, via the
`foregroundStyle` modifier — so the palette carries over intact.

### Third correction — the widget function is stringified

Found while implementing task 3, by reading `babel-preset-expo`'s `widgets-plugin.js` and
`expo-widgets/bundle/index.ts` rather than the docs, which do not mention it.

A `'widget'`-directive function is replaced at build time by **a template literal containing
its own source**. The widget extension evaluates that string against a tiny global scope —
`@expo/ui` components, the modifiers, a minimal JSX runtime, `React` — and nothing else.
**Every module-scope identifier the function references is undefined inside the extension**:
imports, helper components, colour constants. There is no build error; the tile just renders
blank on device.

Two consequences, both applied:

1. `company-widget.tsx` is **one flat function** with its palette declared inside the body,
   matching Expo's own `with-widgets` example. No extracted sub-components, no shared
   constants module.
2. `src/lib/format.ts` **cannot be called from the widget**. So `snapshot.ts` pre-formats
   every string (`cashLabel`, `runwayLabel`, `valuationLabel`, `scoreLabel`, `outcomeLabel`)
   in the app process and ships them as props. This still satisfies what the plan actually
   wanted — one source of truth for how `$4.2M` is written — and moves the formatting into
   the vitest-covered layer instead of a device-only one. It also removes the `Infinity`
   hazard for free: `formatWeeks` renders it as `'∞'` before anything crosses the bridge,
   where a raw `Infinity` would not have survived JSON.

Task 6 must confirm on device that the props and the flat layout resolve inside the
extension — that is the assumption this correction rests on and it cannot be tested here.

**There is a widget-side deep link after all.** `widgetURL(url)` exists in
`@expo/ui/swift-ui/modifiers` (undocumented on the widgets page, which mentions deep links
only for Live Activities). It sets the URL the containing app opens on tap, which would make
a `?src=widget` launch parameter — and therefore decision 12's `widget_open` analytics —
possible. **Not implemented in v1**: decisions 10–12 are settled and this arrived after them.
Worth revisiting as a follow-up.

**There is no documented deep-link URL for widgets.** The `url` parameter for deep linking
exists only on `LiveActivityFactory.start(props, url)`. `addUserInteractionListener` reports a
`target` (button/toggle pressed), which is not the same as a whole-tile tap. So a plain tap
opens the app at its default entry with no attribution parameter available.

## Layouts

The app is **dark-only** (`src/constants/theme.ts` — `Colors.light` and `Colors.dark` are the
same object). The widget follows: no `environment.colorScheme` branching, palette pulled from
the same tokens (`background #0A0A0A`, `text #FAFAFA`, `accent #3C87F7`, `danger #FF6B5E`,
`success #4ADE80`).

### systemSmall

```
ACME CORP · Wk 34
┌──────────────┐
│              │
│    12 wk     │   runway, hero type
│    runway    │
│              │
│  3 ready     │   weeks-ready footer
└──────────────┘
```

Runway is the loss condition and stays meaningful while frozen. It renders in `danger` when
`runway <= 4` (reusing `LOW_RUNWAY_WARNING_WEEKS` from `notification-content.ts`) or when cash
is negative.

### systemMedium

Header: company name · `Week 34`. Body: a 4-cell grid — **Cash**, **Runway**, **Valuation**,
**Weeks ready**. Formatting goes through `src/lib/format.ts` so the widget and the HUD never
disagree on how `$4.2M` is written.

> Terminology guard: `revenue` in the engine is **weekly**, not monthly. It is not on the
> tile, and if it is ever added it must never be labelled "MRR".

## Delegated decisions

Decided rather than asked, after the user handed over the remaining branches.

**8 — Week pools: combined total.** The widget's only promise is "you can play N turns right
now", and free + purchased is the true answer. Showing free-only would tell a player with 0
free and 6 purchased weeks that nothing is ready — a false negative aimed squarely at someone
who has already paid. The midnight forecast stays exact because purchased weeks are untouched
by the daily refresh.

**9 — Empty and terminal states.** Three `status` branches:
- `none` (no save, or onboarding incomplete): "Startup Tycoon — Start your company". No stats.
- `over`: final outcome and founder stake — "Acquired · $4.2M" — with "Tap to start a new
  run". A dead run's live cash and runway are meaningless and showing them reads as a bug.
- `run`: the layouts above.

**10 — Interactivity: none in v1.** No `addUserInteractionListener` buttons. Tapping anywhere
opens the app. Interactive widget buttons would need to mutate `GameState` from an extension
that cannot run the engine, so any "advance a week" button is architecturally out of reach
without a much larger shared-state redesign.

**11 — Deep link target.** Tapping the tile opens the app at its normal entry flow
(`src/app/index.tsx`), which already redirects to onboarding when there is no profile. That
is the whole behaviour — see the correction above: the docs expose no widget-side URL, so
there is no way to append a `?src=widget` parameter or route to a specific screen. If
per-widget routing turns out to matter, it needs investigation in the `with-widgets` example
rather than an assumption here.

**12 — Analytics.** Deferred. The original plan was a `widget_open` event keyed off a
`src=widget` deep-link parameter, which the API does not support. There is no reliable signal
distinguishing a widget-originated launch from any other, and the widget extension has no
PostHog client of its own. Ship without widget analytics; revisit only if a launch-source
signal turns up.

**13 — Deliberately not doing.** No sparkline on the widget (charting through Expo UI is the
riskiest surface in the library and `valuationHistory` rendering is not worth blocking v1 on);
no `widgetsDirectory` image writing (props cover every value on both tiles); no push-driven
widget updates.

## Tasks

1. `npx expo install expo-widgets`; add the config plugin block to `app.json` with one widget
   entry (`name: "CompanyWidget"`, both families) and confirm the default App Group
   (`group.com.ronkaa.startuptycoon`) resolves against EAS credentials.
   Status: done — `expo-widgets@~57.0.6` installed, plugin block added to `app.json` with
   `groupIdentifier: group.com.ronkaa.startuptycoon`. The project is CNG (no committed `ios/`),
   so the App Group can only be verified against EAS credentials at build time — deferred to task 5.
2. Write `src/widgets/snapshot.ts` + tests. Cover: no save, game over, live run, negative
   cash, infinite runway, combined week pools, and the midnight-forecast value at the bank cap.
   Status: done — `src/widgets/snapshot.ts` (18 tests). Two additions to the planned shape:
   `outcome` + `finalScore` (the `over` branch needs them) and a `runwayCritical` boolean, so the
   component stays pure presentation. The midnight forecast reuses the real `refreshWeekBudget`
   against `nextLocalMidnight(now)` rather than re-deriving `min(cap, free + 5)`.
   `src/widgets/**/*.test.ts` added to `vitest.config.ts`'s `include`.
3. Write `src/widgets/company-widget.tsx` with both family branches and all three `status`
   branches.
   Status: done — but see **[Third correction](#third-correction-the-widget-function-is-stringified)**:
   the layout had to be rewritten as a single flat function, and all formatting moved into
   `snapshot.ts`.
4. Write `src/widgets/sync.ts` (dedupe, debounce, `AppState` background push, platform guard)
   and wire the effect into `game-store.tsx`. The effect must push once on `loading → false`,
   not only on background — otherwise a widget added to the home screen between sessions
   renders blank until the player next opens the app.
   Status: done — `src/widgets/sync.native.ts` (dedupe on the derived props, 5s debounce with a
   trailing-edge re-run, background flush that bypasses the debounce *timer* but never the
   dedupe — `inactive` fires far too often to re-push an identical tile — iOS + non-Expo-Go
   guard with a lazy `require`) and `src/widgets/sync.ts` (universal no-op stub, resolved on web
   and under vitest). Wired as `useWidgetSync(state, weekBudget, purchasedWeeks, loading)` in
   `game-store.tsx`; the push effect fires on `loading → false`, which is the initial push.
   Verified: `npm test` (362), `npx tsc --noEmit`, `npm run lint` (no new problems),
   `npx expo export --platform web` (builds; zero widget code in the bundle) and
   `--platform ios` (builds). Also confirmed by running babel directly that the layout is
   stringified and that every identifier left inside it (`_jsx`, `VStack`, `font`,
   `containerBackground`, …) is one the widget bundle provides as a global.
5. **Confirm with the user**, then run a development build and test on device.
   Status: blocked
   Blocker: needs the user's go-ahead — `eas build` consumes paid credits (AGENTS.md), and this is
   the first build that can verify the App Group entitlement provisions (task 1) and that the
   widget renders at all.
6. Iterate on layout against the real device — widget typography and spacing never look the
   way they do in the editor.
7. **Confirm with the user**, then production build and submit.

## Open risks

- `expo-widgets` is new. Expect rough edges in the config plugin and in what Expo UI actually
  renders inside a WidgetKit context; budget device-debugging time in task 6.
- App Group entitlement provisioning can fail on first EAS build if the identifier is not
  registered in the Apple Developer portal. Verify credentials before spending a build.
- iOS throttles widget timeline refreshes. If the tile is observed going stale despite
  pushes, the dedupe/debounce thresholds in `sync.ts` are the first thing to loosen.
