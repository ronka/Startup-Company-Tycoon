# The first weeks: Phases 1 + 3 merged

**Date:** 2026-10-18
**Replaces:** Phase 1 (less data, focus, tutorial voice) and Phase 3 (training wheels) of `plans/2026-10-10-game-designer-feedback-plan.md`. The rest of that plan stays as written.
**Status:** Draft. Stage A can start now. Stage B is unblocked by the sim snapshot test (Phase 0.4, done 2026-10-18).

---

## Why merge them

- **They solve the same problem.** 9 in 10 players leave before week 10. Phase 1 makes each screen calmer and Phase 3 shows fewer screens. Together they shape what a new player sees in weeks 0–12.
- **Unlocks shrink the data problem.** A tab you haven't unlocked yet can't overwhelm you.
- **Unlocks can do the guiding.** "Reach 25 customers → unlocks Support" is a goal, the next step and a reason to come back, all in one line. This replaces the mentor from the original 1.2, which is dropped.
- **No double work.** We'd otherwise redesign Money and Market for one screen, then add locks to the same screens again.

What doesn't merge away: every tab still has to fit one screen **when fully unlocked**, because existing players, in-flight saves and veterans see everything.

## The guiding idea: the unlock ladder is the tutorial

Guidance never sits in data cards. It comes from four tools, and data cards never contain instructions:

| Tool | What it does | Replaces |
|---|---|---|
| **Quest strip** | One pinned goal with progress and a reward, e.g. "Reach 25 customers 12/25 → unlocks Support". Finishing one gives a "Mission complete" beat, and the next quest slides in. | `HintSlot` text, `FirstRunHint` |
| **Glow on the target** | The control the quest needs pulses (a hand pointer the first time). No extra text. | `spotlight-hint.tsx` |
| **Recommended action** | One primary button that names the best move right now: "Hire your first developer" → … → "Next Week". | Next Week always being the biggest thing |
| **Action grammar** | Anything you can act on has one look (one accent colour, a pill with an arrow). Data cards are neutral and use no verbs. | Mixed text on every card |

Plain language follows the ladder: early play says "Monthly income", "Spending per week", "Weeks of cash left". When a real term appears with its unlock, a small "New term: MRR" card drops into the glossary, which you collect like achievements.

How these look on screen (quest bar vs diegetic office vs turn planner) is the open design question. The prototype below answers it.

## Which mechanics can be locked how

This is the split. It comes from reading `tick` and `reduce` in `src/game/engine.ts`.

**Wait for the player (safe to hide with UI only).** Nothing happens unless the player acts, so hiding the control changes nothing in the simulation.

| Mechanic | Action | Notes |
|---|---|---|
| Funding rounds | `RAISE_ROUND` | No offer arrives by itself. |
| IPO | `GO_PUBLIC` | Already gated by stage and the Boom window (week 25+). |
| C-level seats | `ROLL_CANDIDATES`, `HIRE_CLEVEL` | All seats start empty with no offer. |
| Morale lever (offsite & perks) | `SET_MORALE_LEVER` | Starts off. |
| Focus picker | `SET_FOCUS` | Focus is picked at onboarding; locking the picker keeps that choice. |

**Run by themselves (need engine changes to lock fairly).** These change the run every week whether the player sees them or not. Hiding them without switching them off would punish players for something they can't see.

| Mechanic | Where it bites | Today's effect on a new player |
|---|---|---|
| Support coverage churn | `customerFlowCausesFor` | With 0 support, coverage is 0 from the very first customer (`CUSTOMERS_PER_SUPPORT = 200`). |
| Rivals | `advanceMarket`: conversion vs `rivalAvgQuality`, share shift, defection, rival news | Active from week 1. |
| Decision and news cards | `drawEventIfDue` | Drawn on cadence from week 1, including the early buyout feeler. |
| Trends | `trendFactorsFor`: demand and hype multipliers, trend news | Active from week 1. |
| Morale drift and attrition | `moraleAfterTick`, `attritionCheck` | Stable at 70 in the Scrappy era unless the player lays people off, so it's low risk early. |
| Eras | `eraForWeek` | Boom starts at week 25–35, so nothing to lock in the first weeks. |

## Stage A: UI-only, ships fast (6–8 days, OTA)

No engine changes. The sim snapshot stays green without being touched.

**A1. Unlock model** (1 day)
- New pure module `src/game/unlocks.ts`: `unlockedFeatures(state): ReadonlySet<Feature>` plus `nextUnlock(state)` (the quest: goal, progress, reward).
- New optional field on `GameState`: `unlockSchedule?: 'guided-ui'`, set by `newGame` only for runs started after this ships. Unset means everything is unlocked, which covers every existing save.
- Stage B gets its own value (`'guided'`), so a run keeps the schedule it started with. Nothing changes under a player mid-run.
- Vitest cases for the ladder.

**A2. Locked UI for the mechanics that wait for the player** (1 day)
- Lock the Money tab (rounds), C-level seats, the morale lever and the focus picker. Each shows a lock with its condition ("Unlocks at 10 customers"), which is the FOMO hook.
- Cash and runway stay visible in the HUD, so locking Money hides nothing the player needs.
- Support, Market and cards stay visible in Stage A because their mechanics are running.
- An unlock is a moment: a banner plus the new tab or section glowing.

**A3. Quest strip + glow** (1–2 days)
- Renders `nextUnlock(state)`. Moves every `HintSlot` / `FirstRunHint` text that's really an instruction into a quest. Hints that are pure facts become data or go.
- `pickActiveHint` stays as the policy for whatever hints remain.

**A4. Recommended action** (1–2 days)
- New pure `recommendedAction(state)` in `src/lib/`, growing out of `actionNowFor` in `src/state/day-close.ts` (today it only knows "raise"). Rule table, in priority order: answer the decision card → hire the first dev → hire the first sales rep → hire support if coverage is short and Support is unlocked → raise if runway < 10 weeks and Money is unlocked → Next Week.
- Next Week lives in the HUD now (`53c851e`). The prototype decides whether the recommended action takes that slot or sits next to it.
- Vitest cases for the rule table.

**A5. One screen for Team, Money, Market** (2–3 days)
- HQ already fits (`94648f1`). Bring the other three to the same rule, **with everything unlocked**: at most 3 headline numbers and 2 actions; the rest moves into a `BottomSheet`. The cuts proposed in the original 1.1 still apply.
- Done when no tab scrolls on an iPhone 15 (393×852), fully unlocked.

**A6. Plain language + collected terms** (1 day)
- Early names in `src/lib/stat-explainers.ts`, `src/lib/strategy-copy.ts` and tab copy. A term switches to its real name when its mechanic unlocks, and the "New term" card is added to the ☰ glossary.

**A7. Analytics**
- `feature_unlocked { feature, week }`, `quest_completed { quest, week }`, `recommended_action_tapped { action }` in `src/analytics/events.ts`, captured centrally in the store.

### Stage A ladder

| # | Quest | Unlocks | Backstop |
|---|---|---|---|
| 1 | Hire your first developer | — | — |
| 2 | Hire a salesperson | — | — |
| 3 | Win your first customer | Celebration only | — |
| 4 | Reach 10 customers | Money tab: "Raise your first round". Term: MRR, burn, runway | Week 6, or runway below 10 weeks |
| 5 | Reach $X monthly income | Focus picker. Term: market share | Week 10 |
| 6 | Reach Y customers | Morale lever + C-level seats | Week 12 |

**Backstops** unlock a step by time even if the quest isn't met, so a struggling player is never locked out of the thing that would save them. A runway crisis unlocks Money straight away.

## Stage B: engine locks (3–4 days, OTA, after Stage A)

**Prerequisite (done):** `src/game/__tests__/sim-snapshot.test.ts` snapshots every sim bot on fixed seeds. Runs with no `unlockSchedule` have to stay byte-identical.

**B1. Engine reads the unlocks** (2 days)
- For `unlockSchedule: 'guided'` runs only, `tick` asks `unlockedFeatures(state)`:
  - **Support locked:** uncovered-support churn is 0.
  - **Rivals locked:** rivals don't move, take share or produce news; conversion uses a fixed rival quality.
  - **Cards locked:** `weeksUntilNextEvent` doesn't count down.
  - **Trends locked:** trend factors are neutral (1.0) and there's no trend news.
  - **Morale locked:** morale stays at its starting value and there's no attrition.
- `src/game/` stays pure; the unlocks are read from state, not passed in.
- New runs get `'guided'`; runs started under Stage A keep `'guided-ui'`.

**B2. Hide the mechanics that run by themselves** (1 day)
- Support stepper, the Market tab, decision cards and the morale card get the same lock treatment as Stage A.
- Week 0 now shows 2 tabs (HQ, Team) with devs and sales only.

**B3. Sim checks** (1 day)
- Add the `newbie` bot (original Phase 0.5) and run it on the guided schedule across 50 seeds. It should get past week 10 on nearly every seed.
- Snapshot runs with no schedule must be unchanged.

### Stage B ladder (adds to Stage A)

| Unlock | When | Backstop |
|---|---|---|
| Support + coverage churn | 25 customers | — |
| Decision cards | Week 4 | — |
| Market tab: rivals, trends, focus | Week 10 | — |
| Morale + lever | With C-level seats | Week 12 |

Week numbers are placeholders until a playtest; the newbie bot gives a first read.

## Prototype (next step)

One UI prototype on the real game routes. Two switches:
- **`?variant=`** for the three directions:
  - **A, Quest bar:** quest strip + glow + changing primary button.
  - **B, Diegetic office:** the HQ office is where you hire. Tap an empty desk, and the quest points at the desk.
  - **C, Turn planner:** each week opens with 1–3 choice cards, then Next Week lights up; stats sit behind sheets.
- **`?stage=`** for the moment in the journey: week 0 (nothing hired), week 6 (Money just unlocked), week 12 (most things unlocked).

Read-only against stub states. The question it answers: which direction makes "what do I do now?" obvious at every stage?

## Done when

- A new player sees one quest and one primary action on week 0, and that action is not Next Week.
- Every unlock produces a moment you notice, and nothing locked is still hurting the player.
- No tab scrolls on an iPhone 15, fully unlocked.
- No data card contains an instruction.
- The share of players past week 5 is up against the Phase 0.3 baseline.

## Open questions

1. **Leaderboard:** guided runs start easier. Publish normally, publish with a flag, or not at all? (Original open question 5.)
2. **Existing players:** offer them a "guided" restart, or leave guided to new installs only? (Default: new runs only.)
3. **Celebration art and sound:** banners in Stage A are code only; haptics wait for the next native build (Phase 2.5).
