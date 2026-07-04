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
- Status: pending

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

- [ ] Revenue = customers × ARPC; sales headcount no longer multiplies revenue directly
- [ ] Quality below rival average measurably cuts conversion and raises churn; support coverage measurably cuts churn
- [ ] Churned customers raise rival share (defection split implemented)
- [ ] Share shift scales with quality-gap magnitude (tanh), no longer pegged at a flat cap
- [ ] `SAVE_VERSION` bumped; stale saves discarded cleanly on hydrate
- [ ] Sim: `salesheavy` bot (30 sales / 3 devs) shows a revenue spike by ~week 10, then net customer loss and share decline by ~week 25 — boom then bleed
- [ ] Sim: `balanced` bot still reaches break-even ~week 20–30; `passive` still dies
- [ ] Vitest units for every new pure function (leads, conversion, churn, coverage, defection, derived share)

#### User stories addressed

- As a player, hiring lots of sales gives me an immediate, visible payoff — and a delayed, visible cost if my product can't back it up
- As a player, each role has a job I can reason about: sales acquire, devs convert & retain, support retains

---

### Task 2: Company Focus engine

- **Type**: AFK
- **Blocked by**: Task 1
- Status: pending

#### What to build

Add `focus` + `focusChangedWeek` to `GameState` (start `'core'`), the
`FOCUS_PROFILES` table (§1.2) in `balance.ts`, and a `SET_FOCUS` action with
the 4-week ×0.7 transition drag on dev effort and conversion. Thread the
focus multipliers into quality growth, ARPC, churn, hype gain, and burn
(hardware's fixed-burn multiplier + per-customer COGS). News entry on every
switch.

#### Acceptance criteria

- [ ] `SET_FOCUS` switches focus, stamps the week, and emits a news entry
- [ ] Transition drag applies for exactly `FOCUS_TRANSITION_WEEKS` and affects both dev effort and conversion
- [ ] Each profile's multipliers land in the right formulas (unit test per focus, incl. hardware burn/COGS and hype focus's conditional churn penalty)
- [ ] Sim: a `coregrinder` bot ends with higher quality and lower churn than `balanced`; hardware focus shows higher revenue per customer and higher burn
- [ ] Rapid focus flip-flopping is strictly worse than committing (transition drag test)

#### User stories addressed

- As a player, I can steer the company — invest in AI, the core product, hardware, or hype — and feel the company reshape around that choice
- As a player, switching direction costs something, so strategy is a commitment

---

### Task 3: Tech trend waves

- **Type**: AFK
- **Blocked by**: Task 2
- Status: pending

#### What to build

The trend phase machine (§1.3) as a new pure module `src/game/trends.ts`:
seeded phase durations, era-dependent crash odds, next-trend selection.
`trendFactorsFor(focusTag, trend)` in `balance.ts` returning demand/hype/churn
multipliers; wire into the Task 1 pipeline and hype tick. Core focus gets the
flight-to-quality bonus during crashes; hype focus gets half-alignment with
any live trend. News entries on every phase change. Era interplay (Boom
amplitude, Reckoning crash odds/depth).

#### Acceptance criteria

- [ ] Trend advances deterministically per seed through quiet → rising → peak → crash/fade; next trend ≠ last
- [ ] Aligned focus gains demand + hype during rising/peak and takes churn + hype collapse during crash (unit tests per phase)
- [ ] Core focus gains the crash bonus; hype focus rides any trend at half strength
- [ ] Reckoning crash chance ≈ 0.7 and crash penalties deepen; Boom widens multipliers
- [ ] Phase changes land in `newsLog`
- [ ] Sim: `hypechaser` bot beats `coregrinder` on a no-crash seed and loses badly on a crash seed

#### User stories addressed

- As a player, I can go with the hype or bet against it, and the market makes that bet pay off or blow up
- As a player, the market has weather — waves I can read, ride, or shelter from

---

### Task 4: Rival strategies

- **Type**: AFK
- **Blocked by**: Task 3
- Status: pending

#### What to build

Add `focus` to `Rival` (distinct assignments at generation; entrants spawn
with the hot trend's focus). Couple rival weekly growth to
`trendFactorsFor` so aligned rivals surge and crash with waves. Reflavor the
desperation pivot into a focus switch toward the rising trend (keep the
quality surge), with a news beat naming the pivot. Rival share also erodes
when a crash hits their focus.

#### Acceptance criteria

- [ ] Generated rivals carry distinct focuses; entrants spawn trend-aligned
- [ ] An aligned rival's quality/share visibly surge during its wave and drop on crash (seeded test)
- [ ] Desperation pivot switches the rival's focus to the rising trend and emits a news beat
- [ ] Sim: on a crash seed, a trend-aligned rival loses share to a core-focused player without the player changing anything — positioning alone matters

#### User stories addressed

- As a player, rivals are strategic actors I position against, not stat scripts
- As a player, I can win by holding the niche a crash is about to vacate

---

### Task 5: Weekly report & attribution engine

- **Type**: AFK
- **Blocked by**: Task 4
- Status: pending

#### What to build

`weeklyReportFor(state)` (§1.5) exposing customer-flow causes, revenue
decomposition, trend/focus status, and the single-bottleneck verdict.
Extend `digest.ts` with attribution entries (customers won/lost and why,
trend phase changes already landing from Task 3, rival pivots from Task 4).
Pure engine only — UI consumes it in Tasks 6–8. `tickMany`'s notable-week
check should treat bottleneck *changes* as notable.

#### Acceptance criteria

- [ ] Report decomposes exactly: gained − churned(byCause) reconciles with the customer delta; customers × ARPC × focus reconciles with revenue
- [ ] Bottleneck verdict is correct in constructed scenarios: sales-starved, quality-starved, support-starved, demand-exhausted (one unit test each)
- [ ] Digest names causes ("lost 9 customers — support stretched thin") and fast-forward stops when the bottleneck changes
- [ ] No React/Expo imports anywhere under `src/game/` (existing purity rule holds)

#### User stories addressed

- As a player, when a number moves I'm told why, in plain language
- As a player, the game names my current bottleneck so course-correcting is a decision, not archaeology

---

### Task 6: Strategy UI — Focus picker + HUD

- **Type**: AFK
- **Blocked by**: Task 5
- Status: pending

#### What to build

HQ gets a Strategy card showing current focus, trend alignment, and the
bottleneck verdict; tapping opens a focus sheet — four cards with each
focus's live effects and a transition-cost warning on switch (confirm
dialog, mirroring the layoff-confirm pattern). HUD (`hud.tsx`) gains a
customers stat. Game-over/score screens mention focus where relevant.

#### Acceptance criteria

- [ ] Focus can be viewed and switched from HQ; switch shows the 4-week drag warning and requires confirm
- [ ] Strategy card shows focus, alignment with the live trend, and the bottleneck verdict from `weeklyReportFor`
- [ ] HUD shows customers alongside cash/morale
- [ ] Store/state tests for the `SET_FOCUS` dispatch path

#### User stories addressed

- As a player, my strategy is one tap away and its current standing (aligned? bottlenecked?) is always visible

---

### Task 7: Market UI — trend weather + rival positioning

- **Type**: AFK
- **Blocked by**: Task 5
- Status: pending

#### What to build

Market tab gets a trend banner (trend name, phase, weeks in phase, and
whether *you* are aligned), rival cards gain focus badges and implied
customer counts, and the share view reflects the customer-derived model.

#### Acceptance criteria

- [ ] Trend banner shows id + phase and updates on phase change
- [ ] Rival cards show focus badges; badge updates on a pivot
- [ ] Player/rival customer counts displayed and consistent with share math

#### User stories addressed

- As a player, I can read the market's weather and everyone's position in it at a glance

---

### Task 8: Team & Money UI — live contributions + revenue breakdown

- **Type**: AFK
- **Blocked by**: Task 5
- Status: pending

#### What to build

Team tab: each role row shows its live contribution ("5 devs → +212
quality/wk", "8 sales → ~19 leads/wk at 41% conversion", "2 support →
covering 120/230 customers"), so the 30-sales/3-devs imbalance is visible
*before* it bites. Money tab: revenue breakdown panel from
`weeklyReportFor` (customers × ARPC × focus, gains/losses by cause).

#### Acceptance criteria

- [ ] Every role row shows a live, formula-derived contribution line that updates with pending hires
- [ ] Money tab breakdown reconciles with HUD revenue exactly
- [ ] A support-starved state visibly flags coverage shortfall on the Team tab

#### User stories addressed

- As a player, I see what each hire will actually do before and after I make it

---

### Task 9: Balance acceptance pass

- **Type**: HITL (play-feel judgment)
- **Blocked by**: Tasks 6–8
- Status: pending

#### What to build

Full-economy tuning run. Extend `scripts/sim.ts` with the strategy-bot
matrix (`balanced`, `salesheavy`, `devheavy`, `coregrinder`, `hypechaser`,
`hardware`) × several seeds; tune §1.6 constants until the matrix passes.
Re-anchor exits: IPO bar / acquisition multipliers / valuation against the
new revenue scale. Hand-play a few runs for feel.

#### Acceptance criteria

- [ ] `salesheavy`: peak revenue ≥ 1.5× balanced's by week ~10; net customer decline by ~week 25; recoverable if the bot rebalances by ~week 30 (boom-then-bleed, not death spiral)
- [ ] `hypechaser` vs `coregrinder`: outcome flips with crash vs no-crash seeds
- [ ] `hardware`: highest ARPC, highest burn, lowest churn of the matrix
- [ ] `balanced` remains the most reliable survivor across seeds; every all-in strategy beats it on *some* axis/seed
- [ ] IPO remains reachable in Boom for a well-played run; bankruptcy still bites careless ones
- [ ] All engine/state vitest suites green; `pnpm sim` matrix documented in the script header

#### User stories addressed

- As a player, every strategy is playable, every strategy has a failure mode, and no strategy is a no-op

---

## Explicitly out of scope

- Market segments (enterprise/consumer split) — trend waves only, per review
- Pricing controls / per-customer contracts — ARPC stays focus-driven
- Save migrations — pre-release rule: bump version, discard
- New C-level perk axes for the focus system (candidate for a follow-up)
