# Long-term progression: seasons and big milestones

**Date:** 2026-10-18
**Status:** Discussion draft. Nothing is built. Decide the four questions below first.
**Builds on:** the guided mission ladder (`src/game/unlocks.ts`, `missions-card.tsx`), `plans/2026-10-18-first-weeks-journey-plan.md`, and the designer feedback in `plans/2026-10-10-game-designer-feedback-plan.md`.

---

## The idea in one paragraph

Today's missions end at week 10. After that, `MissionsCard` returns null and the player is back in a goal-less sandbox. That's the "what's around the next corner?" gap the designer described. This plan keeps the **same company and the same screens**, and gives the run a rhythm:

- **A season every 10 weeks (small milestone).** Each season has 2–3 goals in the missions card, a "Season N complete" beat, and a preview of the next season.
- **An act every 3 or so seasons (big milestone, the "islands").** Each act is tied to a moment the engine already has: first funding round, the Boom era, Series B, the Reckoning, the IPO. The act gives the company a new name in the header, a new office stage, and a celebration.

No new routes, no chapter map, no reset between companies, and no change to monetization.

## Decisions for you

| # | Question | My recommendation |
|---|---|---|
| 1 | Does this **replace** Phase 4 (chapter campaign with a chapter map and resets) and Phase 5 (the "Your Life" shop screen) of the designer plan? | **Yes.** The advisor-plans doc already confirmed "same company continues, no chapter reset". This plan delivers chapter-like story beats without new screens. Phase 5's net-worth idea comes back in a light form (feature 8). |
| 2 | Do seasons apply to **every run**, or only guided runs? | **Every run.** Seasons are UI and store only, so they can't change the simulation. A veteran save at week 34 just starts on season 4. |
| 3 | Can season rewards change the economy (cash, hype, morale), or are they cosmetic only? | **Cosmetic + a free hire roll at first.** Economic perks change the leaderboard and the sim snapshot. Add them later only if the data says rewards feel empty. |
| 4 | The **week-9 lowball buyout** (`scrappy-acquisition-feeler`) ends a third of finished runs before the first season beat shows. Move it later? | **Yes, to season 2 or later** (week 12+). It's one engine number, but it changes the sim snapshot, so it's a deliberate re-baseline. |

## Why this order of priority

From the PostHog numbers in the designer plan:

- 91% of players leave before week 10. The first-weeks plan is handling that.
- **Bankruptcy has a median of week 20.** Season 2 (weeks 11–20) is the season that matters most. Its goals should point straight at the cash cliff: raise seed, or get runway back above 20 weeks.
- **Acquisitions have a median of week 9**, which is mostly the early lowball offer (decision 4).
- Almost nobody gets past week 30 yet. Everything after Act 2 is a content bet, so build it last and keep it cheap.

## Cadence: what "every 10 weeks" means

- The week bank holds 10 weeks and refills in about 6 hours (36 min × 10). So **10 weeks is one full bank, not one calendar day**. After the first day the wall won't land on a multiple of 10.
- Seasons are keyed to `state.week` (season N = weeks 10(N−1)+1 to 10N), not to the bank.
- When the wall lands mid-season, the existing `day-complete-sheet.tsx` shows **progress on this season's goals** ("2 of 3 done, 4 weeks left"). That's the cliffhanger, using a sheet that already exists.
- When a season ends, its beat shows in the next week's review (the same place unlock banners show today).

## The season map

Week numbers for acts are per run: Boom starts at weeks 25–35 and the Reckoning at 55–70 (seeded jitter in `newGame`). Acts start on the engine event, not on a fixed week, so they follow the player's actual story.

| Act (big milestone) | Season | Weeks | Example goals (picked from a pool, 2–3 per season) | Season reward |
|---|---|---|---|---|
| **Act 1: The Garage** | 1 | 0–10 | Today's 6-quest ladder, unchanged | Title "Founder" |
| | 2 | 11–20 | Raise your seed round · Runway above 20 weeks · 30 customers · Hire your first support person | Free hire roll |
| | 3 | 21–30 | $10K monthly income · Product quality ahead of one rival · Fill your first leadership seat | Office decoration |
| **Act 2: The Boom** — starts when the Boom era starts | 4 | 31–40 | Raise Series A · 100 customers · Ride a trend at its peak | Free hire roll |
| | 5 | 41–50 | 10% market share · Morale above 60 with 20+ staff · Overtake your nemesis rival | Office decoration |
| | 6 | 51–60 | Raise Series B · Weekly revenue of $50K | Title "Scale-up CEO" |
| **Act 3: The Reckoning** — starts when the Reckoning era starts | 7 | 61–70 | Survive 10 weeks of the Reckoning without layoffs · Income above spending (profitable) | Free hire roll |
| | 8 | 71–80 | Hold your market share · Outlast a rival (rival death exists in `rivals.ts`) | Office decoration |
| | 9 | 81–90 | Revenue above the IPO bar ($150K/week) | Title "Unicorn" |
| **Act 4: The Bell** — starts when IPO becomes possible | 10+ | 91+ | Hold the IPO bar 4 weeks · Ring the bell (IPO) | Trophy "Rang the bell" |
| **Endless** (later) | 11+ | 100+ | Rotating goals from the pool: records, share, profit | Badges |

Goals are placeholders. They get tuned with the sim bots and the four focus profiles (a `hype` founder and a `core` founder need different routes).

**Acts carry the story without new screens:**
- An act name under the company name in the header ("Act 2 · The Boom").
- The office stage moves up: garage → loft → office floor → tower. This ties into the office scene that already exists (`office-card.tsx`).
- The engine already swaps the event deck per era (`ERA_DECKS`), so each act already feels different. This plan just gives it a name and a moment.

## Feature list

Each feature is tagged so you can see how big and how UI-changing it is.
- **UI:** none / existing card / existing sheet / existing route
- **Engine:** does `src/game/engine.ts` or the event decks change (and the sim snapshot need a re-baseline)?
- **Size:** S ≈ ½–1 day, M ≈ 2–3 days, L ≈ 4+ days

### Core (the plan itself)

| # | Feature | What it is | UI | Engine | Size |
|---|---|---|---|---|---|
| 1 | **Season goals** | Pure `seasonGoals(state)` next to `questLadder` in `unlocks.ts`. A goal pool keyed by act, filtered by what the run can do (no "raise Series A" if already raised). New optional field `seasonGoalsDone?: string[]`, same pattern as `questsDone`. `MissionsCard` shows the season once the ladder is done instead of returning null. | Existing card | No | M |
| 2 | **Season-complete beat** | At the end of each season: "Season 2 complete: 3 of 3 goals" plus a teaser of season 3's goals. Shows in the week review; a short confetti if all goals are done. | Existing sheet | No | S |
| 3 | **Wall shows season progress** | `day-complete-sheet.tsx` gets one line: "Season 3: 2 of 3 done, 4 weeks left". Pairs with `tomorrowAgendaFor` in `day-close.ts`. | Existing sheet | No | S |
| 4 | **Acts** | Pure `actFor(state)` from era, stage and IPO eligibility. Act name in the company header, act-start celebration, office stage step-up. | Existing card | No | M |
| 5 | **Rewards** | Titles, office decorations, and a free hire roll through the existing `rollGrantsEarned` path (rolls are never sold, so this is safe). | Existing card | No | S |
| 6 | **Analytics** | `season_completed { season, goals_done, week }`, `act_started { act, week }`. Captured centrally in the store like the rest. | None | No | S |

### Add-ons that make the long game richer (pick any)

| # | Feature | What it is | UI | Engine | Size |
|---|---|---|---|---|---|
| 7 | **Nemesis rival** | One of the two existing rivals is named "your nemesis" each act. Goal: overtake them. Rival news gets a sharper tone ("Your nemesis just raised"). Uses the rival data that already exists. | Existing card (Market) | No | S |
| 8 | **Trophy shelf + personal bests** | In the existing history screen: trophies earned per run (e.g. "Survived the Reckoning", "Monopoly", "Rang the bell"), plus records like best week, top valuation and longest run. Covers the trophy-wall part of Phase 5 without a new screen. | Existing route (`history.tsx`) | No | M |
| 9 | **Serial founder** | Across runs: after your first exit, the next company starts with your title and your best trophy in the office. Cosmetic only unless decision 3 changes. | Existing card | No | M |
| 10 | **Story arcs per act** | New event cards that chain across seasons through the existing `storyFlags`, e.g. a co-founder drama over 3 seasons, or a big-customer saga in the Boom. Content, not new systems. | None (existing decision modal) | **Yes** (deck content) | M per arc |
| 11 | **Session goal** | One small bonus goal per full bank, e.g. "This session: win 10 customers". Done = a streak tick or a cosmetic. Gives every return visit something to finish. | Existing card | No | S–M |
| 12 | **Season push notification** | "Season 3 ends in 2 weeks: 1 goal left." Added as a tier in `notification-content.ts` (and its twin in `day-close.ts`, which the code says must stay in sync). | None | No | S |
| 13 | **Move the week-9 feeler** | Decision 4. Draw `scrappy-acquisition-feeler` no earlier than week 12. | None | **Yes** | S |

## Build order

1. **Season 2 only** (features 1, 2, 3, 6 for weeks 11–20). This tests the whole idea where the data says it matters most: the week-20 bankruptcy cliff. About 4–5 days, OTA.
2. **Seasons 3–6 + Acts 1–2** (features 4, 5, 7). About 4–5 days, OTA.
3. **Act 3, Act 4 and the trophy shelf** (feature 8). Only once some players reach week 40+.
4. **Content and cross-run** (features 9, 10, 11). Driven by what PostHog shows.

Feature 13 can ship with step 1 if decision 4 is yes.

## Rules (the same as the rest of the project)

- New `GameState` fields are optional with safe defaults. No save key bump.
- `src/game/` stays pure. Season and act logic lives in pure functions with vitest tests.
- Features 1–9, 11 and 12 don't touch the engine, so the sim snapshot must stay byte-identical. Features 10 and 13 re-baseline it on purpose.
- Monetization unchanged: no cash rewards, no bonus weeks, nothing random for sale.
- Ships by OTA. Confirm before every `eas update`.

## How we'll know it works

| Metric | Today | Target |
|---|---|---|
| Players past week 20 (cumulative `week_advanced`) | Measure on the baseline dashboard | Up |
| Bankruptcy share of finished runs | 66% | Down |
| Median week of bankruptcy | 20 | Later |
| Players who complete season 2 | n/a | Track from launch |
| Return after the wall (next-day session) | Measure | Up |

## Open questions (not blocking)

1. Act names and season themes: keep these placeholders, or do you want to name them?
2. Should a run end on purpose after the IPO, or continue into "Endless" seasons as a public company?
3. Does a bankruptcy revive keep season progress? (Default: yes, it's the same company.)
