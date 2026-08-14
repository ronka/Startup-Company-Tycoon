# Hire Roll — implementation plan

Replaces the standing 6-candidate C-level offer with a spin. Design rationale and odds live in `2026-08-14-hire-roll.md`; this file is the build order.

Prototype (validated): `prototypes/2026-08-14-hire-roll.html`

---

## Decisions locked

| Question | Answer |
| --- | --- |
| "Day" for the roll budget | **Real calendar day**, like `WEEKS_PER_DAY` |
| Can a source be all-bad? | **Yes** — both candidates weak. Recourse is another roll |
| Legend reachability | **Rare but possible at any stage**, including Garage |
| Rolls per day | **2**, shared across all three seats, banking to **6** |
| Candidates per roll | **2**, always on different perk axes |
| A legend roll | offers **two different** legends |
| Ex-company display | every candidate shows a `from` line — **the ex-company when they came from one**, their relation to you when they did not |

---

## What the wheel lands on

Two kinds of source, matching the original pitch — *"a company, or a type of cluster of candidates"*:

- **Company tiers** (`scrappy` / `mid` / `elite` / `legend`) — the wheel lands on **one company**. Both candidates came from it, and each card shows it: `Denise Vance · ex-Groupoon`. Legends carry the company they're famous for: `Jensen Wong · ex-Nvidiaa`.
- **Cluster tiers** (`desperate` / `personal`) — the wheel lands on the **type** of connection. Each candidate then draws their own relation, so one roll never shows the same person twice: `Sandra Braddock · the intern who got good` next to `Nigel Renk · you studied together`.

This is what `CandidatePicker` already renders today — `{candidate.name} · {candidate.exEmployer}`. The field is just becoming meaningful for every tier instead of only the three company ones.

Verified output from the prototype:

```
WHEEL -> Your own network
    Sandra Braddock · the intern who got good    $3,300/wk   +11% dev productivity
    Nigel Renk · you studied together            $4,200/wk   −14% tech-debt drag

WHEEL -> ex-Groupoon
    Denise Vance · ex-Groupoon                   $6,000/wk   −16% tech-debt drag
    Barry Ottway · ex-Groupoon                   $6,800/wk   +24% dev productivity

WHEEL -> ★ A LEGEND WALKED IN
    Steve Jobbz · ex-Applle                     $61,800/wk   +73% dev productivity
    Jensen Wong · ex-Nvidiaa                    $69,000/wk   −83% tech-debt drag
```

---

## Task 1 — Tier data (`src/game/clevels.ts`)
Status: done

Built as specified, with four deliberate departures — each forced by the data already in `clevels.ts`:

- **`PerkBand` lives in `types.ts`**, not `clevels.ts`. `STAGE_WEIGHTS` and `CLevelCandidate.tier` both need it and `types.ts` imports nothing from `clevels.ts`.
- **Kept `exEmployer` as the field name** rather than renaming to `from`. It is already rendered and already persisted, so keeping it shrinks the save-shape problem in Task 4 to one field (`tier`). Its doc comment now says it carries relations too.
- **Every band needs a tier on *every* axis of its role** — 3 axes for cto, 2 each for cmo/cfo — or Task 2's "two candidates on different axes" is unsatisfiable. That is 14 new `PERK_TABLE` entries, not 3.
- **Salary/perk figures adjusted from the table above.** `personal` tops out at **$4,400**, not $5,200: cmo `scrappy` starts at $5,000, so $5,200 would have overlapped it. And perk strength has to stay *monotonic per axis* — where an axis's `scrappy` rung is only +10%, `desperate`/`personal` land at +4%/+7% rather than the doc's headline 4–18%.

**Non-overlap is scoped per role, on raw ranges.** Bands overlap *across* roles today (cmo `mid` sits inside cto `scrappy`) and always have — the existing comment says "never overlap *within an axis*". Two tests now guard it: per-axis and per-role-per-band. Quirk-adjusted extremes are deliberately not tested — cto `scrappy` max ×1.04 and cto `mid` min ×0.96 both round to exactly $7,100 on the existing balance-checked data.

No behaviour change yet. Widen the existing tables so everything downstream has data to draw on.

1. Extend `PerkBand`: `'desperate' | 'personal' | 'scrappy' | 'mid' | 'elite' | 'legend'`.
2. Rename `EX_EMPLOYERS` → `COMPANIES`, keyed by the three company bands only. Add `ex-Groupoon` to `scrappy`.
3. Add `RELATIONS: Record<'desperate' | 'personal', string[]>` — the per-candidate connection lines.
4. Add `IS_COMPANY_TIER: Record<PerkBand, boolean>`.
5. Add `LEGENDS: Record<CLevelRole, { name; from; flavour }[]>` — 4 per role, parody names, each with the company they're famous for.
6. Add `PERK_TABLE` entries for the three new bands. **Salary ranges must not overlap across bands** — that is what makes "better costs more" structural rather than tuned:

   | Band | Salary/wk | Perk strength |
   | --- | --- | --- |
   | desperate | $1,800–2,800 | 4–10% |
   | personal | $3,200–5,200 | 10–18% |
   | scrappy *(exists)* | $6,000–7,000 | 16–26% |
   | mid *(exists)* | $7,600–9,500 | 26–38% |
   | elite *(exists)* | $24,000–31,000 | 36–55% |
   | legend | $52,000–78,000 | 60–95% |

7. Add `from: string` to `CLevelCandidate` (and `tier: PerkBand`). Keep `exEmployer` as the field name if you prefer — it is already rendered — but the value now covers relations too, so `from` reads truer.

**Test:** extend the existing `isDominated` / `perkPower` property test in `clevels.test.ts` to cover all six bands. Add a test asserting no two bands' salary ranges overlap.

---

## Task 2 — The roll (`src/game/clevels.ts`)
Status: done

Signature landed as `roll(rng, role, stage) → { offer: CLevelOffer; rng }`, with `CLevelOffer = { tier; source; candidates }` in `types.ts`. **No separate `company` field**: `source` is the banner text and `IS_COMPANY_TIER[tier]` says how to read it, so there is one string to render instead of two that can disagree.

"Salary tracks perk strength within the band" needed a definition the fixed-tier table does not supply — perk power is only comparable within an axis, and a roll's two candidates are on different ones. Implemented as: draw each salary from its own tier's range, then, if the pair's headline numbers differ (`|1 − multiplier|`), swap the two price tags so the bigger number is the dearer. Both candidates are in the same band, so a swap never leaks outside the band's span. The quirk travels with the salary it explains.

Sample output at seed 9 (`growth/cto`):

```
WHEEL -> A legend walked in  [legend]
   Elon Muskk · ex-Tesler       $53,000/wk   +60% dev productivity
   Sundar Pichaii · ex-Foogle   $75,800/wk   +90% dev productivity, +70% tech-debt drag
```

Pure, seeded, engine-side. This is the core of the feature.

```ts
export const STAGE_WEIGHTS: Record<Stage, Record<PerkBand, number>>
export function rollTier(rng: RngState, stage: Stage): [PerkBand, RngState]
export function roll(rng: RngState, role: CLevelRole, stage: Stage):
  { offer: { tier; source; company; candidates }, rng: RngState }
```

`STAGE_WEIGHTS` (`Stage` already exists on `GameState`):

| Band | Garage | Seed | Series A | Growth |
| --- | --- | --- | --- | --- |
| desperate | 40 | 20 | 8 | 2 |
| personal | 32 | 30 | 20 | 10 |
| scrappy | 20 | 28 | 27 | 20 |
| mid | 6 | 15 | 25 | 28 |
| elite | 1.5 | 5 | 15 | 30 |
| **legend** | **0.5** | **2** | **5** | **10** |

Rules `roll()` must enforce, all validated in the prototype:

- Company tier → pick **one** company; both candidates share it.
- Cluster tier → each candidate draws its **own** relation.
- The two candidates always sit on **different perk axes**.
- A legend roll yields **two different** legends.
- Salary tracks perk strength **within** the band, so the stronger candidate in a pair always costs more.

**Test:** roll 40,000 times per stage and assert the tier histogram matches the table within tolerance. Assert no roll ever returns two candidates on the same axis, or two identical legends. These are the tests that protect the feel.

---

## Task 3 — Roll budget (`src/state/roll-budget.ts`)
Status: done

Built as specified, plus one addition the plan implies but does not name: `isRollBudgetExhausted(budget, devFreePlay)`, the single wall predicate the store's gate and the picker chrome will both read — same reason `isWeekBudgetExhausted` exists. A `null` budget (AsyncStorage unresolved) is deliberately *not* exhausted.

Store wiring landed: `ROLL_STORAGE_KEY`, load-and-refresh in the mount effect next to the week budget, its own persist effect, `rollBudget` on the context, and a reset in `resetAll`. The dispatch gate itself is Task 4.

Copy `week-budget.ts`'s shape exactly — same purity rules, same `now: Date` argument style, same test approach. Store layer only; `src/game/` never sees a clock.

```ts
export const ROLLS_PER_DAY = 2;
export const ROLLS_BANK_CAP = 6;
export interface RollBudget { lastSessionDate: string; rollsRemaining: number; }
initialRollBudget(now) · refreshRollBudget(budget, now) · canRoll(budget) · spendRoll(budget)
```

Reuse `dateKey` from `week-budget.ts` rather than redefining it.

In `game-store.tsx`: add `ROLL_STORAGE_KEY = 'startup-tycoon/rolls/v1'`, load it in the existing mount effect alongside the save / week-budget / streak reads, persist it in its own effect, and refresh it on the same day-change path the week budget uses.

**Test:** mirror `week-budget.test.ts` — same-day no-op, next-day grant, bank cap, spend floor at 0.

---

## Task 4 — Wire the action
Status: done

**Both open questions were decided by the user.**

*Save shape → hydrate normalizer.* `normalizeSave()` in `engine.ts` runs on every hydrate (there is no version gate, so no save can be assumed current) and is a no-op on a current one. It drops a pre-roll seat's six-candidate offer — the new picker cannot render it — and defaults `rollGrantsEarned`. Everything a live player built survives: cash, week, headcount, whoever they already hired.

*Standup golden reward → grant a roll.* `EventEffects.refreshCandidates` is gone, replaced by `grantRoll`. The engine cannot credit the budget directly (it is keyed to a calendar day, which `src/game/` never sees), so it bumps a monotone `rollGrantsEarned` on `GameState` and the store credits the difference — idempotent under re-render, and a reload mid-grant lands the same rolls.

Two departures from the sub-steps below:

- **`CLevelSlot.candidates` is replaced by `offer`, not joined by it.** Keeping both would mean two copies of the same array that can disagree. `HIRE_CLEVEL` now reads `slot.offer?.candidates`.
- **The roll dispatch reduces in the store rather than dispatching blind**, so `EVENTS.CANDIDATES_ROLLED` can carry the tier the wheel actually landed on instead of inferring it from a state diff. `EVENTS.ROLL_BLOCKED` covers the wall, matching `WEEK_ADVANCE_BLOCKED`.

**Fallout: emptying the seats at `newGame` shifts the RNG stream**, so three fixed-seed tests elsewhere broke. Each was a latent flaw the shift exposed, and each is fixed on its merits rather than by seed-hunting:
- `engine.test.ts` — reseeded to 1. Its own comment already warned this seed moves whenever an earlier draw changes.
- `events.test.ts` — the Boom-deck test asserted one iteration past the era change, because the loop only re-checks `s.era` at the top. The tick that *enters* Boom may legitimately draw a Boom card. Now breaks on the era change.
- `focus.test.ts` — the flip-flop test was passing on event luck. Events are now held off so it measures the drag, and `committed` settles on `ai`. **Worth knowing:** committing to `hardware` beats flip-flopping on quality but *loses* on customers at every horizon tried (10–30 weeks). The transition drag is real but smaller than the gap between the focuses' own market multipliers.

The budget gate lives in `dispatchWithSnapshot`, which is not exported and needs a rendered provider; the store test pins the predicate pair the gate is built from instead.

1. `GameAction` gains `{ type: 'ROLL_CANDIDATES'; role: CLevelRole }`.
2. `reduce()` handles it: `roll(state.rng, action.role, state.stage)` → writes `cLevels[role].candidates` and the new offer metadata, threads `rng`.
3. Store gates the dispatch on `canRoll(rollBudget)` and calls `spendRoll` on success — the same pattern the `TICK` gate already uses for weeks.
4. `newGame()` starts every seat **empty with no offer**. The player must spin. (Today it pre-generates three offers; that goes away.)
5. `FIRE_CLEVEL` clears the seat and does **not** regenerate an offer — that was the free-reroll loop. It keeps its `C_LEVEL_DEPARTURE_MORALE_HIT`.

**Test:** engine test that `ROLL_CANDIDATES` is deterministic for a fixed seed; store test that a roll is refused at 0 budget.

---

## Task 5 — The picker UI (`candidate-picker.tsx`)
Status: done

All five states built, plus the two supporting pieces:

- The **spin button's three states** are one `rollState: 'ready' | 'loading' | 'empty'` prop rather than three booleans. `loading` matters: before the budget read lands the store swallows a spin rather than granting a free one, so the button is held instead of left live to eat a tap. `team.tsx` derives it from `isRollBudgetExhausted` — the same predicate the store's gate uses, so the wall and the swallowed dispatch cannot disagree.
- **Unaffordable** is a set of candidate ids computed in `team.tsx`, not a flag on the candidate: affordability is a property of this run right now, and the same legend is out of reach at Seed and obvious at Growth. The rule is `MIN_RUNWAY_WEEKS_AFTER_CLEVEL_HIRE = 4` against `cash / (burn + salary − revenue)`. The candidate stays on screen with the price visible; only the Hire button goes.
- `clevel-card.tsx` gained `hasOffer`, which swaps both the line and the button — "Empty — spin to see who's available" / **Spin** versus "Seat open" / **View candidates**.
- Analytics: `EVENTS.CANDIDATES_ROLLED` (with `tier`, and `stage` via `gameProps`) and `EVENTS.ROLL_BLOCKED` landed with Task 4.

No new screen. The existing bottom sheet grows:

- A **source banner** at the top — company name, or cluster label, or a highlighted `★ A LEGEND WALKED IN`.
- **Two candidate rows** instead of six, each showing `{name} · {from}`, flavour, perk label, salary.
- A **Spin / Roll again** button with the remaining count.
- An **out-of-rolls wall** when the budget is empty.
- An **unaffordable state** when salary would sink the run (see Risks) — show it, don't hide the candidate.

`clevel-card.tsx` needs an "Empty — spin to see who's available" state for a seat with no offer.

Analytics: `EVENTS.CANDIDATES_VIEWED` already exists. Add a roll event carrying `tier` and `stage` — the tier histogram in production is worth having.

---

## Task 6 — Animation (last, and deferrable)
Status: done

Built with **`react-native-reanimated`, not `@legendapp/motion`** — reanimated is what every other animated component in the repo already uses (`spotlight-hint.tsx`, `onboarding.tsx`, `collapsible.tsx`), and `@legendapp/motion` has no call sites at all despite being a dependency.

The reveal is the entering-animation sequence the plan describes: the banner settles alone for `BANNER_SETTLE_MS` (320ms), then the candidates arrive `CANDIDATE_STAGGER_MS` (120ms) apart. A legend banner gets `ZoomIn` where an ordinary one gets `FadeIn`. The whole block is keyed on the first candidate's id — which carries the rng counter, so it is unique per spin — which is what makes the animations replay on *every* roll instead of only the first mount.

The spin feel is the easiest part to add and the riskiest to let block the rest. Ship Tasks 1–5 with an instant result, then add the reveal: wheel settles on the source first, candidates slide in after. `@legendapp/motion` is already a dependency.

---

## Risks to handle during the build

**Legend affordability.** $52–78k/wk against `STARTING_CASH = 250_000`. A legend rolling at Seed may be unhirable. Show an explicit "you can't afford this yet" state rather than letting a hire bankrupt the run in four weeks.

**Second daily wall.** The game already stops at `WEEKS_PER_DAY = 5`. The mitigation is that the rolled offer **persists** until the next roll (exactly as `candidates` does today), so an empty budget never leaves the player empty-handed. Consider granting a roll from the Morning Standup streak — `standupCardForStreak` already varies its reward by `streakDays` and `EventEffects.refreshCandidates` already exists to model it on.

**Legends land late.** Simulation puts the first legend around day 11 of a ~16-day run, when seats are usually full — so a legend is typically a *replacement*. Confirm the morale-only cost of `FIRE_CLEVEL` is the right price for swapping one in.

**Save shape — needs a decision before Task 4.** This adds fields to `GameState` and a new persisted slice. The app is live on the App Store and **there is no version gate** (`SAVE_VERSION` was removed pre-release). A shape change will silently break real players' saves. Pick one: write a migration, tolerate the break, or deliberately wipe. This is the only task-blocking unknown in the plan.

---

## Risk #3, resolved — a filled seat can still search

The first build shipped `onViewCandidates` only on the *empty* branch of `clevel-card.tsx`, which quietly broke the feature's whole payoff:

- Swapping a legend in meant firing **first** — paying `C_LEVEL_DEPARTURE_MORALE_HIT` before seeing what the wheel gave you.
- Worse, rolling stopped once three seats filled, which happens early, at garage/seed where legend is 0.5–2%. The 81%-of-runs-see-a-legend figure assumes ~32 rolls spread across a run with stages climbing into the 5%/10% bands. `STAGE_WEIGHTS` would have stopped doing the job it exists for.

Fixed, and it answers the risk's own question — *"confirm the morale-only cost of `FIRE_CLEVEL` is the right price for swapping one in"*:

- A hired seat now shows **Look at the market** above **Fire**, so the offer is visible before you commit.
- **`HIRE_CLEVEL` over a filled seat charges `C_LEVEL_DEPARTURE_MORALE_HIT`.** Without it the roll would be a free way around `FIRE_CLEVEL`'s price, and since a legend almost always arrives after the seats are full, the swap is the common path, not the corner one. A test pins swap cost to fire-then-hire cost.
- `unaffordable()` now nets out the outgoing exec's salary, which `currentBurn` already carries — otherwise a replacement was priced as if you were paying both.

Two smaller corrections in the same pass:

- The card's search button rolls on the same tap when a seat is empty and a spin is in hand. It previously opened a sheet that only said "spin to see who's available" — two taps, no information in between.
- An **earned** roll from the golden standup streak is credited **cap-exempt**. `ROLLS_BANK_CAP` is a rule about the free daily allowance, not about a reward picked over cash and morale; clamping made that choice silently worthless for anyone sitting at 6. Same reasoning that makes `PurchasedWeeksPool` cap-exempt.
- The `rollGrantsEarned` handoff is idempotent under re-render but **not** crash-safe across a reload — the store's baseline is in memory. The doc comments now say so instead of claiming otherwise.

## Verified in the running app

All six tasks landed. Beyond `tsc` / lint / 488 passing tests, the loop was driven end-to-end in a browser against a real `expo export --platform web` build:

| Checked | Result |
| --- | --- |
| Empty seats on a new run | All three read "Empty — spin to see who's available" with a **Spin** button |
| Opening the sheet | "CTO SEARCH" → "Nobody in the pipeline yet" → **Spin · 2 left** |
| First spin | `Whoever you can get` → Grace Hoppr · a friend of your mom ($2.3K/wk) / Fei-Fei Lee · your landlord's nephew ($2.6K/wk) |
| Second spin | Banner and button both update; **Spin again · 1 left** → `Your own network` |
| Budget exhausted | Wall renders — *"Out of spins for today. More tomorrow. Whoever is above is still yours to hire."* with the offer still above it |
| Hiring from the wall state | Seat fills, runway drops 51 → 29 wk |
| Card button spins in one tap | Empty CTO card → **Spin** → offer, no intermediate screen |
| Filled seat reaches the search | CTO shows **Look at the market** above **Fire**; opens the standing offer with **Spin again · 1 left** |

The cluster rolls also confirmed the per-candidate relation rule in the wild: no roll repeated a connection.

## Order

Tasks 1 → 2 → 3 can proceed in parallel; each is independently testable and lands nothing user-visible. Task 4 needs the save decision. Task 5 needs 1–4. Task 6 any time after 5.
