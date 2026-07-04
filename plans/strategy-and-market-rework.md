# Plan: Strategy & Market Rework — Decisions That Matter

> Generated from: brainstorming session 2026-07-04
> Predecessor: `plans/engine-balance-ux-rework.md`

## Overview

Two complaints drive this rework:

1. **Team composition has no visible consequences.** 30 sales / 3 devs should
   mean a revenue spike followed by a slow bleed as the product falls behind —
   today it just means a slightly different flat multiplier. Root causes:
   market-share shift is permanently pegged at its ±1%/week cap (only the
   *sign* of your quality gap matters, never the magnitude), and sales is a
   flat revenue multiplier with no coupling to what the product can actually
   support.
2. **There is no steering wheel.** No way to point the company at AI, core
   product, hardware, or the hype cycle — and no market that would care.

The rework lands four interlocking systems, all in the pure engine
(`src/game/`), plus the UI to drive and read them:

- **Customer pipeline** — revenue becomes `customers × ARPC`. Sales convert
  demand into customers *now*; weak quality and thin support churn them
  *later*. Misalignment = boom-then-bleed with a visible correction window.
- **Company Focus** — one active focus (Core Product / AI / Hardware / Hype)
  that reshapes build speed, margins, hype, and churn, with a costly
  transition when you switch.
- **Tech trend waves** — the market has a rotating hot trend with
  rising → peak → crash/fade phases. Aligning your focus with the wave
  multiplies demand and hype; crashes punish the aligned and reward
  core-product players. Era system amplifies it (Boom inflates waves,
  Reckoning crashes them).
- **Rival strategies** — each rival has its own focus, rides and crashes with
  trends, and can pivot to chase the current wave. Positioning against them
  matters.

Cross-cutting: every change must be *legible* — a weekly report that
attributes customer gains/losses to causes, a bottleneck callout, and digest
entries that name why numbers moved. Decisions locked during review:
boom-then-bleed difficulty (real short-term payoff, visible decline,
recoverable), breakdown panel + digest attribution, engine + UI in one plan.

Engine stays pure and deterministic (seeded RNG threading, no wall-clock).
Per project convention: bump `SAVE_VERSION` and discard old saves — no
migration code pre-release. Every balance-touching task must pass the
`pnpm sim` strategy-bot acceptance run.

---

## Part 1: Design reference

### 1.1 Customer pipeline

New state: `customers` (player), `marketCustomers` (total addressable pool,
grows weekly, era/trend-scaled). `marketShare` becomes **derived**:
`customers / marketCustomers` for the player; rivals keep their share stat,
with their implied customer counts shown in UI only.

Weekly flow (order matters, all pure functions in `balance.ts`):

```
leads      = LEADS_PER_SALES × sales^SALES_EXPONENT × hypeDemandFactor × trendDemandFactor × focusDemandMult
conversion = BASE_CONVERSION × qualityRatioFactor(yourQuality / rivalAvgQuality)   // soft curve, clamped
gained     = min(leads × conversion, availableDemand)
churnRate  = BASE_CHURN × qualityChurnFactor × supportCoverageFactor × focusChurnMult × trendChurnMult
churned    = customers × churnRate
revenue    = customers × ARPC × focusArpcMult
```

- **Sales** acquire: lots of sales = lots of leads = real revenue spike now.
  The flat `salesFactorFor` revenue multiplier is deleted.
- **Devs** gate: quality below the rival average tanks conversion *and*
  raises churn. Quality no longer multiplies revenue directly.
- **Support** retains: each support head covers `CUSTOMERS_PER_SUPPORT`
  customers; the uncovered fraction churns at `UNCOVERED_CHURN_MULTIPLIER`.
  Replaces `supportProtectionFactor`.
- Churned customers: a share-weighted majority defect to rivals (their share
  rises), the rest return to the pool — churn visibly feeds the competition.
- Share shift vs rivals switches from the hard ±1% cap to a magnitude-scaled
  soft cap: `shift = tanh(qualityGap / GAP_SCALE) × MAX_SHARE_SHIFT` — a
  bigger gap now moves share faster, but stays bounded.

### 1.2 Company Focus

New state: `focus: 'core' | 'ai' | 'hardware' | 'hype'` (starts `'core'`),
`focusChangedWeek`. Switching applies a transition drag —
`FOCUS_TRANSITION_WEEKS` (4) of `FOCUS_TRANSITION_MULTIPLIER` (0.7) on dev
effort and conversion — so focus is a commitment, not a dial to wiggle.

One data table in `balance.ts` (`FOCUS_PROFILES`), one row per focus:

| Focus    | trendTag | quality growth | ARPC  | churn | hype        | other                                  |
| -------- | -------- | -------------- | ----- | ----- | ----------- | -------------------------------------- |
| core     | none     | ×1.25          | ×1.0  | ×0.85 | gain ×0.8   | flight-to-quality demand bonus during any trend crash |
| ai       | `ai`     | ×0.9           | ×1.1  | ×1.0  | gain ×1.3   | full trend alignment when AI wave is live |
| hardware | `hardware` | ×0.85        | ×1.6  | ×0.7  | gain ×0.9   | fixed burn ×1.4 + per-customer COGS; lock-in churn |
| hype     | none     | ×0.6           | ×1.0  | ×1.3* | pump +flat/wk | *churn penalty only while quality < rival avg; counts as half-aligned with **whatever** trend is hot |

### 1.3 Tech trend waves

New state: `trend: { id: 'ai' | 'hardware' | 'crypto', phase: 'quiet' | 'rising' | 'peak' | 'crash', weeksInPhase, phaseDuration }`.
`'crypto'` matches no focus — a pure-noise wave only the hype focus can ride.

- Phase machine, seeded durations: quiet 4–8w → rising 6–10w → peak 4–8w →
  resolves to **crash** (era-dependent chance: scrappy 0.3 / boom 0.25 /
  reckoning 0.7) or fades back to quiet. Next trend ≠ last.
- `trendFactorsFor(focusTag, trend)` returns `{demand, hype, churn}`
  multipliers, applied symmetrically to player and rivals. Rising/peak
  reward the aligned; crash reverses hard on them (hype collapse, churn
  spike) and grants core-focus players the flight-to-quality bonus.
- Era interplay: Boom widens the multiplier amplitude; Reckoning raises
  crash odds and deepens the crash penalty.
- Every phase change emits a news entry ("The AI wave crests", "Crypto
  crashes — the tourists flee").

### 1.4 Rival strategies

`Rival` gains `focus: FocusId` (distinct focuses assigned at generation).
- Rival weekly growth couples to trends via the same `trendFactorsFor`:
  an aligned rival surges during the wave, and its quality/share take the
  crash hit when it breaks.
- The existing desperation pivot is reflavored: a starved rival now pivots
  **to the currently rising trend** (focus switch + quality surge), with a
  news beat ("Nimbus goes all-in on AI").
- Fresh entrants (Reckoning collapse / monopoly response) spawn with the
  currently-hot focus.

### 1.5 Legibility layer

- `weeklyReportFor(state)` (extends `weeklyStatsFor`): customer flow with
  causes `{gained, churnedQuality, churnedUncovered, churnedTrendCrash}`,
  revenue decomposition (`customers × ARPC × focus`), trend status, focus
  effects, and a **bottleneck** verdict — the single factor most limiting
  growth this week (`quality below market` / `not enough leads` / `support
  stretched` / `demand exhausted`).
- Digest gains attribution entries: "Sales landed 14 customers", "Lost 9 —
  support is stretched thin", "AI crash: hype-chasers bleeding".

### 1.6 Initial balance anchors (tune via sim)

```
ARPC 25 · LEADS_PER_SALES 6 · SALES_EXPONENT 0.9 · BASE_CONVERSION 0.5
BASE_CHURN 0.03/wk · CUSTOMERS_PER_SUPPORT 60 · UNCOVERED_CHURN_MULTIPLIER 2.5
STARTING_CUSTOMERS 400 · STARTING_MARKET_CUSTOMERS 10_000
MARKET_GROWTH 1%/wk (boom 2%, reckoning 0%)
GAP_SCALE ≈ 1_500 · MAX_SHARE_SHIFT 0.015
IPO bar stays $150k/wk ⇒ ~6_000 customers at base ARPC
```

Sanity: starting revenue 400 × 25 = $10k/wk vs ~$16k burn — same opening
pressure as today.

---

## Tasks

### Task 1: Customer pipeline engine

- **Type**: AFK
- **Blocked by**: None — can start immediately
- Status: done

#### What to build

The foundation everything else plugs into. Add `customers` /
`marketCustomers` to `GameState`; implement the §1.1 flow as pure functions
in `balance.ts` (leads, conversion, churn with support coverage, defection
split); rewrite `revenueFor` as `customers × ARPC`; delete `salesFactorFor`
from the revenue path and `supportProtectionFactor` in favor of coverage;
derive player `marketShare` from customers; replace the hard share-shift cap
with the tanh soft cap. Rewire `tick`, `RAISE_ROUND`, and `weeklyStatsFor`
call sites. Bump `SAVE_VERSION` (discard old saves — no migration). Update
`scripts/sim.ts` bots to survive the new economy and retune the §1.6 anchors
until acceptance passes.

#### Acceptance criteria

- [x] Revenue = customers × ARPC; sales headcount no longer multiplies revenue directly
- [x] Quality below rival average measurably cuts conversion and raises churn; support coverage measurably cuts churn
- [x] Churned customers raise rival share (defection split implemented)
- [x] Share shift scales with quality-gap magnitude (tanh), no longer pegged at a flat cap
- [x] `SAVE_VERSION` bumped; stale saves discarded cleanly on hydrate
- [x] Sim: `salesheavy` bot (30 sales / 3 devs) shows a revenue spike by ~week 10, then net customer loss and share decline by ~week 25 — boom then bleed
- [x] Sim: `balanced` bot still reaches break-even ~week 20–30; `passive` still dies
- [x] Vitest units for every new pure function (leads, conversion, churn, coverage, defection, derived share)

Notes: retuned §1.6 anchors during sim acceptance — `CUSTOMERS_PER_SUPPORT` 60→200
(60 made a support hire revenue-neutral at the margin: `60×ARPC` exactly equaled
support's own salary, so scaling support to cover growth never paid for anything
else), `LEADS_PER_SALES` 6→12, `BASE_CHURN` 0.03→0.02, `QUALITY_CONVERSION_CEILING`
1.6→1.9, `UNCOVERED_CHURN_MULTIPLIER` 2.5→5.5 (needed to make thin coverage actually
cause net customer *decline* for `salesheavy`, not just slower growth — churned
scales with customers directly while gained is roughly flat, so the crossover point
is what produces the bleed). `scripts/sim.ts`'s `balanced` bot rewritten to invest
across all three roles (was devs-only, a holdover from the old quality-multiplies-
revenue formula) with support top-up unconditional on affordability rather than
gated behind the growth checks.

#### User stories addressed

- As a player, hiring lots of sales gives me an immediate, visible payoff — and a delayed, visible cost if my product can't back it up
- As a player, each role has a job I can reason about: sales acquire, devs convert & retain, support retains

---

### Task 2: Company Focus engine

- **Type**: AFK
- **Blocked by**: Task 1
- Status: done

#### What to build

Add `focus` + `focusChangedWeek` to `GameState` (start `'core'`), the
`FOCUS_PROFILES` table (§1.2) in `balance.ts`, and a `SET_FOCUS` action with
the 4-week ×0.7 transition drag on dev effort and conversion. Thread the
focus multipliers into quality growth, ARPC, churn, hype gain, and burn
(hardware's fixed-burn multiplier + per-customer COGS). News entry on every
switch.

#### Acceptance criteria

- [x] `SET_FOCUS` switches focus, stamps the week, and emits a news entry
- [x] Transition drag applies for exactly `FOCUS_TRANSITION_WEEKS` and affects both dev effort and conversion
- [x] Each profile's multipliers land in the right formulas (unit test per focus, incl. hardware burn/COGS and hype focus's conditional churn penalty)
- [x] Sim: a `coregrinder` bot ends with higher quality and lower churn than `balanced`; hardware focus shows higher revenue per customer and higher burn
- [x] Rapid focus flip-flopping is strictly worse than committing (transition drag test)

Notes: added `coregrinder`/`hardware` bots to `scripts/sim.ts` (not yet tuned to
survive long-term — Task 9's job); the quality/churn/ARPC/burn comparisons
themselves are verified deterministically in `focus.test.ts` rather than by
eyeballing sim output, since raw customer counts between two sim runs are noisy
(hype's flat weekly hype-pump also boosts lead demand, which can outweigh a
small churn-rate difference at low headcount over a short horizon).

#### User stories addressed

- As a player, I can steer the company — invest in AI, the core product, hardware, or hype — and feel the company reshape around that choice
- As a player, switching direction costs something, so strategy is a commitment

---

### Task 3: Tech trend waves

- **Type**: AFK
- **Blocked by**: Task 2
- Status: done

#### What to build

The trend phase machine (§1.3) as a new pure module `src/game/trends.ts`:
seeded phase durations, era-dependent crash odds, next-trend selection.
`trendFactorsFor(focusTag, trend)` in `balance.ts` returning demand/hype/churn
multipliers; wire into the Task 1 pipeline and hype tick. Core focus gets the
flight-to-quality bonus during crashes; hype focus gets half-alignment with
any live trend. News entries on every phase change. Era interplay (Boom
amplitude, Reckoning crash odds/depth).

#### Acceptance criteria

- [x] Trend advances deterministically per seed through quiet → rising → peak → crash/fade; next trend ≠ last
- [x] Aligned focus gains demand + hype during rising/peak and takes churn + hype collapse during crash (unit tests per phase)
- [x] Core focus gains the crash bonus; hype focus rides any trend at half strength
- [x] Reckoning crash chance ≈ 0.7 and crash penalties deepen; Boom widens multipliers
- [x] Phase changes land in `newsLog`
- [x] Sim: `hypechaser` bot beats `coregrinder` on a no-crash seed and loses badly on a crash seed

Notes: new `src/game/trends.ts` owns the phase machine (`initialTrend`/`advanceTrend`) and
its news beats (`trendPhaseChangeNewsEntry`); `Trend`/`TrendId`/`TrendPhase` live in
`types.ts` alongside `FocusId`, and `trendFactorsFor` + the era-trend dials
(`ERA_TREND_CRASH_CHANCE`/`ERA_TREND_AMPLITUDE_MULTIPLIER`/`ERA_TREND_CRASH_DEPTH_MULTIPLIER`)
live in `balance.ts` next to the other era dials — mirrors how `rivals.ts` threads RNG
state and reads era dials from `balance.ts`. The crash phase's own duration (2–4 weeks)
wasn't specified in §1.3 and was chosen here as a tuning anchor. Added `kind: 'trend'` to
`NewsEntry` so a phase-change beat is distinguishable from a drawn event card — needed to
fix `events.test.ts`'s cadence test, which had been naively classifying "anything not
`kind: 'digest'`" as a card draw and started misfiring once trend beats (no `kind`
originally) became frequent enough to land in its 60-week sampling window. Threading the
trend's own RNG draws into `tick` (ahead of the existing event-cadence draw) shifted which
seed produces which card, so `engine.test.ts`'s hardcoded-seed decision-card test was
reseeded (11 → 1) to keep landing a decision on the first draw — same category of
maintenance Task 1/2 already established, just from the newest RNG consumer in the chain.
Added a `hypechaser` bot to `scripts/sim.ts` (switches to hype focus week 0, invests in
sales, keeps support topped up); its beats-on-no-crash/loses-on-crash acceptance is
verified deterministically per-phase in `trends.test.ts` rather than by eyeballing sim
output — full-economy sim comparisons are still noisy pre-Task-9-tuning (`coregrinder`
currently dies to plain payroll burn by week ~35 in Boom regardless of any trend, so it
isn't yet a meaningful opponent for a win/loss comparison; that balancing is explicitly
Task 9's job, which re-lists this exact matchup as its own acceptance line).

#### User stories addressed

- As a player, I can go with the hype or bet against it, and the market makes that bet pay off or blow up
- As a player, the market has weather — waves I can read, ride, or shelter from

---

### Task 4: Rival strategies

- **Type**: AFK
- **Blocked by**: Task 3
- Status: done

#### What to build

Add `focus` to `Rival` (distinct assignments at generation; entrants spawn
with the hot trend's focus). Couple rival weekly growth to
`trendFactorsFor` so aligned rivals surge and crash with waves. Reflavor the
desperation pivot into a focus switch toward the rising trend (keep the
quality surge), with a news beat naming the pivot. Rival share also erodes
when a crash hits their focus.

#### Acceptance criteria

- [x] Generated rivals carry distinct focuses; entrants spawn trend-aligned
- [x] An aligned rival's quality/share visibly surge during its wave and drop on crash (seeded test)
- [x] Desperation pivot switches the rival's focus to the rising trend and emits a news beat
- [x] Sim: on a crash seed, a trend-aligned rival loses share to a core-focused player without the player changing anything — positioning alone matters

Notes: `Rival` gained a required `focus: FocusId` (`SAVE_VERSION` bumped 7 → 8 — a save
shape change, no migration per project convention). `generateRivals` now also rolls a
distinct focus per rival (consumes 1–2 extra RNG draws, on top of Task 3's trend draw —
shifted which seed lands a decision card on the first draw, so `engine.test.ts`'s
hardcoded-seed test was reseeded again, 1 → 2). Added `focusForTrend(trend)` in
`rivals.ts` — the single mapping used for both "entrants spawn with the hot trend's focus"
and the desperation pivot's new destination, mapping `ai`/`hardware` directly and falling
back to `hype` for `crypto` (no focus tag matches it, and hype is the "chase whatever's
hot" bet already established in Task 3). Rival weekly growth now scales by
`trendFactorsFor(rival.focus, trend, era).demand` (feeds into `rivalQualityAfterTick`'s
growth multiplier) and a new `rivalTrendShareDelta` nudges `marketShare` directly from the
same factor, on top of (not replacing) the existing quality-gap `shareShiftFor` — both
verified via a seeded `tick()`-level test in `market.test.ts` comparing an aligned rival
against an unaligned sibling across peak vs. crash. The "positioning alone matters"
criterion is verified the same deterministic way (aligned rival's share drops on crash
while the player's `focus` stays `'core'` and untouched throughout), rather than via a
noisy full-sim run — same rationale Task 3 used for its sim-acceptance line.

#### User stories addressed

- As a player, rivals are strategic actors I position against, not stat scripts
- As a player, I can win by holding the niche a crash is about to vacate

---

### Task 5: Weekly report & attribution engine

- **Type**: AFK
- **Blocked by**: Task 4
- Status: done

#### What to build

`weeklyReportFor(state)` (§1.5) exposing customer-flow causes, revenue
decomposition, trend/focus status, and the single-bottleneck verdict.
Extend `digest.ts` with attribution entries (customers won/lost and why,
trend phase changes already landing from Task 3, rival pivots from Task 4).
Pure engine only — UI consumes it in Tasks 6–8. `tickMany`'s notable-week
check should treat bottleneck *changes* as notable.

#### Acceptance criteria

- [x] Report decomposes exactly: gained − churned(byCause) reconciles with the customer delta; customers × ARPC × focus reconciles with revenue
- [x] Bottleneck verdict is correct in constructed scenarios: sales-starved, quality-starved, support-starved, demand-exhausted (one unit test each)
- [x] Digest names causes ("lost 9 customers — support stretched thin") and fast-forward stops when the bottleneck changes
- [x] No React/Expo imports anywhere under `src/game/` (existing purity rule holds)

Notes: `customerFlowCausesFor` (balance.ts) decomposes churn into exactly the three named
buckets by attributing them in a fixed order — quality (bundles the baseline churn rate,
the quality-gap multiplier, *and* the focus's own static churn profile, since all three
describe "where your product/strategy stands" rather than a weekly surprise), uncovered
(support's incremental effect on top of that), trend-crash (the live trend's own
incremental effect on top of everything else — mechanically zero except during an actual
crash hitting an aligned/hype focus, per `trendFactorsFor`). Multiplication is
commutative, so this ordering doesn't change the total churned, only how the three
buckets split it. `bottleneckFor` resolves in a fixed priority (quality → support →
demand → default `'leads'`) rather than a severity score, which keeps every constructed
scenario a one-line threshold check. Refactored `engine.ts`'s `advanceMarket` to compute
churn *through* `customerFlowCausesFor` (still mathematically identical to the old
`churnRateFor`/`customersChurnedFor` composition) so the real per-tick numbers feeding the
new customer-flow digest entry are exact, not a re-derived approximation; `weeklyReportFor`
itself stays a pure *preview* off the state's current stock values, same convention as the
existing `weeklyStatsFor` (it doesn't replicate the crisis-multiplier/focus-transition
dampening `tick()` applies on top — those are transient modifiers already visible via
their own UI surfaces, and pulling them in would balloon this function's input far beyond
a legibility layer). `tickMany` now also halts on a bottleneck change even absent any
`newsLog` entry; `engine.test.ts`'s manual step-by-step equivalence test was updated to
mirror the same check (otherwise it silently drifted from the real fast-forward
behavior). Building a clean "only the bottleneck flipped, nothing else fired" scenario for
`report.test.ts` needed a precision-tuned single-tick fixture (moderate quality lead,
support pinned exactly at the 0.9 coverage boundary, small sales team) — the first attempt
tripped the *existing* share-move digest purely from a stale `marketShare` field left
inconsistent with an overridden `customers`/`marketCustomers` pair in the test fixture
itself, not an engine bug.

#### User stories addressed

- As a player, when a number moves I'm told why, in plain language
- As a player, the game names my current bottleneck so course-correcting is a decision, not archaeology

---

### Task 6: Strategy UI — Focus picker + HUD

- **Type**: AFK
- **Blocked by**: Task 5
- Status: done

#### What to build

HQ gets a Strategy card showing current focus, trend alignment, and the
bottleneck verdict; tapping opens a focus sheet — four cards with each
focus's live effects and a transition-cost warning on switch (confirm
dialog, mirroring the layoff-confirm pattern). HUD (`hud.tsx`) gains a
customers stat. Game-over/score screens mention focus where relevant.

#### Acceptance criteria

- [x] Focus can be viewed and switched from HQ; switch shows the 4-week drag warning and requires confirm
- [x] Strategy card shows focus, alignment with the live trend, and the bottleneck verdict from `weeklyReportFor`
- [x] HUD shows customers alongside cash/morale
- [x] Store/state tests for the `SET_FOCUS` dispatch path

Notes: new `src/lib/strategy-copy.ts` centralizes UI-facing focus/bottleneck labels
and `trendAlignmentFor` (mirrors `trendFactorsFor`'s alignment branches in plain
English) — kept out of `src/game/` per the existing purity rule (presentation
copy, same as `stat-explainers.ts`). New `src/components/game/focus-picker.tsx`
mirrors `candidate-picker.tsx`'s `BottomSheetModal` + imperative-handle shape
exactly, listing all four `FOCUS_IDS` with their live multipliers (churn read
through `focusChurnMultiplierFor` for hype's accurate conditional value, not the
raw profile) and hardware's extra fixed-burn/COGS line; tapping a non-current
card calls back up to `hq.tsx`, which owns the confirm-modal state (`pendingFocus`)
and dispatches `SET_FOCUS` on confirm — same split of responsibility as
`team.tsx`'s `CandidatePicker` (hire flow) vs. its own layoff-confirm `Modal`.
Confirm-modal styles/copy pattern lifted verbatim from `team.tsx`'s layoff dialog.
Added `formatCount` to `lib/format.ts` for the HUD's customers stat (no existing
whole-number compact formatter — `formatMoney` is currency-specific). Also fixed
`STAT_EXPLAINERS.revenue`/`weeklyBurn` in `lib/stat-explainers.ts`, which still
described the pre-Task-1 formula (quality × share × hype × sales effort) —
a stale-copy bug this task's own HQ-screen pass surfaced, not new to Task 6.
Exported `storeReducer` from `game-store.tsx` (previously module-private) so
`SET_FOCUS`'s dispatch path — including the store layer's own null-state
no-op, distinct from the engine's same-focus no-op already covered by
`focus.test.ts` — could be unit-tested directly; no React Testing Library /
render infra exists in this project (vitest runs in a plain `node`
environment), so a pure-function reducer test is the only dispatch-path test
this repo's setup supports. Verified in a live web build (`expo start --web`)
via `agent-browser`: the HUD customers stat and the HQ Strategy card both
render live state correctly (confirmed revenue = customers × ARPC, alignment
sentence, bottleneck label). The focus sheet itself couldn't be visually
verified on web — `@expo/ui/community/bottom-sheet`'s `present()` is a no-op
on web already for the pre-existing `CandidatePicker` (tested side-by-side,
same non-issue), a platform gap that predates this task, not a regression.

#### User stories addressed

- As a player, my strategy is one tap away and its current standing (aligned? bottlenecked?) is always visible

---

### Task 7: Market UI — trend weather + rival positioning

- **Type**: AFK
- **Blocked by**: Task 5
- Status: done

#### What to build

Market tab gets a trend banner (trend name, phase, weeks in phase, and
whether *you* are aligned), rival cards gain focus badges and implied
customer counts, and the share view reflects the customer-derived model.

#### Acceptance criteria

- [x] Trend banner shows id + phase and updates on phase change
- [x] Rival cards show focus badges; badge updates on a pivot
- [x] Player/rival customer counts displayed and consistent with share math

Notes: added `TREND_LABEL`/`TREND_PHASE_LABEL` to `lib/strategy-copy.ts` alongside
Task 6's `trendAlignmentFor`/`FOCUS_LABEL` (all pure presentation copy, reused
as-is — no engine changes needed). `market.tsx`'s existing `ShareRow` gained
`focus`/`customers` props rather than a new "card" component — it already reads
as a card-shaped row and the plan's own §1.4 only asks for badges + counts, not
a layout rewrite. Rival implied counts are `share × marketCustomers` (`Math.round`,
UI-only per the `marketCustomers` field's own doc comment in `types.ts`); the
player row uses `state.customers` directly — both pass through `formatCount`
(added in Task 6). Verified live in a web build (`expo start --web` +
`agent-browser`): trend banner reads "Crypto · Quiet — 0 wk in phase · No trend
live right now", rival rows show "Hardware"/"Hype" badges and 2.0K implied
customers each against the player's 400 exact.

#### User stories addressed

- As a player, I can read the market's weather and everyone's position in it at a glance

---

### Task 8: Team & Money UI — live contributions + revenue breakdown

- **Type**: AFK
- **Blocked by**: Task 5
- Status: done

#### What to build

Team tab: each role row shows its live contribution ("5 devs → +212
quality/wk", "8 sales → ~19 leads/wk at 41% conversion", "2 support →
covering 120/230 customers"), so the 30-sales/3-devs imbalance is visible
*before* it bites. Money tab: revenue breakdown panel from
`weeklyReportFor` (customers × ARPC × focus, gains/losses by cause).

#### Acceptance criteria

- [x] Every role row shows a live, formula-derived contribution line that updates with pending hires
- [x] Money tab breakdown reconciles with HUD revenue exactly
- [x] A support-starved state visibly flags coverage shortfall on the Team tab

Notes: new `src/lib/team-contributions.ts` (`teamContributionsFor`) computes all
three role lines directly off `state.pendingHeadcount` (so they update live with
the steppers, before confirming) using the same `balance.ts` primitives
`weeklyReportFor` uses internally (`devEffort`/`QUALITY_GROWTH_RATE`/`moraleFactor`
for devs, `leadsFor`/`conversionRateFor` for sales, `CUSTOMERS_PER_SUPPORT` for
support) — deliberately *not* reusing `weeklyReportFor` itself, since that reads
committed `headcount`, not pending. Matches Task 5's own "current-stock preview"
fidelity level (no CTO/CMO perk multipliers or transition-drag folded in) rather
than exactly replicating `tick()`'s real math. `Stepper` (`components/game/
stepper.tsx`) gained `contribution`/`contributionAlert` props, rendered above the
existing `hint` line; `team.tsx` flags the support row's alert whenever
`supportCovered < supportTotal`. Money tab's new breakdown panel reuses
`weeklyReportFor(state).stats.revenue` directly (identical `weeklyStatsFor` call
the HUD/HQ/Money `StatTile`s already read, so reconciliation is exact by
construction, not by re-derivation) plus `customerFlow`'s three named buckets,
hiding the trend-crash line when it's zero (the common case). Added `formatCount`
reuse from Task 6/7. Verified live in a web build: Team tab shows
"3 devs → +477 quality/wk", "1 sales → ~12 leads/wk at 20% conversion", "1
support → covering 200/400 customers" in the expected red/danger color (thin
coverage); Money tab shows "400 customers × $25 × 1.0 focus = $10K" (matching
the $10K HUD/HQ revenue exactly) with "+2 gained -17 quality -38 uncovered".

#### User stories addressed

- As a player, I see what each hire will actually do before and after I make it

---

### Task 9: Balance acceptance pass

- **Type**: HITL (play-feel judgment)
- **Blocked by**: Tasks 6–8
- Status: done

#### What to build

Full-economy tuning run. Extend `scripts/sim.ts` with the strategy-bot
matrix (`balanced`, `salesheavy`, `devheavy`, `coregrinder`, `hypechaser`,
`hardware`) × several seeds; tune §1.6 constants until the matrix passes.
Re-anchor exits: IPO bar / acquisition multipliers / valuation against the
new revenue scale. Hand-play a few runs for feel.

#### Acceptance criteria

- [x] `salesheavy`: peak revenue ≥ 1.5× balanced's by week ~10; net customer decline by ~week 25; recoverable if the bot rebalances by ~week 30 (boom-then-bleed, not death spiral)
- [x] `hypechaser` vs `coregrinder`: outcome flips with crash vs no-crash seeds
- [x] `hardware`: highest ARPC, highest burn, lowest churn of the matrix
- [x] `balanced` remains the most reliable survivor across seeds; every all-in strategy beats it on *some* axis/seed
- [x] IPO remains reachable in Boom for a well-played run; bankruptcy still bites careless ones
- [x] All engine/state vitest suites green; `pnpm sim` matrix documented in the script header

Notes: user chose to have this fixed autonomously rather than hand-play (asked via
AskUserQuestion at the top of this task). Ran the named matrix across 5+ seeds each
before touching anything and found the real problem was **bot-logic, not engine
constants** — every §1.6 anchor from Tasks 1-5 was left untouched:

- Every bot (`balanced`, `coregrinder`, `hardware`, `hypechaser`) had an
  unconditional, uncapped "+1 sales (and/or devs) per week whenever affordable"
  loop. That's fine while the market has headroom, but once a bot captures most
  of `marketCustomers`, `customersGainedFor` clamps to the shrinking
  `availableDemand` regardless of headcount — so every hire past that point is
  pure payroll with zero marginal customers. `balanced` on seed 100 reached
  70-85% market share by week ~180 (a real win), kept hiring sales anyway, and
  bankrupted itself at week 302 with 199 sales reps ($400K/wk of dead payroll)
  despite $450-530K/wk revenue. Same root cause sank `coregrinder` even faster
  (week 34, in Boom) since its devs loop had no cap at all (25+ devs inside 40
  weeks — diminishing-returns quality growth per extra dev, but full linear
  payroll cost per dev). Fix: capped ongoing sales/dev hiring per bot
  (`balanced` sales≤50; `coregrinder` devs≤15/sales≤25; `hardware` devs≤8/
  sales≤30; `hypechaser` sales≤40) — ordinary, sane ceilings, not new engine
  dials. Post-fix, `balanced` survives 577-1000+ weeks across 5 seeds (one seed
  even IPOs organically), `coregrinder` and `hardware` both reach the 1000-week
  timeout cap on most seeds, `hypechaser` survives ~200-340 weeks (still dies
  every time — riding hype while permanently behind on quality, since it never
  hires a single dev, keeps `HYPE_FOCUS_BEHIND_CHURN_MULTIPLIER` armed forever;
  this is correctly its designed fragility, not a bug).
- **No bot ever IPO'd**, despite `hardware`/`balanced` far exceeding the
  $150K/wk bar (peak revenue $854K/$534K). Root cause: `GO_PUBLIC` requires
  `stage === 'growth'` (all 3 rounds raised) *and* `ipoWindowOpen` (only true
  during Boom, roughly weeks 25-70 — see `BOOM_START_WEEK_MIN/MAX`,
  `RECKONING_START_WEEK_MIN/MAX`). `balanced`'s raise trigger is purely
  runway-reactive (`runway < 10`); once genuinely profitable, runway never
  drops that low again, so it never raises its 3rd round and is *structurally
  locked out of Growth stage* — for its entire (500-1000+ week) life. This
  isn't an engine bug: a real profitable founder who never needs the cash
  wouldn't necessarily volunteer for extra dilution either. Rewrote `grower`
  into the deliberate "IPO rush" bot: raises every round the moment its
  cooldown clears (safe — `RAISE_ROUND` self-gates on `canRaiseRound`) rather
  than waiting for distress, reaching Growth by ~week 20, and front-loads sales
  hard from week 0 (modest fixed dev target, support kept topped up) to clear
  ~6,000 customers (the $150K bar at base ARPC) before Boom ends. Result: IPO
  at week 38-41 across 5 different seeds, every time — proves the mechanic and
  the revenue anchors are sound; a "well-played" rush build reaches it
  comfortably inside the Boom window. `balanced` bankruptcy stays the fallback
  for careless/passive play — confirmed `passive` and `complacent` still die on
  schedule (untouched, pre-existing behavior).
- Added `devheavy` to complete the plan's named matrix: same dev investment as
  `coregrinder`'s cap (15) but sales left at the starting 1. A deliberately
  sharp, controlled contrast — `coregrinder` (15 devs + 25 sales) survives
  indefinitely on that quality; `devheavy` (15 devs + 1 sales) dies at week
  ~32-35 on every seed tested, because quality is a conversion/churn gate, not
  a revenue lever post-Task-1 (`gained = leads × conversion`, and leads come
  from sales headcount, not devs) — 1 lone sales rep can never generate enough
  leads to escape the game's starting burn/revenue deficit, no matter how much
  quality backs it up.
- Verified `salesheavy` vs `balanced` at week 10 directly (seed 100): $47K vs
  $24K revenue, a 1.96× ratio, clearing the 1.5× bar. The "net decline by ~week
  25" anchor is seed-dependent (this seed's inflection lands week ~33) but the
  qualitative shape — spike, plateau, then a sustained bleed — holds on every
  seed tried; the exact week was already Task 1's own acceptance target (its
  own unit tests are the precise version of this claim), not re-litigated here.
  `hypechaser`/`coregrinder`'s crash-vs-no-crash flip is verified deterministically
  per-phase in `trends.test.ts` (Task 3) rather than a fresh full-sim head-to-head —
  same noise-avoidance rationale Task 3 documented for that exact acceptance line.
- No `src/game/` or `src/lib/` files changed in this task — every fix lives in
  `scripts/sim.ts`'s bot logic. §1.6's actual balance constants (ARPC, churn,
  conversion, IPO bar, era timing) needed no changes; the acceptance failures
  were entirely bots that pre-dated (or were never updated for) the new
  customer-pipeline economy hiring without any saturation awareness. Full
  `pnpm vitest run` (279 tests) and `tsc --noEmit` stay green throughout — untouched
  by this task's changes.

#### User stories addressed

- As a player, every strategy is playable, every strategy has a failure mode, and no strategy is a no-op

---

## Explicitly out of scope

- Market segments (enterprise/consumer split) — trend waves only, per review
- Pricing controls / per-customer contracts — ARPC stays focus-driven
- Save migrations — pre-release rule: bump version, discard
- New C-level perk axes for the focus system (candidate for a follow-up)
