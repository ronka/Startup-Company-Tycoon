# Game designer feedback: action plan

**Date:** 2026-10-10
**Source:** A conversation with a game designer (ex-Playtika). Transcript: `~/Downloads/IMG_2410.txt` (Hebrew).
**Status:** Draft. Start with Phase 0.

---

## Start here (about 2 hours in total)

1. Send the legal and Apple-guidelines question about selling in-game cash (Phase 0.1). Writing it takes 15 minutes, then you wait for the answer.
2. Write the one-paragraph target persona (Phase 0.2). 20 minutes.
3. Add the sim regression snapshot so later engine work can't silently change today's game (Phase 0.4). About 1 hour with Claude Code.

## Decisions already made

| Question | Decision |
|---|---|
| Game structure | A **chapter campaign** ("islands"). Today's open-ended run comes back as **Free Play** and unlocks after chapter 3. |
| `$` currency and the cash-selling revive | **Check legal first.** The plan carries both paths (Phase 6). |
| Monetization | **Keep regen + week packs.** Move the wall so it lands early in chapter 2, after the player has won chapter 1. |

---

## 1. What the designer said

| # | Point (paraphrased) | Handled in |
|---|---|---|
| 1 | **Core loop + meta-progression.** The hero does a mission, the mission earns something, and that something enables the next mission. The meta layer is progress through a story. | Phase 4, 5 |
| 2 | **The story is almost everything.** A sandbox with no goal creates no urgency. What pulls players back is "what's around the next corner?" | Phase 4 |
| 3 | **Chapters ("islands").** Start a small startup, get customers, sell it. The next chapter is a different startup in a different field, harder and with more money. Success means you sold or IPO'd. | Phase 4 |
| 4 | **Wealth as meta.** As you get richer you buy a house, a car, a yacht, and real estate that produces income. "Get rich or die trying." | Phase 5 |
| 5 | **The first session is only wins.** The player finishes quest 1 in one sitting, gets a taste of quest 2, then waits or pays. A storyline makes it easy to choose that conversion point. | Phase 4.4–4.5, 6 |
| 6 | **Training wheels.** Don't show all 4 tabs and every mechanic on day one. Start the player as a "grocery store manager", not a hi-tech CEO. Lock sections (e.g. HR until week 10); the lock also creates FOMO. Complex interactions, like sales adding load on support, come later. | Phase 3 |
| 7 | **Too much data.** Too many numbers, texts and boxes. Scrolling within a tab is "a disaster": everything has to fit in one view. | Phase 1.1 |
| 8 | **Focus.** On mobile the player has to know where to go and what to tap. Next Week is the biggest thing on every screen, and it often isn't the right move. | Phase 1.3 |
| 9 | **No feedback, no graphics.** "I added 2 sales and 3 devs. What happened? I pressed Next Week. What happened?" He wants visual representation (an empty office that fills with devs), positive feedback loops, "Mission complete" banners and celebrations. Energies such as hype, users and morale need something you can see. | Phase 2 |
| 10 | **Tutorial voice vs data.** There needs to be a clear difference in language between "the tutorial guiding me" and data points. Every page has text, and he can't tell which parts he's meant to act on. | Phase 1.2 |
| 11 | **Audience.** Not "hi-tech people 30+": that group is small, elitist, and doesn't spend on mobile games. Aim at teens and up, make it accessible (lowest common denominator), and let analytics show who sticks. | Phase 0.2, 1.4 |
| 12 | **Legal.** Using `$` and selling cash for real money is risky. At Playtika this was a disaster because it's close to gambling and you can't guarantee the user gets value. He suggests a currency that doesn't read as dollars. | Phase 6 |
| 13 | **Game economy.** Balance how fast the player runs out of money and needs you, how fast they run out of time and needs you, and rewards against expenses, so you steer players to the points you choose. ("Advanced.") | Phase 7 |
| 14 | **Homework.** Watch game design content and look up "game economy". | Appendix |

---

## 2. Where we are today

### Player data (PostHog project 505800, last 60 days, real devices only, one-off queries)

| Metric | Value |
|---|---|
| Players who started a game | 352 |
| Never pressed Next Week | 39 (11%) |
| Never got past week 5 | 237 (67%) |
| Never got past week 10 | 322 (91%) |
| Hit the week wall at least once | 138 (39%) |
| Finished runs | 68 runs, about 43 players |
| …ended in bankruptcy | 45 (66%), median week 20 |
| …ended in acquisition | 23 (34%), median week 9 |
| …ended in IPO | 0 |

Caveats:
- The sample is small.
- 59 players hit the wall before week 5. The likely explanation is players in the smaller arms of `initial-free-weeks-v1` or on a second run. This hasn't been checked; confirm it with `initial_weeks_variant` in Phase 0.3.
- An acquisition median of week 9 suggests most exits are the early lowball offer (`scrappy-acquisition-feeler`, 1.2× valuation).

**What this says:** the data supports the designer's diagnosis. Nine in ten players leave before week 10, so the first 5 weeks decide almost everything.

### Sim (seed 100)

The `balanced` bot goes bankrupt in week 35 and the `grower` bot in week 25. The game is hard even for scripted play.

### Code facts the plan builds on

- **4 tabs from minute one.** `src/app/(game)/(tabs)/` has hq, team, money and market, and each one is a long `ScrollView` of cards.
- **Next Week dominates.** It sits in `game-chrome.tsx` on every tab.
- **Feedback exists, but only as text:** `week-in-review-sheet.tsx`, `week-ticker.tsx`, `src/game/digest.ts`, `src/lib/team-contributions.ts`. What's missing is prominence and visible cause → effect.
- **The tutorial is text hints** (`HintSlot`, `src/lib/hints.ts`, `spotlight-hint.tsx`) with the same visual weight as data.
- **Art is 4 static PNGs** (`assets/images/game/{hq,team,money,market}.png`). There is no office scene and there are no characters.
- **Animation:** `react-native-reanimated` 4.5 is installed. There is no haptics or audio library, and adding one requires a native build.
- **Money formatting** is `formatMoney` in `src/lib/format.ts`, used in 23 files, plus about 10 hardcoded `$` strings. A currency swap is mostly a change in one place.
- **Monetization:**
  - Week budget: `INITIAL_FREE_WEEKS = 10`, one week regenerates every 36 minutes, and the bank caps at 10 (`src/state/week-budget.ts`).
  - Week packs: weeks20 at $1.99 and weeks60 at $4.99.
  - Revive: $2.99, sets cash to `REVIVE_CASH = 50_000`.
- **Hire rolls are free and daily only** (`src/state/roll-budget.ts`). They must stay that way (see the Phase 6 guardrail).
- **Saves have no version gate.** Every new `GameState` field must be optional and have a safe default.

---

## 3. Target experience

### The three loops

- **Weekly (core):** make a decision (hire, raise, pivot) → press Next Week → **see what the decision caused** → earn energies (customers, hype, cash) → spend them on the next decision.
- **Chapter:** start a company → hit the goal → exit (sell or IPO) → cash out to net worth → move to the next, harder company.
- **Career (meta):** net worth → lifestyle purchases (apartment → car → house → yacht → real estate) → trophies plus small perks → a stronger start in the next chapter.

The fantasy is "get rich or die trying". Startups drive the story, and wealth is the score.

### Campaign v1 (3 chapters) + Free Play

| | Ch.1 Garage Days | Ch.2 The Seed Round | Ch.3 Scale or Die | Free Play |
|---|---|---|---|---|
| Company (example) | To-do app | Food-delivery app | Fintech / AI | Player's choice |
| New mechanics | Devs, sales | Support (sales add support load), morale, decision cards, Seed + Series A | Rivals, focus & trends, C-level hire roll, eras, Series B, IPO | Everything (today's game) |
| Tabs | HQ, Team | + Money | + Market | All |
| Goal | Reach N customers → scripted buyout offer | Reach monthly income X → buyout offer ≥ Y | IPO, or a buyout ≥ Z | Open (today's scoring) |
| Can you lose? | No | Yes (revive available) | Yes | Yes |
| Spends the week bank? | No | Yes, and the wall lands here | Yes | Yes |
| Target length (newbie play) | 6–8 weeks | 20–30 weeks | 40–60 weeks | n/a |

Industries and numbers are placeholders until Phase 7 tunes them. Chapter 4 and later arrive as content updates (new industries, harsher markets, bigger targets). The designer's point was that this ladder has no ceiling.

Ch.3 adds a lot at once, so its mechanics also unlock in stages inside the chapter, using the Phase 3 system: rivals at the start, C-levels around week 5, focus around week 8, eras halfway through.

### Paywall placement

**Recommended: weeks in chapter 1 don't spend the bank. The bank starts at chapter 2.**
- **Why:** no wall can block the first win, however the player plays. The wall's timing also becomes one knob (`INITIAL_FREE_WEEKS`) that only affects chapter 2.
- **Result:** session 1 is chapter 1 (6–8 weeks) plus about 10 weeks of chapter 2. The wall then lands in the middle of chapter 2 on a cliffhanger: "A buyer is circling your company. Your next week is ready in 36 min, or keep going now."
- **Alternative:** keep a single global bank and cap chapter 1 at 7 weeks or fewer, so 3 weeks of chapter 2 fit in the 10-week bank. This breaks easily: a slow player hits the wall before winning.

---

## 4. Phases

Each task lists what to do, the files involved, and when it counts as done. Estimates assume focused days of you working with Claude Code.

| Phase | What | Estimate | Ships via |
|---|---|---|---|
| 0 | Groundwork: legal check, persona, baseline, sim guard | 1 day | n/a |
| 1 + 3 | Merged: the first weeks (see `2026-10-18-first-weeks-journey-plan.md`) | 9–12 days | OTA |
| 2 | Visible feedback: office scene, energies, celebrations | 7–10 days + art | OTA (haptics/sound need a native build) |
| 4 | Chapter campaign + Free Play | 12–15 days | OTA |
| 5 | Meta: net worth, lifestyle shop, trophy wall | 5–7 days | OTA |
| 6 | Currency and monetization changes | 2–5 days | OTA (a new IAP product needs App Store review) |
| 7 | Economy tuning | 3–5 days, then after every balance change | OTA |

**Why this order:**
- Phases 1–3 help today's players within days and don't need a restructure.
- Phase 4 reuses the pieces built in 1–3.
- Phase 5 needs the chapter exits from Phase 4.
- Phase 6 waits on the legal answer.
- Phase 7 needs chapters to tune, and runs again after every balance change.

### Phase 0: Groundwork (1 day)

**0.1 Legal and Apple check** (30 min to send, then wait)
- Ask:
  - Is selling an in-game cash top-up displayed as `$` a problem under App Store Review Guideline 3.1.1, or under consumer-protection rules in our main markets?
  - Does a fictional currency remove the concern?
  - Does the revive need any disclosure?
- Done when: a written answer picks Path A, B or C in Phase 6.

**0.2 Persona** (20 min)
- Write one paragraph here, e.g. "Casual mobile gamer, 15+, plays idle and tycoon games, knows nothing about startups."
- Check every copy and UX decision against it.

**0.3 Baseline dashboard in PostHog** (1–2 h)
- Include:
  - the new-player funnel: `game_started` → 1 → 5 → 10 weeks played → wall → purchase. Count weeks played as the **cumulative `week_advanced` events per player**, not the max `week` property: `week` resets to 0 with every new chapter, so the max wouldn't compare before and after the campaign.
  - D1/D7 retention
  - the run outcome mix
- Save it as "Campaign baseline 2026-10". The success metrics in section 6 are measured against it.

**0.4 Sim regression guard** (1 h) — **done 2026-10-18** (`src/game/__tests__/sim-snapshot.test.ts`)
- Add a vitest that runs the `scripts/sim.ts` bots on fixed seeds and snapshots their summary lines.
- Runs with no unlock schedule and no chapter (today's game) have to stay byte-identical through Phases 3 and 4.

**0.5 Newbie bot** (2–3 h)
- Add a `newbie` strategy to `scripts/sim.ts`: it hires a little of everything, presses Next Week often, and accepts the first offer.
- It is the acceptance bot for the "only wins" chapter 1.

**0.6 Playtesters** (30 min)
- List 5 people who match the persona. Not your hi-tech friends.
- At the end of every phase, 2–3 of them play while you watch without helping.

### Phase 1: Less data, clear focus, a separate tutorial voice (7–9 days, OTA)

> **Superseded 2026-10-18:** Phases 1 and 3 are merged and re-split into UI-only and engine stages in `plans/2026-10-18-first-weeks-journey-plan.md`. The mentor (1.2) is dropped. The text below is kept for reference.

**1.1 One-screen rule** (3–4 days)
- Every tab fits one iPhone 15 screen (393×852) without vertical scrolling. iPhone SE is a stretch goal.
- Each tab shows at most 3 headline numbers and at most 2 actions. Everything else moves into a `BottomSheet` behind a tap.
- Proposed cut:
  - **HQ:** company and stage, goal progress, the recommended action (1.3), one visual (the office from 2.1). News becomes an inbox icon with a badge; the sparkline and focus picker move into sheets.
  - **Team:** one row per role showing people, a stepper and a one-line effect ("→ +14 leads/wk"). C-level seats move into a sheet.
  - **Money:** cash, runway as a fuel gauge, and a Raise button when a round is available. Burn breakdown and round terms move into sheets.
  - **Market:** you vs. the 2 rivals as one race visual, plus a trend icon. Focus details move into a sheet.
- Files: `src/app/(game)/(tabs)/*.tsx`, `hud.tsx`, `bottom-sheet.tsx`.
- Done when: no tab scrolls on an iPhone 15, and each playtester can say what every tab is for in one sentence.

**1.2 Tutorial voice vs data voice** (1–2 days)
- Add a mentor character: an avatar, a speech bubble and its own color. **All guidance comes from the mentor. Data cards never contain instructions.**
- Move every `HintSlot` text and the Next Week `spotlight-hint` into mentor bubbles. Keep `pickActiveHint` (`src/lib/hints.ts`) as the selection policy.
- Copy audit: strip instructions out of stat explainers and cards and put them in the mentor's queue.
- Done when: every string on screen is either mentor or data, and the two look different.

**1.3 "What do I do now?": the recommended action** (2 days)
- Add a new pure function `recommendedAction(state)` in `src/lib/`. It returns exactly one of: hire first dev, hire sales, raise, answer card, Next Week.
- Render that action as the screen's primary button. Next Week is primary only when it really is the right move; otherwise it stays visible but secondary.
- Add vitest cases for the rule table.
- Done when: in week 0 the biggest button says "Hire your first developer", not "Next Week".

**1.4 Plain language** (1 day)
- Swap terms for early play:
  - MRR → "Monthly income"
  - Burn → "Spending per week"
  - Runway → "Weeks of cash left"
  - ARPC, churn and dilution stay hidden until their mechanic unlocks.
- When a real term first appears, the mentor says "New term unlocked: MRR". Learning the jargon becomes a progression beat.
- Files: `src/lib/stat-explainers.ts`, `src/lib/strategy-copy.ts`, tab copy.

### Phase 2: Make actions visible (7–10 days + art, OTA except haptics/sound)

**2.1 Office scene** (3–4 days + art)
- The HQ hero becomes an office that starts empty. Every hire adds a desk and a person, using dev, sales and support sprites.
- The office upgrades with the company stage: garage → loft → office floor → tower.
- Build it from layered images (background, desk slots, character sprites) and use reanimated for a "person walks in" animation on each hire. No game engine needed.
- Team-tab steppers show the person arriving or leaving as soon as you tap. Pending hires show as "arriving Monday".

**2.2 Cause → effect week result** (2–3 days)
- Rework `week-in-review-sheet.tsx` and `week-ticker.tsx` into a 2–4 second "result reel": 1–3 beats, with icons and numbers that count up.
- Every beat names its cause, e.g. "Your 2 new sales reps → 14 leads → 3 new customers → +$900/mo". The numbers come from `team-contributions.ts` and the tick delta in `digest.ts`.
- Done when: after every Next Week, a playtester can say what happened that week and why.

**2.3 Celebrations** (1–2 days)
- Big banner and confetti for milestones: first customer; 10 / 100 / 1,000 customers; first $1k monthly income; round raised; goal 50% reached; chapter complete.
- Bankruptcy keeps the same weight as a "Game Over" screen (`game-over.tsx`).
- Track them with a `milestone_celebrated` event.

**2.4 Energies get icons and meters** (1–2 days)
- Hype = flame meter. Morale = team mood face. Customers = crowd counter. Product quality = stars or level. Cash = coin icon (the final design depends on Phase 6).
- Use one icon set everywhere: HUD, cards and the result reel.

**2.5 Haptics + sound** (1 day of code, plus a native build)
- `expo-haptics` and `expo-audio` aren't installed, so adding them means an EAS build. Batch them with any other native change, and **confirm before building.**

**Art list.** Default: AI-generated, matching the style of the existing `assets/images/game/*.png`, from one shared prompt style sheet so the assets look like a set.
- 4 office backgrounds
- 3 role sprites × 3 variants, plus a desk
- 5 energy icons
- 3 chapter covers and a mentor avatar
- About 6 lifestyle items (Phase 5)

Export as WebP and keep each file under 150 KB so OTA bundles stay small.

### Phase 3: Training wheels, progressive unlocks (3–4 days, OTA)

> **Superseded 2026-10-18:** Phases 1 and 3 are merged and re-split into UI-only and engine stages in `plans/2026-10-18-first-weeks-journey-plan.md`. The mentor (1.2) is dropped. The text below is kept for reference.

**3.1 Unlock model** (1–2 days)
- Add a pure function `unlockedFeatures(state)` in `src/game/`. It returns the set of enabled mechanics: support, morale, events, funding, rivals, focus, cLevels, eras, ipo. For now the set depends on week and milestones; in Phase 4 it depends on the chapter.
- **A locked mechanic must be neutral, not just hidden.** While support is locked, churn from support load is off. While rivals are locked, they don't take market share. This means engine changes in `engine.ts` and `balance.ts`.
- **The schedule is an optional per-run field** (e.g. `unlockSchedule?: 'guided'`) that is set only on runs started after this ships. When the field is unset, every mechanic is on and the engine behaves exactly as it does today. The Phase 0.4 snapshot runs with the field unset, so it stays green.
- In-flight runs leave the field unset, so nothing locks in the middle of a run.
- **Leaderboard:** guided runs have an easier start, so their scores aren't directly comparable with older runs. Decide whether they publish normally, publish with a flag, or don't publish (see open question 5).

**3.2 Locked UI** (1 day)
- Locked tabs and sections show a lock with "Unlocks at week 10" or "Unlocks after your first 50 customers". This is the FOMO hook.
- An unlock is a moment: a mentor bubble plus a celebration, e.g. "New: Money tab. You can raise your first round."

**3.3 Proposed schedule for the single run** (before chapters exist)

| Unlock | When |
|---|---|
| Team: devs + sales | Start |
| Support + churn | First 25 customers |
| Decision cards | Week 4 |
| Money tab (rounds) | Week 6, or earlier if runway drops below 10 weeks |
| Market tab (rivals, focus, trends) | Week 10 |
| C-level seats | Week 12 |
| Eras | After week 15 (already seeded late) |

**3.4 Analytics:** a `feature_unlocked { feature, week }` event.

Done when: a new player sees 2 tabs in week 0, and the share of players who get past week 5 is up against the Phase 0 baseline.

### Phase 4: Chapter campaign + Free Play (12–15 days, OTA)

**4.1 Engine: chapter rules** (3–4 days)
- Add `src/game/chapters.ts` defining `ChapterDef { id, title, industry, startingCash, features, goal, eventDeck, balanceOverrides, rivalNames, canLose }`.
- `GameState` gets two optional fields: `mode?: 'campaign' | 'freeplay'` and `chapterId?: string`. `undefined` means freeplay, which covers every existing save.
- The engine reads its rules through `chapterRulesFor(state)` from a static table, so it stays pure (no React).
- Add `checkChapterGoal(state)` to `score.ts`. Hitting the goal triggers a scripted buyout card. The card can reuse the content shape of the `acquisitionOffer` effect in `events/types.ts`, but **not its run-ending path** (next bullet).
- **Chapter completion is its own state, not a `gameOver`.** Today an `acquired` ending sets `gameOver`, and that in turn:
  - redirects to `/game-over`
  - calls `retireAllHints()` (`game-over.tsx:153` and `:237`), which silences every hint and would silence the mentor right when chapter 2 starts teaching support, morale and rounds
  - fires `game_over` analytics
  - writes run history (`recordRun` in `game-store.tsx`)
  - may publish to the leaderboard

  For campaign runs, set a separate `chapterComplete` outcome instead, route to the chapter-complete screen, and fire `chapter_completed`. Hint retirement becomes per chapter (retire the hints for mechanics already taught). Only Free Play endings keep today's behavior.
- Free Play rules are exactly today's constants, so the snapshot test must stay green.

**4.2 Career store** (2 days)
- Add a store-layer module `src/state/career.ts` with its own AsyncStorage key, following the pattern of `run-history.ts`.
- It holds: chapters completed, attempts, best exit per chapter, net worth, lifestyle items, and whether Free Play is unlocked.
- It stays out of `GameState` on purpose: a run is one company, while the career spans many companies.

**4.3 Screens** (4–5 days)
- **Chapter map ("islands"):** a node per chapter, shown locked or unlocked, with the best exit on each. It becomes the home screen for campaign players (`src/app/index.tsx`).
- **Chapter intro:** 2–3 illustrated story cards covering who you are, the goal, and the new mechanic.
- **Chapter complete:** a big "Mission complete" moment. The exit amount flows into net worth, followed by a teaser for the next chapter.
- **Chapter failed:** retry the chapter (the career is kept), or revive (from ch.2 on).
- **HUD goal bar:** always visible, e.g. "Reach 100 customers: 34/100".

**4.4 Chapter 1, "only wins"** (2 days)
- Bankruptcy is off. If cash drops below 0, the mentor covers it ("I'll float you this week").
- Only positive scripted cards. No rivals, eras, focus or C-levels.
- Chapter 1 ticks don't spend weeks. The spend gate around `dispatch` lives in `src/state/game-store.tsx` (it calls `spendWeekFromPools`) and checks `state.chapterId` there. `src/state/week-budget.ts` stays pure logic.
- Acceptance test: the `newbie` bot completes chapter 1 on 50 of 50 seeds within 8 weeks.

**4.5 Wall + cliffhanger** (1 day)
- The wall lands mid-chapter 2. The copy in `day-complete-sheet.tsx` names the chapter's cliffhanger ("A buyer is circling your company").

**4.6 Migration and rollout** (1–2 days)
- In-flight saves continue as Free Play, untouched.
- Players with any run history or an active save get Free Play unlocked right away, and see the campaign offered as "New: Campaign".
- New installs go from onboarding straight into chapter 1. Trim `onboarding.tsx` to name + logo + go, since the chapter intro now tells the story.
- Leaderboard: only Free Play runs get published (check the publish path in `src/state/leaderboard-sync.ts`). A campaign board can come later.
- Analytics: `chapter_started`, `chapter_completed`, `chapter_failed`, `free_play_unlocked`.
- Rollout: about 6 new players a day is too few for an A/B test to finish quickly. Ship to all new installs, compare before/after cohorts on the Phase 0 dashboard, and rely on playtests.

### Phase 5: Meta, "get rich or die trying" (5–7 days, OTA)

**5.1 Net worth** (1 day)
- The founder take-home from a chapter exit (`founderStakeFor` in `balance.ts`) adds to career net worth. It's shown on the chapter map.
- **No farming.** Chapter 1 is free and can't be lost, so a replay that paid out would mean unlimited free money. Only the first completion of a chapter credits net worth, and a later replay credits only the difference when it beats the best exit. Replays stay free but pay nothing extra.

**5.2 Lifestyle shop** (2–3 days)
- A "Your Life" screen. Items come in tiers: apartment → car → house → penthouse → yacht → private island. A real-estate portfolio is a repeatable purchase.
- Each item is a trophy plus one small, capped perk that applies at the start of the next chapter. Examples:
  - Car: +5 hype ("you look successful")
  - Real estate: +X starting cash per chapter ("rental income")
  - Yacht: better terms on the first round ("networking")
- Perks are capped so the Phase 7 targets still hold. They are off in Free Play, which keeps the leaderboard fair.

**5.3 Trophy wall** (1–2 days)
- Past companies shown as cards (logo, name, exit), reusing `run-history.ts`. This plays the role of Football Manager's trophy cabinet.

**5.4 Analytics:** a `lifestyle_item_bought { item, net_worth }` event.

### Phase 6: Currency and monetization (2–5 days, after the legal answer)

**6.1 Choose a path based on the 0.1 answer**
- **Path A: fictional currency** (2–3 days)
  - Add a new currency name and symbol in `formatMoney` (`src/lib/format.ts`).
  - Fix the hardcoded `$` strings in `share-card.ts`, `widgets/snapshot.ts`, `clevel-draws.ts`, `score.ts`, `help.tsx`, `team.tsx` and `hq.tsx`.
  - Update the revive copy, the App Store screenshots and the store listing.
  - Real prices (`$1.99`) stay in dollars, because those are real money.
- **Path B: keep `$`, stop selling cash** (3–5 days)
  - The revive no longer grants cash. Replace it with either "Rewind 4 weeks" (needs saved snapshots) or "Restart the chapter with your progress kept".
  - This may need a new IAP product, which means App Store Connect review. Check that every territory is enabled before release.
- **Path C: cleared as-is.** No change; record the answer in this doc.

**6.2 Week packs stay**
- Retune `INITIAL_FREE_WEEKS` so the wall lands mid-chapter 2 (Phase 4.5). Compare 8, 10 and 12 weeks.

**6.3 Guardrails**
- Never sell hire rolls or anything random (loot-box rules).
- Every purchase delivers a known, fixed amount.

**6.4 Ads** (the designer mentioned them)
- Out of scope for now. Note them as a later experiment.

### Phase 7: Game economy (3–5 days, then after every balance change)

**7.1 Fill in the per-chapter targets, then tune to them**

| | Ch.1 | Ch.2 | Ch.3 |
|---|---|---|---|
| Weeks to win (newbie / average / expert bot) | 6–8 / 5–6 / 4 | 30 / 24 / 18 | 60 / 45 / 35 |
| Win rate (newbie bot) | 100% | 60–70% | 40–50% |
| First cash crisis around week | Never | 12–16 | 20–25 |
| Wall hits at chapter week | n/a | ~10 | n/a |

**7.2 Sim per chapter**
- Run every bot on 50 seeds and print win rate, weeks to win and the cash low point.
- Add the results to vitest as acceptance bounds.

**7.3 Live check**
- Once a month, compare real chapter win rates and lengths in PostHog with the targets. Retune each chapter's `balanceOverrides` and ship by OTA.

**7.4 Money-out vs time-out**
- For each chapter, map when a player first needs you for money (revive) and when they first need you for time (the wall). The designer's rule is that you pick these points on purpose.

---

## 5. Rules that apply to every phase

- **Saves:** every new `GameState` field is optional and has a safe default. The save key is never bumped.
- **Purity:** `src/game/` stays free of React, React Native and Expo imports.
- **Builds:**
  - JS and image changes ship through `eas update`. Confirm before every publish and bump `UPDATE_VERSION`.
  - Haptics and sound need `eas build`. Confirm first, and batch native changes into a single build.
- **New IAP products:** check that every territory is enabled in App Store Connect before release.
- **Analytics:** every new mechanic, unlock, chapter step and purchase gets an event in `src/analytics/events.ts`, captured centrally in the store.

## 6. Success metrics

"Weeks played" means cumulative `week_advanced` events per player, across all runs and chapters (see 0.3). "Today" figures come from the max-week query in section 2 and are close for current single-run players; re-baseline them on the cumulative definition in Phase 0.3.

| Metric | Today | Target after Phase 4 |
|---|---|---|
| Pressed Next Week at least once | 89% | 95% |
| Played more than 5 weeks | ~33% | 60% |
| Finished chapter 1 in the first session | n/a | 70% |
| Played more than 10 weeks | ~9% | 35% |
| D1 retention | Measure in 0.3 | +10 points |
| Wall → purchase conversion | Measure in 0.3 | Up |

## 7. Open questions (not blocking Phases 0–3)

1. Chapter industries and names: do you want to choose them, or should Claude propose a list?
2. Mentor character: a named persona, or a faceless "advisor"?
3. Art: AI-generated (the default), or hire an illustrator for the office scene?
4. Ads as a third monetization lever: run them as a later experiment?
5. Leaderboard: new installs won't play Free Play until they finish chapter 3, so few new players will reach the board for a while. Do guided runs (Phase 3) publish normally? Should a campaign board (e.g. net worth) come sooner?

---

## Appendix: homework (the designer's suggestion)

- **Game design basics:** Game Maker's Toolkit (YouTube) and the GDC talks on free-to-play, onboarding and FTUE (GDC Vault / the GDC YouTube channel).
- **Game economy:** Machinations.io (economy simulation tool + articles) and Deconstructor of Fun (teardowns of mobile F2P games, close to Playtika-style thinking).
- **Search terms:** "core loop vs meta loop", "FTUE mobile games" (first-time user experience), "F2P game economy design".
