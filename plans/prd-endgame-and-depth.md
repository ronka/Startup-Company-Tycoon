# PRD: Startup Tycoon — Endgame & Depth (v2)

> Date: 2026-07-03
> Source: playtest findings from a full 52-week run (web, seed default) + engine code review.
> Predecessor: `plans/startup-tycoon-mvp.md` (MVP is shipped and playable).

## 1. Background & problem statement

The MVP core loop works: the first ~15 weeks (hire → watch burn → raise before the runway dies) are tense and legible, the bridge-round mechanic creates real pressure, and the pure-engine architecture (`src/game/`, seeded RNG, vitest, headless sim) is solid.

A full playtest run surfaced one structural problem and several depth problems:

1. **The game has no ending.** `checkGameOver` (`src/game/score.ts`) only detects bankruptcy. `acquired` and `ipo` exist in `GameOverReason` and the game-over screen, but nothing ever triggers them. The Money tab shows a permanently disabled "IPO — Coming soon" card.
2. **Difficulty collapses after ~week 25.** Share shift is capped at ±1%/week per rival (`MAX_SHARE_SHIFT_PER_TICK`), and once the player's quality gap exceeds 100 points the player takes the max every week, forever. Rivals grow by flat script (+20 quality/wk) and can never recover. The playtest ended week 52 at 100.0% market share, infinite runway, nothing to do.
3. **The era ladder is a facade.** The Market tab renders Scrappy → Boom → Reckoning, but the run never leaves Scrappy.
4. **The event deck runs dry.** 10 cards (`src/game/events/scrappy.ts`), no repeats, one draw per 2–4 weeks → last event around week 30–35, silence afterwards.
5. **Funding tension doesn't materialize.** The bridge seed ($90K) doesn't lift runway above the 8-week bridge threshold, so the next round is automatically a bridge too; rounds can be raised back-to-back in the same week; dilution has no visible cost because equity doesn't cash out anywhere.
6. **Choices without tradeoffs.** C-level pools can contain strictly dominant candidates (CTO pool: best perk *and* cheapest) or all-identical perks (CMO pool: three ×1.1 hype candidates). Morale drifts a few points and threatens nothing. Support headcount only mitigates share *losses*, which a winning player never has.
7. **UX friction.** "Next Week" exists only on HQ (constant tab-flipping); the Week in Review sheet fires every week even when nothing happened; the news feed logs two near-identical "Took share from …" entries weekly; on web the tab icons render as "⏷" placeholders and the candidate/decision sheet is white in dark mode.

## 2. Goals

- Every run ends: bankruptcy, acquisition, or IPO — and produces a **score** the player wants to beat.
- Founder equity becomes the currency of every funding decision (dilution must hurt at exit time).
- The mid/late game keeps threatening the player (eras, richer deck, rivals that can fight back).
- Choices (candidates, events, morale) carry real tradeoffs.
- Remove the friction that makes a 50-week run feel like chores.

**Non-goals (this cycle):** multiplayer, monetization, sound, additional platforms beyond the current iOS/Android/web targets, save-format migrations beyond a version bump, server-side anything (daily cadence runs on device time — see F12).

## 3. Design conventions (unchanged, apply to all features)

- Engine purity: nothing under `src/game/` imports React/RN/Expo; all randomness through the seeded RNG in `GameState`; all tunables in `src/game/balance.ts`.
- Every engine change ships vitest tests in `src/game/__tests__/` and remains observable through `pnpm sim` (extend the sim/bots where relevant).
- Save `version` bumps with a migration or a "new run required" gate — never a silent corrupt load.

---

## 4. Features

### F1 — Exits: IPO and acquisition (P0)

The single highest-leverage change; most other features hang off it.

**Score model.** A run's score is **founder take-home = founderEquity × exit valuation** (bankruptcy scores $0). Show it on the game-over screen with the run length and a one-line epitaph.

**IPO.**
- Unlocks at `growth` stage when trailing revenue clears a threshold (tunable, e.g. revenue ≥ some multiple of burn sustained for N consecutive weeks) **and** the IPO window is open (era-dependent — open in Boom, shut in Reckoning; see F3).
- The Money tab IPO card shows live progress toward the bar ("Revenue $108K / $150K needed") instead of "Coming soon".
- IPO is a player-initiated action with a confirm dialog (like Raise), ends the run with `gameOver: 'ipo'`.
- Valuation at IPO uses the existing `valuationFor` output, optionally with an era multiplier.

**Acquisition.**
- Offer-driven, not player-initiated: event cards deliver offers ("Acquirer offers $X for the company — accept / decline").
- Offer size scales with current valuation and era; declining may have side effects (hype bump, rival response) per card.
- Accepting ends the run with `gameOver: 'acquired'` at the offered price. Early offers should be genuinely tempting lowballs — a guaranteed small score vs. the risk of playing on.
- The existing "An Early Feeler" card becomes the first rung of this ladder.

**Acceptance criteria**
- A passive/balanced sim bot can reach at least one exit type within 150 weeks on some seeds; bankruptcy remains reachable on others.
- `checkGameOver` covers all three `GameOverReason`s; game-over screen shows score.
- No exit is reachable while a decision card is pending.

### F2 — Score visibility in-flight: "Your stake" (P0)

On the Money tab, directly under founder equity, show **Your stake: 38% × $1.3M = $494K** (equity × current valuation), updating live. This is the run's score-in-progress and instantly makes every raise a real decision — even before F1 lands, it reframes dilution.

Also add the stake delta to the raise confirm dialog: "Raise $480K for 30% — your stake goes from $494K to ~$X."

**Acceptance criteria:** stake line on Money tab; raise dialog shows before/after stake; formula covered by a unit test.

### F3 — Eras: Scrappy → Boom → Reckoning (P1)

Make the Market-tab era strip real. Eras are the game's difficulty curve and the reason the late game stays dangerous.

- **Progression:** era advances on a week schedule with seeded jitter (e.g. Boom around week 25–35, Reckoning around week 55–70; tunables in `balance.ts`). The Market tab already renders position — wire it to state.
- **Scrappy (current behavior):** baseline.
- **Boom:** hype decays slower / events push it higher; funding rounds are larger or cheaper; rivals accelerate (they "raised" too); IPO window **open**.
- **Reckoning:** funding rounds unavailable or brutally dilutive; revenue multiple in `valuationFor` compresses; morale pressure events; rivals with low quality die (share redistributes), strong ones consolidate; IPO window **shut** until conditions recover.
- Era transitions announce themselves with a full-width news entry and a distinct Week in Review beat.
- Each era gets its own event deck (see F4); era cards can move era-relevant dials (funding terms, hype, rival quality).

**Acceptance criteria:** era stored in `GameState`, advances deterministically per seed; at least one balance dial per era demonstrably differs (unit tests); sim summary line prints the era at game over; a profitable-but-complacent company can die in Reckoning (demonstrated by a sim seed).

### F4 — Event deck expansion (P1)

Target **30–50 cards** total, organized per era.

- Split decks: `scrappy.ts` (grow existing 10 → ~15), `boom.ts` (~10–15: acquisition feelers, poaching offers, hype cycles, a rival megaround), `reckoning.ts` (~10: down-round pressure, layoff dilemmas, acquirer vultures, morale crises).
- **Bad-luck cards with real tradeoffs** — both choices costing something, not "+X vs +Y" freebies.
- **Storylines:** 2–3 chained arcs (e.g. Co-founder Drama part 1 sets a flag; part 2 draws later with consequences shaped by the earlier choice). Engine support: cards may set/check simple string flags on `GameState`.
- **Repeatable filler pool:** a small set of low-impact repeatable cards so late weeks never go fully silent once uniques are exhausted.
- Keep the existing transparency rule: each choice's effects are shown up front.

**Acceptance criteria:** no dead-air stretch longer than ~6 weeks in a 100-week sim; chained cards fire in order and respect flags (tests); decks are era-gated.

### F5 — Funding rebalance (P2, pairs with F1/F2)

- **Round cooldown:** a raise locks further raises for N weeks (e.g. 6–8), killing same-week back-to-back raises.
- **Clean-round windows worth planning for:** raise sizes scale with current valuation (raising after a hype spike yields more cash for the same equity), so *when* to raise becomes the skill.
- **Bridge fix:** either size bridge rounds so they at least clear the 8-week threshold (keeping the dilution penalty as the sting), or accept the "bridge treadmill" but surface it explicitly ("this raise still leaves you under 8 weeks — next round will also be a bridge") so it's an informed choice.
- Era hooks from F3 (Boom generosity, Reckoning freeze) apply on top.

**Acceptance criteria:** cooldown enforced in reducer (test); a balanced bot that raises early ends with meaningfully more equity than one that always bridges (sim evidence); UI copy explains bridge consequences before confirming.

### F6 — Candidate tradeoffs (P2)

- **Generation rule: no strictly dominant candidate in a pool.** Enforce in the generator: if candidate A has a better perk and lower salary than B, reroll/adjust.
- Widen the perk axis per role (e.g. CTO: productivity vs. tech-debt reduction vs. shortcut-risk mitigation; CMO: hype gain vs. hype-decay slowdown; CFO: burn reduction vs. better round terms).
- **Personality quirks with mechanics** (optional stretch): flavor text maps to a small secondary effect, e.g. "Ships at 2am" → +productivity, −morale/week; "Speaks fluent buzzword" → +hype, −quality drift. Displayed on the card like the perk.
- Fix duplicate flavor text within a pool; avoid repeated first/last names within a run's visible pools.

**Acceptance criteria:** property-style test that generated pools contain no dominated candidate; each role has ≥2 distinct perk types in the pool space.

### F7 — Morale with teeth (P2)

- **Thresholds:** below ~40, weekly attrition risk (seeded roll — a random hire quits, headcount −1, news entry); below ~25, productivity penalty on dev effort and sales factor.
- **Levers to raise it:** a cash-costing action or recurring toggle (offsite / perks budget) on the Team tab; some event choices already grant morale — keep that meaningful.
- **Interactions:** crunch-style event choices (e.g. "First Big Customer" deal) cost morale; C-level firing already hits morale (`C_LEVEL_DEPARTURE_MORALE_HIT`) — surface it in the confirm dialog.
- HUD/Team morale bar gains threshold markers so the danger zones are visible.

**Acceptance criteria:** a sustained low-morale sim run loses staff (test with forced morale); levers cost cash and are reflected in burn preview; thresholds documented in `balance.ts`.

### F8 — Rivals that fight back (P2, partially covered by F3)

- Rival quality growth becomes era- and state-aware: a rival that keeps losing share can draw a "desperation pivot" (quality surge) or die (Reckoning consolidation).
- Rest-of-market share shouldn't silently drain to 0; new entrant appears if the market becomes a monopoly before an exit (keeps late pressure without blocking F1 exits).
- Market tab: show rival quality (or a relative "product edge" indicator) so share swings are explainable.

**Acceptance criteria:** 100% share is either unreachable pre-exit or immediately answered by a new entrant; rival surges appear in the news feed.

### F9 — UX friction pass (P2 — cheap, high value)

1. **Advance week from anywhere:** persistent "Next Week" in a footer/HUD across all four tabs (disabled while a decision card is pending, same as today).
2. **Week in Review only when it earns the interruption:** full sheet on notable weeks (event resolved, threshold crossed, era change, round raised, morale/attrition incident); otherwise a compact one-line toast/ticker. Tunable notability rules in one place.
3. **News feed dedupe:** collapse consecutive "Took share from X" entries into a weekly/rolling summary ("Gained 2.0% share this week — mostly from Meridian"). The digest (`src/game/digest.ts`) is the right place to aggregate.
4. **Fast-forward:** "play 4 weeks" (or hold-to-repeat) that auto-advances and hard-stops on any event card, era change, or notable week.

**Acceptance criteria:** a 20-quiet-week stretch requires ≤ 20 taps and shows ≤ a handful of full sheets; feed contains no consecutive duplicate share entries.

### F10 — Web polish & platform bugs (P3)

- Tab bar icons render as "⏷" placeholders on web — provide web fallbacks for SF Symbols (and fix the doubled "⏷ ⏷" accessibility label).
- Candidate/decision bottom sheet renders a white background in dark mode on web — theme the sheet surface.
- Sweep other web dark-mode inconsistencies while there.

### F11 — Teach the model (P3)

- One-line "why" strings in the Week in Review / digest: "Your product quality outpaced Meridian's → +2.0% share", "Hype is decaying toward 1.0×".
- Stat tiles get a tap/long-press explainer (one sentence each: what feeds it, what it feeds).
- First-run only: three short contextual hints (Team: "Devs raise product quality — quality wins market share"; Money: "Raise before runway drops under 8 weeks or terms get worse"; HQ: "Watch revenue vs. burn").
- No modal tutorial, no forced walkthrough.
### F12 — Daily cadence & retention (P0)

Today a full run can be speedrun in one sitting. The product goal is a **daily game**: a limited number of actions per day, a reason to return tomorrow, and a reward for showing up — without the mechanic reading as a mobile-F2P energy shakedown.

**Daily week budget.**
- The player gets **5 game-weeks per real day**, refreshing at local midnight.
- Unused weeks **bank up to a cap of 10** (two days' worth). Missing a day is never punished — the player returns to a *fatter* session, not a lost run.
- 5 ticks ≈ a 5–10 minute session: enough to land a hire, resolve an event, and watch a trend move; not enough to outrun a funding crisis in one sitting. A crisis spotted on the last tick of today ("runway 6 weeks") is tomorrow's reason to open the app.
- With F1/F3 exit pacing (runs ending week 60–120), a run becomes a **2–4 week daily campaign**.
- Everything else stays playable at 0 remaining weeks: browsing tabs, queuing pending hires, reading news, answering an already-drawn decision card. Only `TICK` is gated.

**Diegetic framing — no energy bar.**
- Never display "energy 3/5 ⚡". The fiction carries the limit: the founder plans the week, then the team executes. Out-of-weeks copy: *"That's the week planned out — the team gets to work. Come back tomorrow."*
- The Next Week button shows remaining days subtly (e.g. small dots under the label), disabled state uses the diegetic copy.

**Daily reward: an appointment, not a login bonus.**
- First session of each day opens with a **Morning Standup card** — pick 1 of 3 small boosts drawn from a dedicated daily pool (e.g. *"The team's energized"* +3 morale · *"A journalist called"* +4% hype · *"An angel friend wires a favor"* +$10K).
- The reward is a *decision*, delivered through the existing event-card machinery — on-brand, and the engine stays pure.
- Rewards bend the run, never trivialize it.

**Forgiving streak.**

| Streak | Reward |
|---|---|
| 3 days | Standup pool upgrades (better options start appearing) |
| 7 days | One "golden" card: refresh all candidate pools, or +1 bonus week today |
| 14 days | Rare standup option (e.g. "Board goodwill" — next raise at clean terms) |
| Missed day | Streak **pauses** for one grace day; only resets after two consecutive missed days |

**Re-engagement.**
- Local push notifications via `expo-notifications`, tied to fiction and actual state, never generic: *"Week 34: your Series A decision is waiting"*, *"Runway is down to 4 weeks."* One per day max; opt-in prompt only after the player's first completed session (never on first launch).

**Architecture.**
- **Time never enters the engine.** `src/game/` stays pure and deterministic — no `Date`. The daily budget, streak, and standup grants live in the store layer (`src/state/game-store.tsx`), which persists `lastSessionDate`, `weeksRemaining`, `streak` alongside the save and expresses all rewards as ordinary `GameAction`s / injected event cards.
- The sim harness and vitest suites run unthrottled by construction. Ship a dev-only "free play" toggle so playtesting isn't rate-limited.
- **Clock cheating** (changing device date to refill weeks) is consciously accepted for a single-player game; revisit with server time only if leaderboards ever exist.

**Interaction with other features.**
- Raises F3/F4 urgency: every 5-tick session must contain at least one decision or notable beat. A 17-week silent stretch (observed in the MVP playtest) would be three straight days of empty tapping.
- F9's fast-forward stays, but within the daily budget.

**Rejected alternative (recorded deliberately):** strict "1 real day = 1 game week" appointment play (Wordle-style). Stronger ritual and weightier decisions, but sessions feel thin, runs stretch to 2–4 *months*, and a vacation wrecks the campaign. Budget + banking keeps the ritual while respecting that some days the player has 3 minutes and some days 20.

**Acceptance criteria**
- `TICK` is rejected by the store (not the engine) when the daily budget is exhausted; engine tests and `pnpm sim` are unaffected.
- Budget refreshes at local midnight; banking caps at 10; behavior covered by store-level tests with a mocked clock.
- Standup card appears exactly once per day on first session; streak table implemented with grace-day semantics.
- No UI element renders a numeric/battery-style energy meter.
- Notification fires at most once daily, references real game state, and deep-links into the run.

---

## 5. Priorities & suggested sequencing

| Priority | Features | Rationale |
|---|---|---|
| P0 | F1 exits + score, F2 stake display, F12 daily cadence | Makes runs end, dilution matter, and the game a daily habit — the product's shape |
| P1 | F3 eras, F4 deck expansion | Late-game threat + content so the year isn't silent (and every daily session has a beat) |
| P2 | F5 funding, F6 candidates, F7 morale, F8 rivals, F9 UX pass | Depth and friction — each independent, parallelizable |
| P3 | F10 web polish, F11 teaching | Cheap wins, anytime |

F2, F9, F10 have no engine dependencies on the others and can ship immediately. F12 is store-layer only and can also start immediately, but should ship to players together with (or after) F3/F4 — daily-gating the current content-dry mid-game would make three straight days of empty tapping. F5–F8 all read era state, so land F3's state plumbing (even with placeholder dials) early.

## 6. Success criteria for the release

- Median run (balanced play) ends in 60–120 weeks with an exit or a Reckoning death — never in an infinite idle state.
- Under the daily budget, that median run is a **2–4 week daily campaign**; a single day's session (5 ticks) takes 5–10 minutes and always contains at least one decision or notable beat.
- A player can articulate the score loop after one run: "keep equity high, exit at peak valuation."
- Sim harness demonstrates: aggressive > balanced > passive score spread across seeds, with all three outcomes represented.
- Zero weeks without either a decision, a notable digest, or visible market movement in the first 40 weeks.
- The daily mechanic never reads as an energy system: no meter UI, absence is never punished (banking, grace day), and the daily reward is always a choice, not a handout.
