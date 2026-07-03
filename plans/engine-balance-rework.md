# Engine & Balance Rework — from "click Next Week" to a daily-session game

Status: proposed (not started)
Scope: `src/game/` (pure engine + balance), `src/state/game-store.tsx`, game screens.
Companion docs: `plans/startup-tycoon-mvp.md`, `docs/superpowers/specs/2026-07-03-startup-tycoon-mvp-design.md`.

---

## Part 0 — Diagnosis (what's actually broken today)

Verified with the headless sim (`pnpm sim`, seed 12345) and a read of `engine.ts` / `balance.ts`:

1. **A passive player can't lose.** `checkGameOver` only declares bankruptcy when
   cash < 0 **and** all 3 rounds are raised. A player who never raises can sit at
   −$9M cash at week 1000 with the game politely ticking along. There is no
   pressure, so "next week, next week" is a correct strategy.
2. **Ticks produce invisible deltas.** Week-1 revenue is ~$86 against $16K burn.
   Revenue creeps to ~$12K/week by week 50 and never crosses burn at starting
   headcount. Cash goes down by roughly the same amount every week no matter what
   you do — the tick feels like nothing because, numerically, it almost is.
3. **The event deck runs dry in ~30 weeks.** 10 cards, drawn every 2–4 weeks,
   never repeated (`drawnEventIds`), then `weeksUntilNextEvent = MAX_SAFE_INTEGER`.
   After week ~30, literally nothing ever happens again.
4. **Hiring/firing is frictionless.**
   - Hires land next tick at full productivity: no recruiting delay, no
     signing/onboarding cost, no ramp-up.
   - Firing has no severance; the morale hit heals automatically because morale
     drifts back to baseline 70 at 8%/week regardless of what you did.
   - `maxHireableHeadcount` allows ~100 devs on day 1 (cash ÷ one week's salary).
   - Firing a C-level costs 10 morale (heals in ~3 weeks) and instantly conjures
     three fresh candidates. Hiring one is free besides salary.
5. **The market loop is glacial.** Share shift is `qualityGap × 0.00002`, capped
   at ±1%/week per rival. Rivals grow +20 quality/week linearly while your quality
   asymptotes (~10,800 at 3 devs), so the death spiral exists but takes ~900 weeks.
   No one will ever see it.
6. **No win state.** `GameOverReason` has `acquired`/`ipo` but nothing sets them.
   Even a perfectly played run just… continues.
7. **Morale is toothless.** It only scales dev effort (0.5×–1.5×) and self-heals.
   Nobody quits, nothing compounds.

Design conclusion: the loop has no **scarcity** (moves are free), no **stakes**
(you can't lose or win), and no **texture** (most ticks are empty). The daily-game
vision fixes scarcity; the engine/balance work must fix stakes and texture first,
or a daily allowance of moves will just ration boredom.

---

## Part 1 — Design goals

- **Every tick tells a story.** Advancing time should always surface at least one
  concrete, legible consequence (revenue delta, share movement, a news beat, an
  employee event).
- **Decisions have weight and lag.** Hiring is an investment that pays off in
  weeks; firing is a scar, not a slider. You should *feel* a hire in the numbers.
- **Runs end.** You can go bankrupt in ~15–25 badly-played weeks; you can exit
  (acquisition/IPO) in a well-played "season" of roughly 40–60 in-game weeks.
- **Sessions are bounded.** Eventually: N moves per real day + a gated day
  advance + a daily reward, so the game becomes a 5-minute daily ritual.
- **Engine stays pure.** No `Date.now()` inside `src/game/` — wall-clock time
  enters only as action payloads, preserving determinism and the sim harness.

---

## Part 2 — Phase 1: Make the tick matter (engine + balance)

### 2.1 Real fail state

- Change `checkGameOver`: bankruptcy when **cash < 0, full stop** — but add a
  short fuse instead of instant death: new state field `weeksInTheRed` (int).
  Cash < 0 increments it; cash ≥ 0 resets it. `weeksInTheRed >= 3` ⇒ bankruptcy.
  While in the red, the UI shows a loud "INSOLVENT — N weeks to live" banner.
  Available rounds are no longer a passive shield — they're only a lifeline if
  the player actually raises in time (bridge terms already punish this nicely).
- Add a morale fail-soft: at morale < 20, each tick has a chance (seeded RNG)
  that an employee **quits** (random role, headcount −1, news entry). This makes
  morale a real resource without adding a second hard death.

### 2.2 Win states (give the run an arc)

- **Acquisition offers:** once valuation crosses a stage-scaled threshold, an
  offer event can fire (via the event system, so it's a decision card):
  accept = game over `acquired` with a score screen (founder equity × price),
  decline = hype bump + threshold rises. Offer size scales with valuation and
  founder equity.
- **IPO:** unlocked at stage `growth` + sustained metrics (e.g. revenue > burn
  for 8 consecutive weeks — track `profitableWeekStreak`). IPO = `ipo` game over,
  score = valuation × founder equity.
- Score screen: final score = exit value × founder equity, with week count as a
  secondary bragging stat. This is the retention hook the daily loop pays into.

### 2.3 Economy rebalance (numbers that move)

Targets, then tune with the sim (see 2.6):

- **Revenue should be able to cross burn around week 20–30 of decent play** and
  should visibly respond to hires within 2–3 ticks. Concretely:
  - Raise `QUALITY_DECAY_RATE` 0.04 → ~0.08 (lower asymptote, faster to reach it,
    dev count matters more relative to accumulated quality).
  - Rescale `revenueFor` so a mid-game state (quality ~4–5K, share ~25%, hype ~1.2)
    yields revenue in the $15–25K/week range — e.g. add a `REVENUE_PER_QUALITY_SHARE`
    scalar constant instead of the implicit 1.0, so revenue is tunable without
    touching the quality curve.
- **Diminishing returns on devs:** replace linear `devEffort(devs)` with
  `DEV_EFFORT_PER_DEV × devs^0.85` (or a soft cap by stage). Kills the
  "100 devs on day 1" degenerate strategy alongside the hiring caps in Phase 2.
- **Faster, visible market loop:** raise `SHARE_SHIFT_RATE` so a meaningful
  quality lead moves ~0.5–1%/week (near the current cap), and give rivals
  **stage-relative growth** (they speed up as you raise rounds) so the pressure
  scales with the player instead of a flat +20/week. Rival share changes should
  land in the news feed ("Nimbus shipped a redesign — they're eating your lunch").
- **Hype decay:** hype currently only moves via events. Add a weekly decay toward
  1.0 (e.g. 5% of the gap) so hype spikes are windows to exploit (raise! hire!)
  rather than permanent stat food.

### 2.4 Events: never run dry, drive the texture

- **Make most cards repeatable:** add `repeatable: boolean` (default true) and a
  `cooldownWeeks` instead of a permanent `drawnEventIds` ban; keep one-shot flags
  only for milestone cards (acquisition feelers, era transitions).
- **Grow the deck** (target ~30 cards for the scrappy era) and add **era decks**
  keyed off `stage` (scrappy → funded → growth) so later game feels different.
- **Weekly digest as guaranteed texture:** even with no card drawn, the tick
  should append a compact `newsLog` digest entry when something notable happened
  (crossed profitability, lost/gained ≥1% share, morale crossed a band, runway
  crossed 8 weeks). Cheap to compute inside `tick`, huge for perceived liveliness.
- Tighten cadence to every 1–3 weeks (from 2–4) once the deck is big enough.

### 2.5 State/save changes

- New fields: `weeksInTheRed`, `profitableWeekStreak`, per-card cooldown map
  (replaces/augments `drawnEventIds`). Bump `SAVE_VERSION` to 2 and write the
  first real migration in the store hydrate path (v1 saves: fill defaults).

### 2.6 Tuning workflow (do this before calling Phase 1 done)

- Extend `scripts/sim.ts` with **strategy bots**: `passive` (never acts),
  `balanced` (hires to a burn ratio, raises at <10wk runway), `aggressive`
  (max hires, raises early). Acceptance criteria:
  - `passive` goes bankrupt between week 15 and 30.
  - `balanced` reaches profitability and survives ≥60 weeks, can hit an exit.
  - `aggressive` sometimes wins big, often dies — high variance.
- Add engine tests for the new fail/win states and the digest triggers.

---

## Part 3 — Phase 2: Hiring & firing that you can feel

### 3.1 Rank-and-file hiring friction

- **Recruiting pipeline instead of instant steppers:** queued hires become
  `pendingHires: { role, weeksUntilStart }[]` — each hire takes 1–2 weeks
  (seeded roll) to land. The Team screen shows "2 devs starting next week".
- **Hiring costs cash up front:** signing/recruiter fee per hire
  (e.g. 2× weekly salary, `HIRING_FEE_WEEKS_OF_SALARY = 2`), deducted when the
  hire is queued. Makes "spam +10 devs" a real cash decision.
- **Onboarding ramp:** new hires contribute 50% effort for their first 2 weeks
  (track `headcountRamping` per role or a simple aggregate ramp bucket — keep it
  cheap: `rampingHeads: Record<Role, number[]>` of weeks-remaining, or an
  aggregate "effective headcount" that lags actual by a smoothing factor).
  Simplest faithful version: effective devs = devs − 0.5 × (hires in last 2 weeks).
- **Stage-based headcount caps:** replace `maxHireableHeadcount` (cash ÷ salary)
  with per-stage caps (garage: 8 total, seed: 20, seriesA: 50, growth: 150) —
  the office literally can't fit more people. Raising a round becomes the way
  to unlock scale, which ties funding into the core loop.

### 3.2 Firing with consequences

- **Severance:** firing costs `SEVERANCE_WEEKS_OF_SALARY = 4` per head, paid
  immediately. Layoffs to "save money" now have a cash trough before the burn
  relief — exactly like real life, and it makes the timing a decision.
- **Morale scarring:** on a layoff batch, *lower the drift baseline itself* for
  a while: `moraleBaselineOffset` (e.g. −10, recovering +1/week). The team
  "remembers" layoffs for ~10 weeks instead of morale bouncing back in 3.
- **Attrition loop:** morale < 30 ⇒ weekly quit chance per employee
  (news entry: "Your best dev left for a rival"). Optionally the departing dev
  bumps a random rival's quality — twist of the knife, great story beat.

### 3.3 C-levels with stakes

- **Signing bonus** (e.g. 4× weekly salary) on hire; **severance** (e.g. 6×) on fire.
- **Candidate pools rotate**: candidates have `expiresAtWeek` (offer stands 3–4
  weeks, then reroll). Creates "hire now or lose them" moments — real decisions
  for the daily-session loop.
- **Vacancy cooldown:** after firing, the seat generates no candidates for 2–3
  weeks ("word got around"). Firing an exec mid-crisis is now genuinely painful.
- Later (nice-to-have): perks that scale with tenure, exec-specific events.

---

## Part 4 — Phase 3: The daily-session meta layer

The retention model: **1 real day = 1 in-game week.** Each real day you get a
budget of moves, you spend them, you advance the week (or it advances when you
next log in), and logging in daily is rewarded.

### 4.1 Action points (AP)

- New state: `actionPoints` (current), `AP_PER_DAY = 3` (tunable; maybe +1 with
  a COO in some future era).
- **Costed actions** (1 AP each): commit a hiring batch (the whole batch, not
  per head), fire batch, hire C-level, fire C-level, raise a round.
- **Free actions:** answering a decision card (it's the game's gift, not a tax),
  browsing screens, rearranging pending steppers before committing.
- Enforced **in the engine** (`reduce` rejects costed actions at 0 AP) so the
  rule is testable and cheat-resistant; the UI greys out buttons and shows
  "2 moves left today".

### 4.2 The day gate (real-time week advance)

- Engine gets time as data, never reads the clock:
  - New fields: `lastDayAdvanceAt: number | null` (epoch ms), `dayNumber: number`.
  - New action `ADVANCE_DAY { now: number }`: valid only if `now` is a later
    *calendar day* (local midnight or a fixed 4-hour-buffer rule) than
    `lastDayAdvanceAt`. On success: runs `tick` (one week), refills AP to
    `AP_PER_DAY`, grants the daily reward (4.3).
  - The store dispatches `ADVANCE_DAY` with `Date.now()` on app foreground and
    when the user taps the button; the engine decides if it's legal.
- **Next Week button becomes "End of day / come back tomorrow"**: after the day's
  advance, the button shows a countdown to the next unlock. This is *the* core
  UX change — the tick becomes scarce, so everything the tick does (Phase 1)
  finally has an audience.
- **Catch-up rule:** if the player was away N days, allow up to
  `min(N, 3)` banked advances (each still refills AP once — you can't stockpile
  AP, but you can catch the timeline up). Away > 7 days ⇒ auto-simulate the gap
  in "caretaker mode" (no hires/fires, events auto-resolve to the safe choice)
  and present a "While you were gone…" recap screen built from the newsLog.
- **Clock-cheat handling:** if `now` goes *backwards* by more than a day, freeze
  the gate until real time catches up (store max-seen timestamp). Don't try
  harder than that — it's a single-player game; punish accidents, not hackers.
- **Dev/testing escape hatch:** `__DEV__`-only "skip day" button + sim harness
  passes synthetic `now` values, so `pnpm sim` still runs 1000 weeks headlessly.

### 4.3 Daily reward (the reason to open the app)

- On each `ADVANCE_DAY`, grant one item from a small seeded reward table:
  - a **lead**: an extra C-level candidate or a discounted hire (½ signing fee today),
  - a **rumor**: peek at next week's event card / a rival's quality number,
  - a **micro-boost**: +3 morale "team lunch", small hype bump, one-time
    +1 AP for today,
  - occasionally cash ("a small grant came through") — keep rare so the economy
    stays tight.
- **Streaks:** `dailyStreak` counter; day 7 of a streak upgrades the reward
  (e.g. a guaranteed strong candidate). Missing a day resets to 0 (or use a
  gentler "streak freeze" once per week — decide during tuning).
- Rewards flow through the existing event/news system so they show up in the
  feed and stay in the pure engine (reward choice comes from the seeded RNG).

### 4.4 What this changes in existing screens

- HQ: replace "Next Week →" with the day-gate button + AP indicator + countdown.
- Team/C-levels/Money: every costed button shows its AP cost and disabled state.
- New "Daily" surface (modal or HQ card): today's reward, streak, moves left.
- Later (out of scope for this plan): local notifications ("Your startup needs
  you — 3 moves waiting"), which is the natural Expo follow-up.

### 4.5 Save/migration

- `SAVE_VERSION` → 3 (or fold into Phase 1's bump if shipped together):
  `actionPoints`, `lastDayAdvanceAt`, `dayNumber`, `dailyStreak`,
  `maxSeenTimestamp`. Migration: existing saves get a full AP refill and
  `lastDayAdvanceAt = null` (first `ADVANCE_DAY` always legal).

---

## Part 5 — Suggested implementation order

Each task should land with tests + a sim run; Phase 1 and 2 are pure-engine and
fully testable headlessly.

1. **Fail state + insolvency fuse** (2.1) — smallest change, biggest stakes.
2. **Economy rebalance + sim strategy bots** (2.3, 2.6) — get the acceptance
   criteria passing; everything after tunes against these bots.
3. **Events: repeatable cards + bigger deck + weekly digest** (2.4).
4. **Win states + score screen** (2.2).
5. **Hiring friction: fees, pipeline delay, ramp, stage caps** (3.1).
6. **Firing: severance, morale scarring, attrition** (3.2).
7. **C-level stakes: bonuses, rotating candidates, vacancy cooldown** (3.3).
8. **AP system in engine + UI affordances** (4.1).
9. **Day gate + catch-up + clock handling** (4.2).
10. **Daily rewards + streaks** (4.3, 4.4).

Rationale for the order: stakes → texture → friction → scarcity. The daily gate
(8–10) ships last because rationing moves is only fun once each move and each
tick actually matters (1–7).

---

## Part 6 — Balance cheat-sheet (initial values to try)

All in `balance.ts`, all subject to the sim acceptance run:

| Constant | Now | Try | Why |
|---|---|---|---|
| Bankruptcy rule | cash<0 && no rounds left | 3 weeks cash<0 | passive play must lose |
| `QUALITY_DECAY_RATE` | 0.04 | 0.08 | lower asymptote, hires matter more |
| Revenue scalar | (implicit 1.0) | new const, target break-even ~wk 25 | visible progress |
| `devEffort` | linear | `devs^0.85` | soft-cap dev spam |
| `SHARE_SHIFT_RATE` | 0.00002 | ~5× higher | market moves weekly, not yearly |
| Rival growth | +20/wk flat | stage-scaled | endgame pressure |
| Hype | sticky | decay 5%/wk toward 1.0 | spikes become windows |
| Event cadence | 2–4 wk, 10 one-shot cards | 1–3 wk, ~30 cards w/ cooldowns | never runs dry |
| Hire cost | $0 | 2 wk salary fee | hiring = investment |
| Hire delay | next tick | 1–2 wk pipeline | anticipation |
| New-hire ramp | 100% day one | 50% for 2 wk | lag you can feel |
| Severance | $0 | 4 wk salary | layoffs = cash trough |
| Morale after layoff | drifts back in ~3 wk | baseline −10, heals +1/wk | scars last |
| Morale floor | none | quits below 30 | morale has teeth |
| Headcount cap | cash ÷ salary | per-stage (8/20/50/150) | rounds unlock scale |
| C-level hire/fire | free / −10 morale | 4 wk bonus / 6 wk severance + seat cooldown | exec moves are big |
| AP per day | — | 3 | tune with playtests |
| Catch-up cap | — | 3 banked days, caretaker after 7 | forgiving but not skippable |
