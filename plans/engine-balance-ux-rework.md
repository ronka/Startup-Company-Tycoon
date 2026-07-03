# Plan: Engine & Balance Rework + UX/UI Improvements

> Generated from: `plans/engine-balance-rework.md` (PRD) + conversation
> Date: 2026-07-03

## Overview

Transform Startup Tycoon from a consequence-free "click Next Week" loop into a
daily-session game with real stakes. The work lands in three arcs — stakes
(fail/win states, an economy whose numbers visibly move), friction (hiring and
firing that cost something and lag), and scarcity (3 action points per real day,
a local-midnight day gate, daily rewards and streaks) — with UX/UI slices woven
in so every engine change is *legible* on screen (persistent HUD, stat-delta
animations, a week-in-review sheet, richer news feed). Engine stays pure: no
wall-clock reads inside `src/game/`; time enters via action payloads. Every
slice ships with vitest coverage and, where balance is touched, passes the sim
strategy-bot acceptance run.

Decisions locked during review: 12-slice granularity as proposed; day gate =
device-local midnight; forgiving catch-up (bank ≤3 missed weeks, 1 streak-freeze
per week, caretaker auto-sim beyond 7 days); only Task 11 is HITL.

---

## Tasks

### Task 1: Insolvency fuse + fail-state UI

- **Type**: AFK
- **Blocked by**: None - can start immediately
- Status: done

#### What to build

Make passive play lose. Engine: add `weeksInTheRed` to `GameState`; each tick
with cash < 0 increments it, cash ≥ 0 resets it; at 3 the run ends in
`bankruptcy` regardless of rounds remaining (replaces the current
"cash < 0 && no rounds left" rule in `score.ts`). Bump `SAVE_VERSION` to 2 and
add the first real hydrate-time migration in `game-store.tsx` (v1 saves get
`weeksInTheRed: 0`). UI: HQ shows a loud insolvency banner ("INSOLVENT — N
weeks to live") whenever cash < 0, and the Runway/Cash stat tiles switch to an
alert-red treatment; game-over screen states the cause plainly.

See PRD §2.1, §2.5.

#### Acceptance criteria

- [x] `tick` increments/resets `weeksInTheRed`; 3 consecutive red weeks ⇒ `gameOver: 'bankruptcy'` even with rounds unraised
- [x] v1 saves hydrate without crashing and default the new field
- [x] HQ banner appears the first week cash goes negative and shows weeks remaining
- [x] Cash/Runway tiles render alert styling while insolvent
- [x] `pnpm sim` (passive) now ends in bankruptcy instead of week-1000 timeout
- [x] Engine tests cover fuse increment, reset on recovery, and game-over trigger

#### User stories addressed

- As a player, I can actually lose the game, so advancing time carries risk
- As a player, I get clear on-screen warning and a deadline when I'm burning into the red

---

### Task 2: Economy rebalance + sim strategy bots

- **Type**: AFK
- **Blocked by**: Task 1
- Status: done

#### What to build

Retune the economy so ticks produce visible deltas and decent play reaches
break-even around week 20–30. Balance changes (PRD §2.3 and Part 6 cheat-sheet):
explicit `REVENUE_PER_QUALITY_SHARE` scalar in `revenueFor`, `QUALITY_DECAY_RATE`
0.04 → ~0.08, `devEffort` sublinear (`devs^0.85`), `SHARE_SHIFT_RATE` ~5×,
stage-scaled rival growth, weekly hype decay toward 1.0. Extend `scripts/sim.ts`
with three strategy bots — `passive`, `balanced` (hires to a burn ratio, raises
under 10wk runway), `aggressive` — selectable by CLI arg, plus a summary line
(death/exit week, peak revenue). Tune constants until the acceptance run passes.

#### Acceptance criteria

- [x] `pnpm sim passive`: bankruptcy between week 15 and 30
- [x] `pnpm sim balanced`: reaches revenue > burn and survives ≥60 weeks
- [x] `pnpm sim aggressive`: high variance — dies some seeds, thrives others (spot-check ≥5 seeds)
- [x] Hiring 2 devs changes weekly revenue noticeably within 3 ticks in the balanced run
- [x] Hype decays ~5% of its gap to 1.0 per week; rivals accelerate after each round raised
- [x] Existing engine tests updated; new tests pin the formula shapes (sublinear devs, hype decay)

#### User stories addressed

- As a player, I can feel the effect of a hire in the numbers within a few weeks
- As a player, my company can plausibly become profitable, so there's a goal beyond survival

---

### Task 3: Persistent HUD + stat-delta feedback

- **Type**: AFK
- **Blocked by**: None - can start immediately
- Status: done

#### What to build

A shared HUD strip rendered above all four tabs (via `(game)/_layout.tsx`):
cash, runway, week — later slices add AP and streak chips to it. After each
tick, changed stats animate: count-up/count-down numbers, a brief green/red
flash, and ▲/▼ delta badges vs last week on HQ stat tiles (requires keeping the
previous week's derived snapshot in the store or deriving from
`valuationHistory`-style history). Insolvency styling from Task 1 folds into
the HUD when both land.

See PRD Part 1 ("every tick tells a story") — this is its UI counterpart.

#### Acceptance criteria

- [x] HUD visible on HQ, Team, Money, Market with safe-area handling; tab content no longer duplicates cash/runway headers
- [x] Stat tiles show signed deltas vs previous week after a tick
- [x] Numeric changes animate (count-up + color flash) on tick, no animation on plain navigation
- [x] Works on web (verified live via agent-browser: HUD + deltas + flash render correctly on `expo start --web`). Native not independently screenshotted this session (agent-browser only drives mobile Safari, not a native Expo Go view) — implementation deliberately uses only core `Animated`/`StyleSheet`/`react-native-safe-area-context`, none of the reanimated/worklets/react-native-css machinery that caused prior web fragility, so native risk is low but unverified on-device.
- [x] Store exposes previous-tick snapshot without polluting the pure engine state

#### User stories addressed

- As a player, I see my vital signs everywhere, not just on HQ
- As a player, advancing the week produces a visible, satisfying change on screen

---

### Task 4: Week-in-review sheet + weekly digest

- **Type**: AFK
- **Blocked by**: Task 2, Task 3
- Status: done

#### What to build

Engine (PRD §2.4 "weekly digest"): during `tick`, append compact digest entries
to `newsLog` when notable thresholds are crossed — profitability crossed either
way, market share moved ≥1% vs a rival, morale crossed a band (e.g. 30/50/70),
runway crossed 8 weeks. UI: after each tick, present a "This Week" bottom sheet
before returning to HQ: cash delta, revenue vs burn, share movement per rival,
morale change, plus any digest/news entries — one glanceable card per item.
Dismissible with a tap; never blocks a pending decision modal.

#### Acceptance criteria

- [x] Digest entries generated deterministically in `tick` (pure, seeded, tested) — new `src/game/digest.ts` (`buildDigestEntries`), unit-tested in isolation plus wired-into-`tick` integration tests in `engine.test.ts`
- [x] No tick produces zero feedback: sheet always has at least the cash/revenue summary — `WeekInReviewSheet`'s cash/revenue-vs-burn rows are unconditional, independent of digest/newsLog entries
- [x] Sheet appears once per tick, after the decision modal (if any) resolves — HQ tracks `reviewedWeek`; `showReview` requires `!state.pendingEvent`, so it waits for `ANSWER_EVENT` when a card was drawn that tick
- [x] Digest thresholds don't spam: each band-crossing fires once until re-crossed — edge-triggered by comparing a pre-tick vs post-tick snapshot each tick, no persisted "already fired" flag needed; verified in tests (crater morale once, confirm no re-fire on subsequent ticks while still under the band)
- [x] News feed on HQ shows digest entries styled distinctly from event cards — 📊 icon, `backgroundSelected` tint + border, verified live in browser

Verified live via agent-browser on `expo start --web`: ticking produced a bottom sheet with cash delta, revenue-vs-burn, per-rival share movement, and matching digest entries (market-share-crossing fired at the ±1% clip); dismissing returned to HQ with the same entries now in the news feed, visually distinct from event cards.

#### User stories addressed

- As a player, every week ends with a story of what changed and why
- As a player, I learn the game's cause-and-effect from the summaries, not the source code

---

### Task 5: Event deck expansion + cooldowns + news feed polish

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

Engine (PRD §2.4): replace the permanent `drawnEventIds` ban with per-card
cooldowns — cards get `repeatable` (default true) and `cooldownWeeks`; one-shot
flags reserved for milestone cards. Grow the scrappy deck from 10 to ~30 cards
(mix of news and decision cards, positive and negative, morale/hype/quality/
share/cash effects). Tighten cadence to 1–3 weeks. Save-shape change folds into
the current `SAVE_VERSION` (coordinate with Task 1's bump). UI: news feed gets
per-entry icons and good/bad/neutral color accents; decision modal shows effect
hints on choices where the card declares them.

#### Acceptance criteria

- [ ] A 100-week sim never hits the `NO_MORE_EVENTS` dead state
- [ ] No card repeats within its `cooldownWeeks`; one-shot cards never repeat
- [ ] Deck contains ≥28 scrappy cards, ≥8 of them decisions
- [ ] Cadence draws every 1–3 weeks (tested distribution over seeds)
- [ ] News feed renders icon + accent per entry kind; decision modal choices readable at a glance

#### User stories addressed

- As a player, something worth reading happens almost every week, forever
- As a player, decision cards keep presenting real trade-offs deep into a run

---

### Task 6: Win states + score screen

- **Type**: AFK
- **Blocked by**: Task 2

#### What to build

Give runs an arc (PRD §2.2). Engine: track `profitableWeekStreak`; acquisition
offers arrive as decision cards once valuation crosses a stage-scaled threshold
(accept ⇒ `gameOver: 'acquired'`; decline ⇒ hype bump, threshold rises); IPO
action unlocks at stage `growth` with revenue > burn for 8 consecutive weeks
(⇒ `gameOver: 'ipo'`). Score = exit value × founder equity. UI: Money screen's
IPO card goes live with a progress indicator ("6/8 profitable weeks"); the
game-over screen becomes a proper score screen — outcome, score, weeks played,
founder equity kept, and a "New Run" CTA.

#### Acceptance criteria

- [ ] Acquisition card can fire only above the valuation threshold; declining raises the threshold and bumps hype
- [ ] Accepting an offer ends the run with `acquired` and a computed score
- [ ] IPO button enabled only at growth + 8-week profitable streak; triggers `ipo` game over
- [ ] Score screen shows outcome, score, weeks, equity; bankruptcy shows cause instead of score celebration
- [ ] Balanced bot can reach at least one exit across the seed spot-check
- [ ] Engine tests cover thresholds, streak reset on an unprofitable week, and both exits

#### User stories addressed

- As a player, a good run ends in a win I can brag about, not an infinite grind
- As a player, founder equity finally matters because it multiplies my final score

---

### Task 7: Hiring friction + Team screen rework

- **Type**: AFK
- **Blocked by**: Task 2

#### What to build

Hiring becomes an investment (PRD §3.1). Engine: committing hires costs an
up-front fee (`HIRING_FEE_WEEKS_OF_SALARY = 2` per head, deducted immediately);
hires enter a pipeline (`pendingHires` with 1–2 week seeded start delay) instead
of landing next tick; new hires contribute ~50% effort for their first 2 weeks;
`maxHireableHeadcount` replaced with per-stage caps (garage 8 / seed 20 /
seriesA 50 / growth 150 total heads). UI: Team steppers show fee per hire and
disable at the stage cap with "6/8 seats — raise a round to grow"; a pipeline
row lists "2 devs starting next week"; payroll preview includes fees being
committed this week.

#### Acceptance criteria

- [ ] Queuing hires deducts fees immediately; cancelling before start refunds (or is impossible — pick one, test it)
- [ ] Hires start 1–2 weeks later (seeded), then ramp at 50% effort for 2 weeks before full output
- [ ] Total headcount hard-capped per stage; raising a round visibly raises the cap
- [ ] Team screen shows fee, pipeline entries with countdowns, and cap state
- [ ] Balanced bot updated for fees/delay and still meets Task 2's acceptance run
- [ ] Engine tests cover fee math, pipeline landing, ramp effect on quality growth, caps

#### User stories addressed

- As a player, hiring is a cash decision with a payoff I have to wait for
- As a player, funding rounds matter beyond cash because they unlock team scale

---

### Task 8: Firing consequences + layoff UX

- **Type**: AFK
- **Blocked by**: Task 7

#### What to build

Layoffs leave scars (PRD §3.2). Engine: firing pays severance
(`SEVERANCE_WEEKS_OF_SALARY = 4` per head, immediate); a layoff batch lowers the
morale drift *baseline* via `moraleBaselineOffset` (e.g. −10, healing +1/week)
instead of a one-time hit that self-heals; morale < 30 gives each employee a
weekly seeded quit chance — quits emit news entries and (twist) bump a random
rival's quality slightly. UI: the layoff confirm modal shows the real bill
(severance cash, projected morale scar duration); the morale bar shows a
"scarred" state while the baseline offset is active; quits surface prominently
in the news feed and week-in-review sheet.

#### Acceptance criteria

- [ ] Severance deducted at the tick the cut lands; modal shows the exact amount beforehand
- [ ] Morale baseline drops after a layoff batch and recovers +1/week (tested trajectory)
- [ ] Morale < 30 produces seeded attrition; quits appear in news and reduce headcount
- [ ] A departing dev bumps a random rival's quality (visible in Market over time)
- [ ] Morale bar communicates the scarred state; confirm modal copy reflects new mechanics
- [ ] Engine tests cover severance, scar recovery, attrition probability bounds

#### User stories addressed

- As a player, layoffs are a costly last resort with a cash trough before the relief
- As a player, neglecting morale eventually costs me people, not just velocity

---

### Task 9: C-level stakes + candidate picker rework

- **Type**: AFK
- **Blocked by**: Task 2

#### What to build

Exec moves become big moves (PRD §3.3). Engine: hiring a C-level pays a signing
bonus (4× weekly salary); firing pays severance (6×) and puts the seat on a 2–3
week cooldown before new candidates generate; candidates get `expiresAtWeek`
(offers stand 3–4 weeks, then the pool rerolls on tick). UI: candidate picker
shows salary, perk, signing bonus, and an expiry countdown badge per candidate;
a vacant seat on cooldown shows "word got around — candidates return in N
weeks"; the fire flow confirms with the severance number.

#### Acceptance criteria

- [ ] Signing bonus deducted on hire; severance on fire; both surfaced in the confirm UI
- [ ] Fired seat generates no candidates for the cooldown window, then rerolls
- [ ] Candidate offers expire on schedule and reroll (seeded, tested)
- [ ] Picker shows expiry countdowns; cooldown state rendered on the seat card
- [ ] Engine tests cover bonus/severance math, cooldown, expiry rerolls

#### User stories addressed

- As a player, exec hires are "now or lose them" decisions worth logging in for
- As a player, firing an exec mid-crisis is genuinely painful, so I choose carefully

---

### Task 10: Action points system

- **Type**: AFK
- **Blocked by**: Task 7, Task 9

#### What to build

Moves become scarce (PRD §4.1). Engine: `actionPoints` in state,
`AP_PER_DAY = 3`; costed actions (1 AP each): commit hire batch, commit fire
batch, hire C-level, fire C-level, raise a round. Answering decision cards and
adjusting steppers before commit are free. `reduce` rejects costed actions at
0 AP — the rule lives in the engine, not the UI. Until Task 11 lands, AP
refills on every tick (temporary rule, replaced by the day gate). UI: every
costed button gets an AP-cost badge and disabled state at 0 AP; the HUD gains a
"moves left today" pip meter; steppers gain an explicit "Commit" step (the
batch is the move).

#### Acceptance criteria

- [ ] Costed actions consume 1 AP; engine rejects them at 0 AP (state unchanged)
- [ ] Free actions (answer event, adjust pending steppers, navigation) never consume AP
- [ ] Hire/fire batches commit atomically as one move via an explicit commit action
- [ ] HUD pip meter reflects AP everywhere; costed buttons show badge + disabled state
- [ ] Sim bots updated to spend AP legally and still pass Task 2 acceptance
- [ ] Engine tests cover consumption, rejection, refill, batch atomicity

#### User stories addressed

- As a player, I have a limited number of moves, so I prioritize instead of spamming
- As a player, I can always see how many moves I have left today

---

### Task 11: Day gate + catch-up + recap

- **Type**: HITL — day-boundary rule and countdown/recap UX need a design pass with the user
- **Blocked by**: Task 10

#### What to build

One real day = one in-game week (PRD §4.2). Engine: `lastDayAdvanceAt`,
`dayNumber`, `maxSeenTimestamp` in state; new action `ADVANCE_DAY { now }` —
legal only when `now` is a later **device-local calendar day** than the last
advance. On success: run `tick`, refill AP to 3. Forgiving catch-up: if N days
were missed, bank up to `min(N, 3)` manual advances; beyond 7 days away,
auto-simulate the gap in caretaker mode (no hires/fires, decisions resolve to
the safest choice) and mark those weeks for the recap. Clock rollback > 1 day
freezes the gate until real time catches up. Engine never reads the clock —
the store passes `Date.now()` on foreground/app-start and button press. UI:
HQ's button becomes the day-gate control — "Play this week" when unlocked,
countdown to local midnight when spent, banked count when catching up; a
"While you were gone" recap screen summarizes caretaker weeks from the newsLog.
`__DEV__`-only skip-day button; sim passes synthetic `now` values.

#### Acceptance criteria

- [ ] `ADVANCE_DAY` legal exactly once per local calendar day; engine-tested with synthetic timestamps across midnight, DST, and month boundaries
- [ ] AP refills only via a successful day advance (Task 10's per-tick refill removed)
- [ ] Missing 2 days banks 2 advances, playable back-to-back; 10 days away triggers caretaker sim + recap screen
- [ ] Clock set backwards >1 day freezes advancing until real time passes `maxSeenTimestamp`
- [ ] Button shows the three states (play / countdown / banked); recap lists caretaker weeks
- [ ] `pnpm sim` still runs headless with synthetic time; save migration adds the new fields

#### User stories addressed

- As a player, the game gives me a bounded daily session and a reason to return tomorrow
- As a returning player, missing a few days doesn't destroy my run — I get a recap and catch up

---

### Task 12: Daily rewards + streaks

- **Type**: AFK
- **Blocked by**: Task 11

#### What to build

The login incentive (PRD §4.3). Engine: on each successful `ADVANCE_DAY`, draw
one reward from a seeded table — a lead (extra C-level candidate or half-price
signing fee today), a rumor (peek at next event card or a rival's quality), a
micro-boost (+3 morale, small hype bump, +1 AP today), or rarely cash. Streaks:
`dailyStreak` increments per consecutive day; day 7 upgrades the reward tier;
one automatic streak-freeze per week absorbs a single missed day before reset.
Rewards flow through the event/news system so they're deterministic and appear
in the feed. UI: a daily reward moment on first open of the day (modal/sheet),
streak chip with freeze indicator in the HUD, rumor/lead surfacing in the
relevant screens (picker shows the bonus candidate, market shows the peeked
number).

#### Acceptance criteria

- [ ] Every successful day advance grants exactly one seeded reward; sim-reproducible per seed
- [ ] Streak increments on consecutive days; one freeze per week absorbs a miss; second miss resets
- [ ] Day-7 streak grants an upgraded reward (e.g. guaranteed strong candidate)
- [ ] Cash rewards are rare (tested distribution) so the economy stays tight
- [ ] Reward modal shows on first open of the day; streak chip + freeze state in HUD
- [ ] Rewards land in newsLog; engine tests cover table draw, streak/freeze logic, tier upgrade

#### User stories addressed

- As a player, opening the app every day gives me something concrete, so the streak feels worth protecting
- As a player, rewards feed back into my actual decisions (hires, timing) rather than being cosmetic

---

## Suggested parallel tracks

- Track A (stakes): 1 → 2 → 6
- Track B (UX): 3 → 4 (3 and 5 can start immediately, in parallel with Track A)
- Track C (friction): 7 → 8, and 9 (both after 2)
- Track D (daily meta): 10 → 11 (HITL) → 12
