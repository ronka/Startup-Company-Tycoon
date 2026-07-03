# Plan: Startup Tycoon — Endgame & Depth (v2)

> Generated from: `plans/prd-endgame-and-depth.md`
> Date: 2026-07-03

## Overview

Turn the MVP's open-ended sim into a finishable, daily-habit game: every run ends in bankruptcy, acquisition, or IPO and produces a score (founder equity × exit valuation); eras (Scrappy → Boom → Reckoning) keep the late game dangerous; a 30–50 card event deck keeps every week interesting; and a store-layer daily week-budget (5/day, bank to 10) with a Morning Standup reward card turns a run into a 2–4 week daily campaign. All engine work follows the PRD §3 conventions: `src/game/` stays pure and deterministic, tunables live in `balance.ts`, every engine change ships vitest tests and stays observable through `pnpm sim`.

---

## Tasks

### Task 1: "Your stake" display on Money tab + raise dialog delta

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F2. A derived "founder take-home" stat (equity × current valuation) surfaced in two places: a live **Your stake: 38% × $1.3M = $494K** line under founder equity on the Money tab, and a before/after stake delta in the raise confirmation dialog ("your stake goes from $494K to ~$X"). Pure calculation lives with the other derived stats so Task 2 can reuse it as the score formula.

#### Acceptance criteria

- [x] Stake line renders on the Money tab and updates after every tick/raise
- [x] Raise confirm dialog shows before → after stake
- [x] Stake formula has a unit test and is exported for reuse by the score model

#### PRD features addressed

- F2

---

### Task 2: IPO exit end-to-end

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F1 (IPO + score model). Engine: IPO eligibility (growth stage + revenue clearing a tunable bar sustained N consecutive weeks + an `ipoWindowOpen` flag on state, hardcoded open until Task 5 wires it to eras), a `GO_PUBLIC` action that ends the run with `gameOver: 'ipo'`, and score = founder equity × exit valuation recorded on the state. UI: the Money tab IPO card shows live progress toward the bar ("Revenue $108K / $150K needed") and becomes a confirm-dialog action when eligible; the game-over screen shows the score and run length for all three `GameOverReason`s. Sim: a strategy bot can reach IPO; summary line prints outcome + score.

#### Acceptance criteria

- [x] `checkGameOver`/reducer covers `ipo`; `GO_PUBLIC` rejected while ineligible or while a decision card is pending
- [x] Money tab IPO card shows live progress instead of "Coming soon"
- [x] Game-over screen shows score (equity × exit valuation); bankruptcy scores $0
- [x] A sim bot reaches IPO within 150 weeks on some seeds; bankruptcy remains reachable on others
- [x] Engine tests cover eligibility edge cases (bar not sustained, pending event, pre-growth stage)

#### PRD features addressed

- F1 (IPO, score model)

---

### Task 3: Acquisition offers end-to-end

Status: done

- **Type**: AFK
- **Blocked by**: Task 2

#### What to build

PRD F1 (acquisition). An event-choice effect type that carries an acquisition offer: accepting ends the run with `gameOver: 'acquired'` at the offered price (score via Task 2's model); declining applies per-card side effects (hype bump, rival response). Offer sizes scale with current valuation. Upgrade the existing "An Early Feeler" card into the first rung of the offer ladder — early offers are tempting lowballs. Game-over screen (from Task 2) already renders the outcome.

#### Acceptance criteria

- [x] An acquisition card can end a run mid-game with the correct score
- [x] Offer size derives from current valuation (unit test)
- [x] Declining applies the card's stated side effects
- [x] Sim handles acquisition cards without stalling (first-choice policy still works)

#### PRD features addressed

- F1 (acquisition)

---

### Task 4: Era state plumbing

Status: done (save-version bump only; no migration written — pre-release, so an old save just starts a new run, per user direction)

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F3 (state, progression, presentation — no balance dials yet). Add `era` to `GameState` with deterministic advancement on a seeded jittered schedule (Boom ~wk 25–35, Reckoning ~wk 55–70; tunables in `balance.ts`). Wire the Market tab era strip to real state. Era transitions emit a full-width news entry and a distinct Week in Review beat. Save version bump handled per PRD §3.

#### Acceptance criteria

- [x] Era advances deterministically per seed (unit test: same seed → same transition weeks)
- [x] Market tab "you are here" marker moves through Boom and Reckoning during a long run
- [x] Transition week produces a news entry and shows up in the review sheet
- [x] `pnpm sim` summary prints the era at game over

#### PRD features addressed

- F3 (partial: state + presentation)

---

### Task 5: Era balance dials

Status: done

- **Type**: AFK
- **Blocked by**: Task 2, Task 4

#### What to build

PRD F3 (the dials). Boom: slower hype decay, larger/cheaper funding rounds, rival growth acceleration, IPO window **open**. Reckoning: funding unavailable or brutally dilutive, compressed revenue multiple in `valuationFor`, IPO window **shut**, morale-pressure hooks. Wire Task 2's `ipoWindowOpen` to era. Demonstrate with a sim seed that a profitable-but-complacent company can die in Reckoning.

#### Acceptance criteria

- [x] At least one balance dial per era demonstrably differs (unit tests per dial)
- [x] IPO window opens in Boom and shuts in Reckoning
- [x] A documented sim seed shows a profitable company dying in Reckoning (`pnpm sim complacent 100` — profitable through Scrappy/Boom, dies bankrupt in Reckoning at week 518 as rival quality overtakes a frozen headcount and Reckoning's dials compound the erosion)
- [x] All era tunables live in `balance.ts`

#### PRD features addressed

- F3 (complete)

---

### Task 6: Event infrastructure — era decks, story flags, repeatable fillers

Status: done

- **Type**: AFK
- **Blocked by**: Task 4

#### What to build

PRD F4 (infrastructure). Deck machinery upgrades: decks are era-gated (`scrappy.ts`, `boom.ts`, `reckoning.ts`); cards may set and require simple string flags on `GameState` (enables chained storylines); a small repeatable filler pool draws when era uniques are exhausted so late weeks never go fully silent. Ship 2–3 demo cards per new mechanism (one boom card, one flag-chained pair, one repeatable) to prove the plumbing end-to-end; the full content push is Task 7.

#### Acceptance criteria

- [x] Era-gated draw: boom cards never appear in Scrappy (unit test)
- [x] A flag-setting card causes its follow-up to become drawable, choice-dependently (unit test)
- [x] Repeatable fillers draw after uniques exhaust; uniques still never repeat
- [x] Demo cards visible in a real run and handled by the sim (`boom-hiring-spree`, flag-chained `scrappy-cofounder-drama` → `boom-cofounder-drama-part-two`, 2 repeatable fillers, plus a starter `reckoning-down-round-rumors` card)

#### PRD features addressed

- F4 (infrastructure)

---

### Task 7: Deck content expansion (30–50 cards + story arcs)

Status: done

- **Type**: AFK
- **Blocked by**: Task 3, Task 6

#### What to build

PRD F4 (content). Grow scrappy to ~15 cards; write ~10–15 boom cards (acquisition feelers via Task 3's offer machinery, poaching, hype cycles, rival megaround) and ~10 reckoning cards (down-round pressure, layoff dilemmas, acquirer vultures, morale crises). Include bad-luck cards where both choices cost something, and 2–3 chained arcs (e.g. Co-founder Drama part 2 shaped by the part-1 choice). Keep the transparency rule: effects shown up front.

#### Acceptance criteria

- [x] 30–50 total cards across the three era decks (15 scrappy + 13 boom + 11 reckoning = 39)
- [x] No dead-air stretch longer than ~6 weeks in a 100-week sim
- [x] At least 2 chained arcs fire in order and respect flags (tests) — 3 shipped: Co-founder Drama → Part Two, First Big Customer → Demanding Customer, An Early Feeler (decline) → Second Thoughts
- [x] At least 5 cards are genuine dilemmas (both choices have a cost) — 8 shipped

#### PRD features addressed

- F4 (complete)

---

### Task 8: Funding rebalance

Status: done

- **Type**: AFK
- **Blocked by**: Task 1

#### What to build

PRD F5. Round cooldown (a raise locks further raises for 6–8 weeks, enforced in the reducer); round sizes scale with current valuation so raising after a hype spike yields more cash for the same equity; bridge messaging in the raise dialog ("this raise still leaves you under 8 weeks — next round will also be a bridge") or bridge sizing that clears the threshold — pick via sim evidence. Task 1's stake delta in the dialog makes the dilution cost visible.

#### Acceptance criteria

- [x] Same-week back-to-back raises impossible (reducer test) — `ROUND_COOLDOWN_WEEKS = 7`, enforced via `canRaiseRound`/`lastRoundRaisedWeek`
- [x] Round size responds to valuation (unit test)
- [x] Raise dialog explains bridge consequences before confirming (existing bridge warning, plus a new "next round will likely also be a bridge" line when this raise doesn't clear the threshold — messaging approach chosen over resizing, since bridge terms already self-correct the incentive per the sim evidence below)
- [x] Sim evidence: an early-raising balanced bot ends with meaningfully more equity than an always-bridging one (seed 1: 0.544 vs 0.258 founder equity after all 3 rounds — see `funding.test.ts`'s "sim evidence" describe block)

#### PRD features addressed

- F5

---

### Task 9: Candidate generation tradeoffs

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F6. Candidate generator enforces no strictly dominated candidate within a pool (better perk + lower salary → reroll/adjust); widen perk axes per role (CTO: productivity vs tech-debt vs shortcut-risk; CMO: hype gain vs decay slowdown; CFO: burn vs round terms); optional stretch: personality quirks with small mechanical side effects, displayed on the card. Fix duplicate flavor text and repeated names within visible pools.

#### Acceptance criteria

- [x] Property-style test over many seeds: no pool contains a dominated candidate (structurally guaranteed — per-axis salary tiers never overlap — plus a 60-seed × 3-role regression test in `clevels.test.ts`)
- [x] Each role has ≥2 distinct perk types in its pool space (3 axes per role: e.g. CTO productivity / tech-debt / shortcut)
- [x] No duplicate personality strings within one pool (seeded Fisher-Yates shuffle over the fixed 3-personality list, one per candidate)
- [x] Candidate cards render any quirk alongside the perk (`candidate-picker.tsx`, `clevel-card.tsx`) — quirks nudge salary only, never perk power, so they never break dominance-freedom

#### PRD features addressed

- F6

---

### Task 10: Morale thresholds and levers

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F7. Below ~40 morale: seeded weekly attrition risk (a random hire quits — headcount −1 + news entry); below ~25: productivity penalty on dev effort and sales factor. Add a cash-costing morale lever on the Team tab (offsite / perks budget) reflected in the burn preview. Surface the existing C-level firing morale hit in its confirm dialog. Team/HUD morale bar gains threshold markers.

#### Acceptance criteria

- [x] Forced-low-morale test shows attrition and productivity penalties fire at the documented thresholds (`engine.test.ts` — cratered-morale seeds fire attrition + a "quit" news entry; never fires above the threshold; `moraleCrisisMultiplier` unit-tested at the boundary)
- [x] Morale lever costs cash, shows in next week's payroll/burn preview, and raises morale on tick (Team tab "Team offsite & perks" toggle; `weeklyBurnFor`'s `moraleLeverCost`; `moraleAfterTick`'s `leverBoost`)
- [x] Thresholds and lever tunables live in `balance.ts` (`MORALE_ATTRITION_THRESHOLD`, `MORALE_ATTRITION_CHANCE`, `MORALE_CRISIS_THRESHOLD`, `MORALE_CRISIS_PRODUCTIVITY_MULTIPLIER`, `MORALE_LEVER_WEEKLY_COST`, `MORALE_LEVER_BOOST`)
- [x] Morale bar shows the danger thresholds visually (`ProgressBar` gained a `markers` prop; `MoraleBar` marks 25/40); C-level firing now goes through a confirm dialog stating the morale hit, mirroring the existing layoff-confirm modal

#### PRD features addressed

- F7

---

### Task 11: Rivals that fight back

Status: done

- **Type**: AFK
- **Blocked by**: Task 4

#### What to build

PRD F8. Era- and state-aware rival behavior: a share-starved rival can draw a desperation pivot (quality surge); in Reckoning weak rivals die and their share redistributes; if the player approaches monopoly before an exit, a new entrant appears. Market tab shows rival quality or a relative "product edge" indicator so share swings are explainable; surges and deaths appear in the news feed.

#### Acceptance criteria

- [x] 100% player share is unreachable pre-exit, or immediately answered by a new entrant (sim evidence: `market.test.ts` "never lets total share sit at or above 100%" — a crushing player is forced back under the monopoly threshold every time it's hit)
- [x] Rival pivots/deaths/entrances appear in the news feed (`applyRivalDynamics`' `beats` are stamped into `NewsEntry`s in `engine.ts`'s `tick`)
- [x] Market tab exposes rival quality or edge indicator (`market.tsx`'s `ShareRow` now shows "+N edge"/"N behind" per rival)
- [x] Behavior is deterministic per seed (tests) — `applyRivalDynamics` is a pure function of its inputs; two-named-rivals shape is preserved by replacing the dying/weakest slot in place rather than shrinking the array

#### PRD features addressed

- F8

---

### Task 12: Advance-week-anywhere + fast-forward

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F9 (items 1 and 4). A persistent Next Week control in a footer/HUD across all four tabs, disabled while a decision card is pending (same rule as today). A fast-forward affordance ("play 4 weeks" or hold-to-repeat) that auto-advances and hard-stops on any event card, era change, or notable week.

#### Acceptance criteria

- [x] Week can be advanced from every tab; control disables during a pending decision (`GameChrome` rendered once in `(game)/_layout.tsx`, a sibling of `Tabs`, so the footer + its two modals are reachable from HQ/Team/Money/Market alike; verified live in a browser — footer visible on every tab, both buttons grey out the instant a decision card is pending)
- [x] Fast-forward stops on event cards, era transitions, and notable weeks (`tickMany` in `engine.ts` — a pure loop over `tick` that halts on `gameOver`, `pendingEvent`, or `isNotableWeek`, which already covers era-transition and digest-threshold entries; store's `fastForward` wraps it and jumps state in one `SET_STATE` dispatch so no intermediate week is skipped over unseen)
- [x] Works on web and native (plain RN `View`/`Pressable` components, no web-only or native-only APIs; smoke-tested on web)

#### PRD features addressed

- F9 (partial)

---

### Task 13: Notable-weeks review + news dedupe

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F9 (items 2 and 3). Notability rules (single tunable place, likely `digest.ts`): full Week in Review sheet only on notable weeks (event resolved, threshold crossed, era change, raise, morale/attrition incident); quiet weeks get a compact one-line toast/ticker. Aggregate share movements in the digest ("Gained 2.0% share this week — mostly from Meridian") instead of two per-rival entries per week in the news feed.

#### Acceptance criteria

- [x] A 20-quiet-week stretch shows at most a handful of full sheets (`isNotableWeek` in `digest.ts` — any week with zero news entries is quiet by construction, since every entry already gates on a real threshold; `GameChrome` shows `WeekInReviewSheet` only when notable, `WeekTicker` otherwise. Also added a `RAISE_ROUND` news entry so raises are visible in the feed even though raising doesn't tick the week)
- [x] News feed contains no consecutive duplicate share entries; share gains summarized (`buildDigestEntries` now emits one aggregate "Gained/Lost N% share this week" line off your own net `marketShare` delta, attributed to whichever rival moved the most, instead of one line per rival — verified live: a real run showed exactly one "Gained 2.0% share this week — Mostly from Nimbus." line per week, not two)
- [x] Notability rules unit-tested in the digest module (`digest.test.ts`'s `isNotableWeek` describe block, plus the rewritten share-aggregation tests)

#### PRD features addressed

- F9 (complete, with Task 12)

---

### Task 14: Daily week budget core

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F12 (budget + framing + architecture). Store-layer only: 5 game-weeks per real day refreshing at local midnight, banking to a cap of 10; `TICK` gated by the store (engine untouched — no `Date` in `src/game/`); `lastSessionDate` / `weeksRemaining` persisted alongside the save. Diegetic presentation: no energy meter — subtle remaining-days dots under the Next Week label and out-of-weeks copy ("That's the week planned out — the team gets to work. Come back tomorrow."). Everything but `TICK` stays usable at zero. Dev-only free-play toggle so playtesting and the sim are never rate-limited.

#### Acceptance criteria

- [x] Store rejects `TICK` when exhausted; engine tests and `pnpm sim` unaffected (`src/state/week-budget.ts` is pure, `Date`-only logic that never touches `src/game/`; gating lives entirely in `game-store.tsx`'s `dispatchWithSnapshot`/`fastForward`; `pnpm sim` bypasses the store completely and is unaffected by construction)
- [x] Midnight refresh and 10-week banking cap covered by store tests with a mocked clock (`src/state/__tests__/week-budget.test.ts` — 10 tests, all driven by explicit `Date` instants rather than mocking global time; `vitest.config.ts` widened to include `src/state/**/*.test.ts`)
- [x] No numeric/battery-style meter anywhere; diegetic copy on the disabled state (`GameChrome`'s `WeekBudgetDots` — filled/empty dots, no digits; verified live in a browser at week 5/5 spent: "That's the week planned out — the team gets to work. Come back tomorrow.")
- [x] Tabs, pending hires, news, and pending decisions all work at 0 remaining weeks (gating only intercepts `action.type === 'TICK'` and `fastForward`; every other `GameAction` — hiring, firing, raising, answering a decision, toggling the morale lever — passes straight through, untouched)
- [x] Free-play toggle available in dev builds (`__DEV__`-gated "Free play: off/ON" toggle in `GameChrome`; verified live — flips both buttons back to enabled instantly at 0 remaining weeks)

#### PRD features addressed

- F12 (core)

---

### Task 15: Morning Standup card + streak

Status: done

- **Type**: AFK
- **Blocked by**: Task 14

#### What to build

PRD F12 (daily reward + streak). First session of each day opens with a Morning Standup card — pick 1 of 3 small boosts from a dedicated daily pool, injected by the store through the existing event-card machinery. Forgiving streak: 3-day pool upgrade, 7-day golden card (candidate pool refresh or +1 week today), 14-day rare option (e.g. clean terms on next raise); a missed day pauses the streak for one grace day, resetting only after two consecutive misses.

#### Acceptance criteria

- [x] Standup appears exactly once per day on first session (mocked-clock store tests): `daily-streak.test.ts` covers the pure day-transition logic with fixed `Date` instants; `game-store.tsx`'s injection effect gates on `streak.lastPlayedDate === today`, making re-injection impossible until the calendar day changes; verified live — New Game immediately opened a Morning Standup card, and it didn't reappear after answering
- [x] Rewards flow through `GameAction`s/event cards; engine purity preserved: Standup cards are plain `EventCard` data (`src/game/events/standup.ts`) injected straight into `pendingEvent`, resolved via the existing `ANSWER_EVENT` → `applyEventEffects` path. One new (still pure, `Date`-free) effect was added — `refreshCandidates`, rerolling every open C-level seat's offer — plus a `setsFlag`-based one-time "clean raise terms" dilution discount consumed by the next `RAISE_ROUND` (mirrors the existing story-flag convention)
- [x] Streak milestones and grace-day semantics match the PRD table (tests): `standup.test.ts`'s `standupTierForStreak` covers the 3/7/14-day thresholds; `daily-streak.test.ts` covers the one-grace-day forgiveness and the two-consecutive-miss reset (chose persistent tiered pools over one-off milestone-day cards — simpler to reason about and test, and the PRD's own "candidate pool refresh **or** +1 week today" phrasing left the golden reward's exact shape to the implementer, so the store-only "+1 week" option was dropped in favor of the fully engine-pure candidate-refresh)
- [x] Streak rewards bend the run, never break it (no reward grants > the documented caps): `standup.test.ts` asserts every tier's cash/morale/hype deltas stay at or under $25,000 / 15 / 0.2 respectively; the rare tier's dilution discount (`CLEAN_RAISE_TERMS_DILUTION_MULTIPLIER = 0.7`) is a one-time, single-round effect, not a lasting multiplier

#### PRD features addressed

- F12 (reward + streak)

---

### Task 16: State-aware local notifications

Status: done

- **Type**: AFK
- **Blocked by**: Task 14

#### What to build

PRD F12 (re-engagement). Local push via `expo-notifications` (check the Expo 57 docs first, per repo instructions): at most one per day, referencing real game state ("Week 34: your Series A decision is waiting", "Runway is down to 4 weeks"), deep-linking into the run. Opt-in prompt appears only after the player's first completed session, never on first launch.

#### Acceptance criteria

- [x] At most one notification scheduled per day; content derives from actual state (`notificationContentFor` in `src/state/notification-content.ts` — pure, unit-tested, priority order: pending decision > low-runway warning > plain nudge; `NotificationManager` always cancels the fixed-identifier `startup-tycoon-daily-nudge` before rescheduling, so at most one is ever pending)
- [x] Tapping the notification deep-links into the running game (`data: { url: '/hq' }` + `addNotificationResponseReceivedListener`/`getLastNotificationResponseAsync` calling `router.push`, per the Expo 57 docs' recommended expo-router pattern)
- [x] Permission prompt deferred until after the first completed session (`AsyncStorage`-persisted `has-launched-before` flag: set with no prompt on the very first launch; the prompt fires only once a *subsequent* launch sees that flag already set)
- [x] Graceful no-op on web / when permission denied (`Platform.OS === 'web'` short-circuits every effect in `NotificationManager` to a no-op; verified live — the web bundle with `expo-notifications` installed still boots and plays a full run with no console errors. Denied permission is a no-op by construction: `requestPermissionsAsync`/`scheduleNotificationAsync` calls are all `.catch(() => {})`-wrapped and nothing else depends on their result)

Installed `expo-notifications@57.0.2` (pinned below the `~57.0.3` `expo install` default, which currently fails on an unpublished transitive `@expo/env`/`@expo/require-utils` version — a temporary upstream registry gap, not a real incompatibility) and added it to `app.json`'s plugin list. Widened `vitest.config.ts` with a `@` alias so `src/state/**` can import `@/lib/...` / `@/game/...` the same way the app does.

#### PRD features addressed

- F12 (re-engagement)

---

### Task 17: Web polish — icons and dark-mode sheets

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F10. Web fallbacks for the tab-bar SF Symbols (currently "⏷" placeholders) and fix the doubled "⏷ ⏷" accessibility label; theme the candidate/decision bottom-sheet surface for dark mode on web (currently white); sweep for other web dark-mode inconsistencies.

#### Acceptance criteria

- [x] Tab icons render properly on web; a11y labels are single and meaningful (`src/components/ui/tab-bar-icon.tsx` renders real `expo-symbols` `SymbolView` icons per tab — building/people/dollar/trending-line — wrapped in an `aria-hidden` `View`; wired via `tabBarIcon` on each `Tabs.Screen` in `(game)/_layout.tsx`. Root cause of the doubling: expo-router's bundled bottom-tabs fork renders the icon slot twice, stacked, to crossfade focus state — `aria-hidden` on our icon wrapper removes both copies from the a11y tree, leaving only the tab's own label as its accessible name. Verified live in a browser: tab a11y names went from `"⏷ ⏷ HQ"` to `"HQ"`, `"Team"`, `"Money"`, `"Market"`)
- [x] Candidate picker and decision sheets respect dark mode on web (`candidate-picker.tsx`'s `BottomSheetModal` now passes `backgroundStyle={{ backgroundColor: theme.background }}` — the `@expo/ui` community bottom-sheet hardcodes a white `#fff` web background unless overridden; this prop is honored cross-platform, not just on web. `decision-modal.tsx` and the raise/fire/IPO confirm dialogs were already plain RN `Modal` + `ThemedView` and needed no change. Verified live: candidate sheet now renders black/themed instead of white)
- [x] Quick pass over all four tabs + modals in web dark mode finds no white flashes (live sweep of HQ/Team/Money/Market, the candidate-picker sheet, raise-confirm, fire-confirm, and the Week in Review sheet in a headless browser at `--color-scheme dark`; a static grep for hardcoded `#fff`/`white` backgrounds across `src/components/game` and `src/app` turned up only pre-existing semi-transparent black modal backdrops, which are theme-agnostic by design)

#### PRD features addressed

- F10

---

### Task 18: Teaching layer

Status: done

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

PRD F11. One-line "why" strings in the Week in Review / digest ("Your product quality outpaced Meridian's → +2.0% share"); tap/long-press explainers on stat tiles (one sentence: what feeds it, what it feeds); three first-run-only contextual hints (Team, Money, HQ). No modal tutorial.

#### Acceptance criteria

- [x] Digest lines explain share and hype movements in cause→effect form (`digest.ts`'s share-movement entry now compares `after.productQuality` against the biggest-mover rival's quality — the actual driver of `shareShiftFor` in `engine.ts` — and renders e.g. `"Your product quality outpaced Meridian's → +2.0% share."` in place of the old "Mostly from X." New `HYPE_BANDS = [1.2, 1.5, 2.0]` mirror the existing `MORALE_BANDS` pattern: crossing a band on the way up emits `"Hype spiked past 1.5x"` / `"...→ higher hype multiplier"`, crossing back down emits `"Hype cooled below 1.5x"` / `"...decaying back toward its 1.0x neutral baseline → lower hype multiplier"`. `WeeklySnapshot` gained `productQuality`/`hype` fields, threaded through from `engine.ts`'s `tick`. Unit-tested in `digest.test.ts` (cause direction for gains/losses, band-crossing in both directions, only-the-highest-band-reported on a multi-band jump); verified live in a browser across an 11-week run — the feed showed `"Your product quality outpaced Meridian's → +2.0% share."` every notable week)
- [x] Every stat tile has an explainer (`StatTile` gained an optional `explainer` prop rendered as an extra italic line, revealed by tapping the tile — the whole tile is now a `Pressable` with an `accessibilityLabel` of `"{label}: tap for details"`. Wired up for all 6 call sites — HQ's Weekly burn/Revenue/Valuation and Money's Weekly burn/Runway/Valuation — via shared copy in `src/lib/stat-explainers.ts` so the "Weekly burn" and "Valuation" tiles (which appear on both tabs) share one source of truth. Each sentence follows the PRD's "what feeds it, what it feeds" shape, e.g. Revenue: "Product quality × market share × hype × sales effort — feeds valuation and runway." Verified live: tapping "Weekly burn" on HQ revealed "Payroll and fixed costs, trimmed by a CFO burn-cut perk — feeds runway." inline)
- [x] First-run hints show once and never again (persisted flag) (new `FirstRunHint` component (`src/components/game/first-run-hint.tsx`) checks an `AsyncStorage` key (`startup-tycoon/hints/<id>`) on mount and renders a dismissible one-line banner if unseen; the seen-flag is written on dismiss (not on mount) so a quick tab flick before the player reads it doesn't burn the one showing. Wired to the three PRD-specified screens with their literal copy: HQ → "Watch revenue vs. burn.", Team → "Devs raise product quality — quality wins market share.", Money → "Raise before runway drops under 8 weeks or terms get worse." No modal, no forced walkthrough. Verified live: the HQ hint rendered on a fresh run, dismissing it removed it immediately, and a full page reload confirmed it never reappears)

#### PRD features addressed

- F11
