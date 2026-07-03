# Plan: Startup Tycoon — MVP

> Generated from: `docs/superpowers/specs/2026-07-03-startup-tycoon-mvp-design.md`
> Date: 2026-07-03

## Overview

Build a single-player, turn-based startup-management game (Football Manager for high-tech companies) in this Expo 57 + expo-router + TypeScript repo. The player makes weekly decisions — hire/fire by role, hire named C-levels, raise funding, answer timeline event cards (AI hype, crashes, acquisition offers) — and steers toward the best exit (IPO/acquisition) before bankruptcy. The core is a pure, deterministic TypeScript engine (`src/game/`, zero React imports) driven as a reducer from a thin React store, rendered across 4 tabs + 2 modals.

## Conventions (apply to every task)

- **UI kit**: **gluestack-ui v5 is primary** (already installed; NativeWind 5 / Tailwind 4 styling). Use `@expo/ui` **only** where a native control clearly wins: `BottomSheet` (event/candidate modals on phones), `Picker`, `Switch`/`Slider`. Charts/sparklines use `react-native-svg` directly. Check https://docs.expo.dev/versions/v57.0.0/ before using any Expo API.
- **Engine purity**: nothing under `src/game/` may import React, React Native, or Expo. All randomness flows through the seeded RNG carried in `GameState`. All tunable numbers live in `src/game/balance.ts`.
- **State flow**: UI dispatches `GameAction`s to a context + `useReducer` store (`src/state/game-store.tsx`) that delegates to the engine reducer. `NEXT_WEEK` dispatches `{ type: 'TICK' }`. The store autosaves the serialized `GameState` to AsyncStorage after every action.
- **Testing**: engine unit tests run under **vitest** (pure TS — no RN test infra needed). Every task that touches the engine ships tests in `src/game/__tests__/`. No component/snapshot tests in the MVP.
- **Routing**: game tabs live in `src/app/(game)/` (`hq`, `team`, `money`, `market`); `src/app/game-over.tsx` outside the tab group; `src/app/index.tsx` becomes new-game/continue.

---

## Tasks

### Task 1: Walking skeleton — found company → HQ → Next Week → bankruptcy

- **Type**: AFK
- **Blocked by**: None - can start immediately

Status: done

#### What to build

The thinnest complete path through every layer (PRD §1, §2, §7). A new game starts with cash, a small starting team, and fixed burn; each **Next Week** tap runs `tick()` (payroll + burn deducted, week increments); when cash < 0 the run ends at a game-over screen; killing and reopening the app resumes mid-run.

Scaffolding included in this slice:

- Add dev deps `vitest` + `tsx`; add `@react-native-async-storage/async-storage` (the only runtime dep). Scripts: `"test": "vitest run"`, `"sim": "tsx scripts/sim.ts"`.
- `src/game/types.ts`: `GameState` (clock, money, team headcounts, morale placeholder, rng), `GameAction` union, `GameOverReason`.
- `src/game/rng.ts`: seeded deterministic RNG (mulberry32 or similar); seed + call counter serialized inside `GameState`.
- `src/game/balance.ts`: starting cash, salaries per role, fixed burn.
- `src/game/engine.ts`: `newGame(seed)`, `reduce(state, action)`, `tick(state)` handling only money for now; `src/game/score.ts`: `checkGameOver(state)` detecting bankruptcy.
- `src/state/game-store.tsx`: provider, `useGame()`, autosave/load (`STORAGE_KEY = 'startup-tycoon/save/v1'`), version field for future migration.
- Screens: replace template `index`/`explore` with new-game screen (Continue if a save exists), `(game)/hq.tsx` with gluestack stat tiles (cash, weekly burn, runway in weeks, week #) and a prominent **Next Week** button, `game-over.tsx` with reason + New Game.
- `scripts/sim.ts`: console harness that runs N ticks and prints the state table — proves the engine runs headless.

#### Acceptance criteria

- [x] `pnpm test` passes with engine tests: `newGame` shape, tick money math, determinism (same seed ⇒ identical state after 50 ticks), bankruptcy detection — 14 tests pass (engine + rng)
- [x] `pnpm sim` plays a run in the console to bankruptcy without any UI — reaches bankruptcy at week 16
- [x] In the app: start game → tap Next Week repeatedly → runway shrinks → game-over screen appears → New Game restarts — verified in browser (web)
- [x] Force-quitting and relaunching mid-run resumes the same state — verified via reload → "Continue — Week 5" → resumes at Week 5 / $170K
- [x] `grep -r "react" src/game/` finds no React/RN imports

#### Implementation notes / scaffolding fixes (apply to all later tasks)

- **Routing**: root `src/app/_layout.tsx` is now a `Stack` (index, `(game)` group, `game-over`) wrapping `GluestackUIProvider` → `ThemeProvider` → `GameProvider`. Game tabs live in `src/app/(game)/_layout.tsx` (`Tabs`); only `hq` exists so far — later tasks add `team`/`money`/`market` screens + `Tabs.Screen` entries.
- **`@/` alias**: removed the `@ → ./` alias from `babel.config.js`. It rewrote `@/…` to the project root only and broke web/SSR resolution. `@/*` is now resolved solely by metro via tsconfig `paths` (`./src/*` then `./*`), which is the only mapping that fits this repo's split layout (files under `src/` + root-level `components/`). Keep importing as `@/game/…`, `@/state/…`, `@/components/…`.
- **Web output**: `app.json` `web.output` changed `static` → `single` (client-rendered SPA). Static prerendering can't server-render this stateful, AsyncStorage-backed app.
- **react-native-css patch**: `patches/react-native-css@3.0.7.patch` (via `pnpm patch`) fixes a circular-init crash that broke the entire web runtime — its babel plugin was rewriting react-native-web's own internal component imports (AnimatedFlatList → FlatList) to css wrappers whose `require("react-native")` re-entered RN-web mid-init. The patch skips rewriting imports originating from inside react-native-web. Native was unaffected.
- **UI approach**: screens use the repo's existing `ThemedText`/`ThemedView` + `StyleSheet` + `Colors`/`Spacing` primitives (proven to render) plus small reusable `src/components/game/` pieces (`StatTile`, `PrimaryButton`). The gluestack component set is not scaffolded in the repo (only the provider); revisit richer gluestack/native controls per the plan conventions in later UI-heavy tasks.
- **Money formatting** lives in `src/lib/format.ts` (`formatMoney`, `formatWeeks`) — UI-only, kept out of the pure engine.

#### PRD sections addressed

- §1 Core Loop, §2 Game State (money/clock subset), §7 Architecture, §8 Testing (infra)

---

### Task 2: Product & revenue economy

- **Type**: AFK
- **Blocked by**: Task 1

Status: done

#### What to build

The full weekly economic pipeline from PRD §2: devs generate `devEffort` → `productQuality` (with decay + tech-debt drag) → `revenue = quality × marketShare × hype × salesFactor` → `valuation = revenue × industryMultiple × hype` (user-count proxy pre-revenue). `hype` and `marketShare` enter `GameState` as fields with neutral defaults (1.0 / fixed share) — later tasks make them move. `GameState` gains a rolling `valuationHistory: number[]` (capped, e.g. last 104 weeks).

UI: HQ gains a valuation sparkline (`react-native-svg` polyline in a reusable `src/components/game/sparkline.tsx`) and revenue/valuation stat tiles. All new constants and formulas live in `balance.ts` as named pure functions (`devEffort()`, `revenueFor()`, `valuationFor()`).

#### Acceptance criteria

- [x] Tests: more devs ⇒ faster quality growth; quality decays with zero devs; revenue and valuation match the balance formulas exactly; valuationHistory caps correctly — 19 tests pass (engine + rng)
- [x] With default start, `pnpm sim` shows revenue eventually offsetting some burn (tunable, not balanced yet) — revenue grows $65→$811/wk over weeks 1–17
- [x] HQ shows a live sparkline that updates every Next Week — verified in browser (web), sparkline + Revenue/Valuation tiles render and update each tick
- [x] Zero new dependencies — reused existing `react-native-svg`

#### PRD sections addressed

- §2 Weekly tick, §6 HQ screen (sparkline + tiles)

---

### Task 3: Team screen — hire/fire by role + morale

- **Type**: AFK
- **Blocked by**: Task 2

Status: done

#### What to build

Abstract hiring per PRD §2–§3: role steppers ("Devs 12 [−][+]") for Developers / Sales / Support on a new Team tab. Hiring is queued as pending deltas and applied on tick (one batch per week); each role affects the economy per §2 (sales → `salesFactor`, support → churn/marketShare protection).

Morale system: 0–100, drifts toward a baseline each tick, `moraleFactor` multiplies devEffort. **Layoffs are the signature tension**: firing applies a morale hit scaling with % of staff cut, so the valuation sparkline visibly dips over following weeks while runway extends. Actions: `SET_PENDING_HIRES { role, delta }`.

UI: gluestack steppers (HStack + Buttons + count), morale progress bar, payroll preview ("next week: −$41k payroll"), and a confirm dialog when firing ≥ 20% of a role warning about morale.

#### Acceptance criteria

- [x] Tests: hire increases payroll next tick; firing 50% of devs drops morale by the ballpark in `balance.ts`; low morale measurably slows quality growth over 10 ticks; morale drifts back toward baseline — 27 tests pass (up from 19)
- [x] Demo: fire most devs → runway jumps up → valuation sparkline dips over the next ~8 weeks — verified in browser: firing 1/3 devs (20%) dropped morale 70→46 exactly per formula, burn $16K→$14K, runway 15wk→17wk, valuation growth visibly slowed
- [x] Steppers cannot go below 0 or above a cash-sanity cap; firing confirm dialog appears at the 20% threshold — verified in browser + engine tests

#### Implementation notes

- Support's "churn/marketShare protection" effect is deferred to Task 7 (rivals + market share), since `marketShare` is still a static field until then — wiring an untested protection formula now would just be guesswork ahead of that task's actual share-shift model. Sales' `salesFactor` wiring (from Task 2) is unaffected.
- No gluestack components used (same as Task 1/2 — only the provider is scaffolded); Team tab reuses the repo's `ThemedText`/`ThemedView` primitives plus new `src/components/game/stepper.tsx` and `morale-bar.tsx`. Confirm dialog uses RN core `Modal`, which renders fine on web.
- `pendingHeadcount` on `GameState` holds the queued target headcount; `tick()` applies it as a batch, and it's kept in sync with `headcount` afterward so steppers always show the last-committed value.

#### PRD sections addressed

- §2 Team model + weekly tick (morale), §3 Decisions (hire/fire row), §6 Team screen

---

### Task 4: C-level hires — named candidates with perks

- **Type**: AFK
- **Blocked by**: Task 3

Status: done

#### What to build

PRD §2: three slots (CTO / CMO / CFO), each empty slot offers 2–3 generated candidates (name from pools, one-line personality, salary, one passive perk from a perk table — e.g. CTO +15% dev productivity, CMO +hype retention, CFO −fixed burn). `src/game/clevels.ts` generates candidates deterministically via the state RNG. Perks are applied as multipliers inside existing balance functions. Firing/replacing a C-level costs a morale ripple.

UI: Team tab gains three C-level cards (filled: name, title, perk, Fire button; empty: Hire button). Candidate picker opens in `@expo/ui` BottomSheet (native win) with gluestack candidate cards inside; falls back fine on web.

#### Acceptance criteria

- [x] Tests: candidate generation is deterministic per seed; hiring a CTO raises devEffort by the perk %; C-level salary joins payroll; firing applies the morale ripple — 36 tests pass (up from 27)
- [x] Candidates persist in the save (offer doesn't reroll on app restart) — offers are generated once (at `newGame`/on firing) and stored in `GameState.cLevels`, so they survive ticks/reloads unchanged (covered by test)
- [x] Demo: hire a CTO → quality growth accelerates; fire them → morale dips and perk disappears — verified in browser: hiring "Elena Novak" (+25% dev productivity) visibly raised weekly revenue vs. baseline by week 3 ($280 vs. ~$224); firing her dropped morale 70→60 exactly (the 10-point departure hit) and reset the seat to a fresh offer

#### Implementation notes

- **CMO perk reframed**: the plan's example "CMO +hype retention" has nothing to retain against yet — `hype` is still a flat constant until Task 6+ wires in decay/events. Implemented instead as a direct hype multiplier applied in the revenue/valuation formulas (`+10/15/20% hype impact`), which is immediately observable now and remains the correct hook once hype starts moving later.
- **`@expo/ui/community/bottom-sheet`** is used for the candidate picker (`src/components/game/candidate-picker.tsx`), confirmed genuinely cross-platform (vaul-based drawer on web, native sheets on iOS/Android) — verified working in-browser. Gotcha: the package's **default** export is `BottomSheet` (always-open, `index=0` by default), not `BottomSheetModal` — importing `BottomSheetModal` as a default import silently resolves to `BottomSheet` and auto-opens every sheet on mount. Must use a named import: `import { BottomSheetModal, BottomSheetView } from '@expo/ui/community/bottom-sheet'`.
- C-level hire/fire are immediate actions (not queued like rank-and-file hires via `pendingHeadcount`) — there's no batching rationale for a one-time leadership decision the way there is for weekly payroll changes.

#### PRD sections addressed

- §2 Team model (C-levels), §3 Decisions (C-level row), §6 Team screen

---

### Task 5: Money screen — funding rounds, dilution, stages

- **Type**: AFK
- **Blocked by**: Task 2

Status: done

#### What to build

PRD §5: Money tab with cash/burn/runway readouts, founder equity %, and a **Raise Round** flow. Rounds progress Seed → A → B and advance `stage` (Garage → Seed → Series A → Growth). Terms are computed, not negotiated: `amountOffered = f(valuation × hype, round)` and dilution per round from `balance.ts`; **runway < 8 weeks ⇒ bridge terms** (less cash, more dilution), surfaced in the UI as a warning. Raising is a real action (`RAISE_ROUND`) with a confirm dialog showing amount, dilution, and resulting equity. Bankruptcy check gains nuance: game over only when cash < 0 *and* no round is available.

UI: gluestack cards + confirm `AlertDialog`; equity shown as a simple bar. A stubbed, disabled **IPO** button appears with its unlock conditions listed (implemented in Task 9).

#### Acceptance criteria

- [x] Tests: terms scale with valuation and hype; dilution math (equity multiplies down, never subtracts below 0); bridge terms trigger exactly under 8 weeks runway; stage advances once per round; can't raise past Series B — 46 tests pass (up from 36)
- [x] Demo: burn toward death → raise a bridge round at visibly worse terms → runway recovers, equity drops — verified in browser: raised Seed at week 0 ($150K for 15%), cash $250K→$400K, runway 15wk→25wk, equity 100%→85%, card advances to next round (Series A)
- [x] Founder equity is correct after Seed + A + B in a scripted sim run — covered by test chaining all 3 rounds and cross-checking against `applyDilution`

#### Implementation notes

- **Round pricing has a per-round cash floor** (`ROUND_MIN_AMOUNT`) beneath the valuation-scaled amount. Task 2's revenue/valuation economy is explicitly "not balanced yet," so a strictly valuation-based Seed round at week 0 (valuation $0) would raise ~$0 — not a workable demo. The floor models real-world pre-seed/seed rounds being priced on team/story rather than current traction; terms still scale continuously above the floor once valuation is large enough (covered by tests). Revisit alongside the Task 10 balance pass.
- **Bankruptcy gating changed meaningfully**: with 0 rounds raised (the default, since `RAISE_ROUND` is a player action), `hasRoundsAvailable` is always true, so pure burn alone can no longer end a run — the player must exhaust all 3 rounds before negative cash is fatal. This is the literal acceptance criterion ("no round is available"), but it means a passive/do-nothing playthrough currently never reaches bankruptcy. Flagged for the Task 10 balance harness, which will need a "do-nothing" bot to exercise this path.
- Reused the existing HQ-style pattern of recomputing burn/revenue/valuation from pure `balance.ts` functions at each call site (Money screen, `RAISE_ROUND` reducer case) rather than storing them on `GameState` — consistent with Task 2/3/4.
- Generalized `MoraleBar` into a shared `src/components/game/progress-bar.tsx` (`ProgressBar`) now that there are two bars (morale, founder equity) with the same track/fill shape but different color logic.

#### PRD sections addressed

- §5 Funding, §3 Decisions (raise round), §6 Money screen, §1 (bankruptcy definition)

---

### Task 6: Event engine + Scrappy deck

- **Type**: AFK
- **Blocked by**: Task 2

Status: done

#### What to build

The event system from PRD §4, plus the first 10 authored cards. `src/game/events/types.ts` defines `EventCard` as pure data: `id`, `era`, `kind: 'news' | 'decision'`, flavor text, and `effects` — declarative stat deltas plus optional `timedEffect { stat, multiplier, weeksLeft }`. Engine: every 2–4 weeks (RNG) `tick()` draws from the current era's remaining deck; news cards auto-apply; decision cards set `state.pendingEvent`, which **blocks Next Week until answered** (`ANSWER_EVENT { choiceIndex }`). Timed effects tick down and expire. Applied events append to a `newsLog`.

UI: HQ news feed renders `newsLog` (newest first); a decision modal (gluestack `Modal` on web / `@expo/ui` BottomSheet on phones, one shared wrapper component) shows title, flavor, and 2–3 choice buttons **with visible effects** ("Take the shortcut: ship faster now, +15 tech debt"). Author `src/game/events/scrappy.ts`: 10 cards (seed-money offer, first big customer, co-founder drama, tech-debt shortcut, viral tweet, burnout scare, …).

#### Acceptance criteria

- [x] Tests: draw cadence within 2–4 weeks; decision cards block TICK until answered; effects apply exactly as declared; timed effects expire on schedule; deck never repeats a card; determinism holds with events on — 55 tests pass (up from 46), including a dedicated `events/__tests__/events.test.ts`
- [x] Adding a new card = adding one object literal to a deck file, zero engine changes (prove with a test-only card) — covered by test; `engine.ts` never references a card by id, only the generic `drawCard`/`applyEventEffects` helpers
- [x] Demo: play 20 weeks → news items accumulate in the feed → a decision card interrupts and its chosen effect is visible in the stats — verified in browser: a decision card ("An Early Feeler") interrupted at week 2 with visible per-choice effects, Next Week stayed frozen until answered, chosen effect (+5% hype) was visible in revenue immediately after, and 3 more news items (2–4 weeks apart) accumulated newest-first through week 12

#### Implementation notes

- **Used RN core `Modal`, not gluestack/`@expo/ui` BottomSheet**, for the decision modal — consistent with every other modal added so far (layoff confirm in Task 3, raise confirm in Task 5), all proven working on web via browser testing. Introducing a second modal system for just this one card type would fragment the UI for no real benefit; gluestack is still only provider-scaffolded (per Task 1's note).
- **Existing Task 1/3/5 tests broke legitimately** once events started consuming RNG and nudging morale/hype/quality: `engine.test.ts`'s money-is-seed-independent test (removed — no longer true, by design), and three tests whose premise was "pure mechanics, no external interference" (bankruptcy loop, valuationHistory cap, morale drift) — fixed by seeding those tests with `drawnEventIds` pre-populated to exhaust the deck, isolating them from event RNG rather than weakening the assertions.
- **`scripts/sim.ts` now auto-answers decision cards** (always choice 0) — otherwise the headless sim hangs forever once the first decision card blocks `tick()`. A full 1000-week run confirms no crash/hang; it currently ends in `timeout` rather than bankruptcy, consistent with Task 5's flagged "no rounds raised ⇒ never bankrupt" behavior.
- Timed effects are folded into `tick()` via a generic `timedMultiplierFor(stat, activeTimedEffects)` in `balance.ts`, applied alongside C-level perk multipliers to devBoost/hype/marketShare — same call-site pattern as Task 4's perks, so the two systems compose without special-casing each other.

#### PRD sections addressed

- §4 Timeline (mechanics + Scrappy deck), §6 Event modal + HQ news feed

---

### Task 7: Rivals + Market screen

- **Type**: AFK
- **Blocked by**: Task 2

Status: done

#### What to build

PRD §2 rivals + §6 Market tab. Two named rivals (name pool via RNG) with `productQuality` and `marketShare`, growing by script: slow baseline quality growth + occasional RNG jitter. Each tick, market share shifts in small steps by quality gap (`shareShift(yourQ, rivalQ)` in `balance.ts`); your share drives the existing revenue formula, so out-innovated ⇒ revenue sags. Support headcount dampens your share loss (wired in Task 3's factor).

UI: Market tab with horizontal share bars (you + 2 rivals + "rest of market"), hype meter (gauge-style progress bar with the 0.5–2.5 range), and an era timeline strip (Scrappy → Boom → Reckoning with a "you are here" marker — eras are static labels until Task 8).

#### Acceptance criteria

- [x] Tests: share conservation (total ≤ 100 always); higher quality gains share over 20 ticks and lower loses it; rival growth is deterministic per seed — 60 tests pass (up from 55), new `market.test.ts`
- [x] Demo: fire all devs → rivals' bars visibly overtake yours within ~15 weeks and revenue drops — verified in browser: your share 15.0%→5.3%, both rivals 20.0%→~25% by week 15, revenue $0
- [x] Market screen renders correctly on phone and web — verified on web; layout uses the same responsive primitives as every other screen (no fixed native-only sizing)

#### Implementation notes

- **Share shift conserves exactly per you-vs-rival pair**, not just approximately: support's dampening scales the *shift itself* (not just your side of it), so a "retained" customer never moves to the rival either. This makes the 3-way conservation invariant hold by construction rather than needing a post-hoc renormalization step — clamping at the 0/1 boundaries can only ever pull the total *below* 100%, never above, which is exactly what the "≤ 100%" test wants.
- `src/game/rivals.ts` mirrors `clevels.ts`'s pattern (pure generation + growth functions threading `RngState` explicitly) rather than folding rival logic into `balance.ts`, since it's genuinely RNG-consuming (name draws, growth jitter) — `balance.ts` stays RNG-free by convention (see `shareShiftFor`/`supportProtectionFactor`, which are pure).
- Existing `engine.test.ts` "tick" test needed updating: revenue for week 1 now depends on the market-share shift against both rivals (previously a static `state.marketShare`), so the test recomputes the same formula `tick()` uses rather than asserting a stale expected value.

#### PRD sections addressed

- §2 Market + Rivals, §6 Market screen

---

### Task 8: Eras + Boom & Reckoning decks

- **Type**: AFK
- **Blocked by**: Task 6, Task 7

#### What to build

Era progression per PRD §4: `Scrappy → Boom` on first priced round OR week 60; `Boom → Reckoning` on valuation > threshold OR week 160 (thresholds in `balance.ts`). Era changes swap the active deck, post a news item, and light up the Market screen timeline. Author the remaining 20 cards: `boom.ts` (**AI hype wave** +40% hype for 8 weeks, rival mega-round, poaching attempt hits morale/headcount, acquisition *feeler*, viral growth, …) and `reckoning.ts` (market crash halves hype, regulation raises burn, IPO window opens/closes via a `state.ipoWindowOpen` flag, serious acquisition offers, down-round pressure, …). Acquisition cards in these decks can *arrive* now; the accept-path ends the game in Task 9 (until then choices are refuse/counter variants).

#### Acceptance criteria

- [ ] Tests: both era triggers fire (round-based and week-based); decks swap; hype-wave timed effect raises revenue for exactly 8 weeks then reverts; crash card halves hype; IPO window flag toggles
- [ ] All 30 cards have unique ids, valid era tags, and pass a deck-validation test (every referenced stat exists)
- [ ] Demo: a full sim run traverses all three eras and the news log tells a coherent story

#### PRD sections addressed

- §4 Eras + Boom/Reckoning decks

---

### Task 9: Exits & scoring — acquisition, IPO, game-over

- **Type**: AFK
- **Blocked by**: Task 5, Task 6

#### What to build

The endgame per PRD §1 + §5. Acquisition: offer events carry a computed price (`valuation × multiplier` scaled by hype); **Accept** ends the run (`GameOverReason: 'acquired'`). IPO: the Money-screen button unlocks at Growth stage + revenue threshold + `ipoWindowOpen`; confirming ends the run at `valuation × hype`. Score = `founderEquity × exitValuation` (bankruptcy = 0). Game-over screen gets the full treatment: outcome headline, score, run stats (weeks survived, peak valuation, total raised, final headcount, mini valuation sparkline), New Game. Autosave is cleared on game over so the entry screen resets.

Add the first full-run integration test: a scripted bot plays hire → raise → survive → accept acquisition, asserting a positive score.

#### Acceptance criteria

- [ ] Tests: accepting an offer ends the run at offer price; IPO unlock requires all three conditions; score math incl. bankruptcy-scores-0; save cleared after game over
- [ ] Demo: one playthrough each ending in acquisition and IPO shows correct score and stats
- [ ] Refusing an acquisition offer continues the run unchanged

#### PRD sections addressed

- §1 Game over + score, §5 Acquisition + IPO, §6 Game-over screen

---

### Task 10: Balance harness, tuning & polish pass

- **Type**: HITL
- **Blocked by**: Task 8, Task 9

#### What to build

PRD §8 + milestone 8. `scripts/balance.ts` auto-plays N seeded runs per strategy bot (do-nothing, never-hire, hire-aggressively, always-raise, sell-first-offer) and prints outcome distributions; encode floor assertions as vitest tests (default strategy survives ≥ 40 weeks; no strategy exceeds a cash ceiling ⇒ no infinite-money exploit; typical run ends within 150–400 weeks). Tune `balance.ts` until assertions and *feel* pass. Polish: empty states, number formatting ($1.2M), `expo-haptics` on Next Week/game-over if trivially cheap (else skip), light reanimated transitions on stat tiles, final phone + web smoke pass.

**HITL because**: the numeric assertions are automatable, but "is a run tense and fun for 15–30 minutes?" requires a human playing 2–3 full runs and giving tuning feedback (likely 2–3 iterations).

#### Acceptance criteria

- [ ] `pnpm balance` prints per-strategy outcome tables from ≥ 50 seeded runs in < 30s
- [ ] Balance assertions pass in CI (`pnpm test`)
- [ ] Human sign-off: a full run feels tense, lasts 15–30 min, layoffs visibly dent the sparkline, and at least two endings are reachable by a normal player
- [ ] No console errors on iOS, Android, and web smoke runs

#### PRD sections addressed

- §8 Testing (balance harness), §9 milestone 8, §1 (run length target)
