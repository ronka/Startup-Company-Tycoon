# Friendly First-Run Onboarding — Plan

**Date:** 2026-07-21
**Goal:** Make the first session feel welcoming instead of overwhelming. A brand-new player should understand *the one thing that matters* (make weekly calls, press **Next Week**) before they ever see the dense HQ screen — and learn everything else progressively, in context.
**Related docs:** `docs/2026-07-04-onboarding-ceo-company-name.md` (existing name-capture onboarding).

---

## 1. The conversion job

| | |
|---|---|
| **Cold-install state** | "A startup tycoon game — looks fun, but the HQ screen throws burn, runway, valuation, focus, trends and news at me at once. What am I supposed to *do*?" |
| **Promised transformation** | "I'm the founder. My job is simple: make the weekly calls and don't run out of cash. I know exactly what my first move is." |
| **The ask (activation, not paywall)** | Press **Next Week** 3–5 times in the first session, survive the first decision card, and come back tomorrow when the week budget refills. IAP week-packs stay exactly where they are — *after* the player is hooked. |
| **Proof needed before the ask** | The game understands the founder fantasy, reflects the player's own choices back, and shows one concrete personalized result (their company, their strategy, their first week's outcome). |

By the time the player reaches HQ, they should think: *"This is my company. I know my first move."*

## 2. Design principles (project-specific)

1. **Respect the existing philosophy** (`first-run-hint.tsx:12-13`, PRD F11): no long forced walkthrough. The intro is a **short story (4 screens, ~30 seconds)**, then everything else is contextual.
2. **Questions must do double duty** — every question either personalizes the actual game state or builds commitment. No throwaway preference quizzes.
3. **Progressive disclosure over front-loading.** Teach Focus switching cost, trend phases, dilution, IPO gating *when the player first touches them*, via the existing `FirstRunHint` pattern — never in the intro.
4. **Reuse, don't invent:** `PrimaryButton`, `ThemedText`, `FirstRunHint`, the `Modal transparent` slide-up pattern (`WeekInReviewSheet`), theme tokens from `src/constants/theme.ts`. No new libraries.
5. **Always skippable.** A "Skip intro" text link on every intro screen jumps straight to name entry. Skipping is a valid choice, not a failure state.

## 3. Story arc

```txt
Fantasy hook ("you're the founder now")
-> Personal commitment (your name, your company)   [already exists]
-> Personal question that changes the game (founder type → starting Focus)
-> Reflection ("Got it — you're a product-first founder…")
-> The one promise ("Your job: make the weekly calls")
-> Guided first move (spotlight Next Week, first tick, Week-in-Review)
-> Progressive hints as new systems appear
```

## 4. Screen-by-screen blueprint

### Phase A — Intro sequence (extends `src/app/onboarding.tsx` into a small pager)

New players (no `profile.ceoName`) see A1 → A2 → A3 → A4. Returning CEOs starting a new game skip straight to A3 (they already committed; they may want a different founder type per run).

#### A1 — Fantasy hook (problem recognition)
- **Goal:** Make the player feel the founder fantasy in one line; set stakes without numbers.
- **Headline:** `You just quit your job.`
- **Body:** `You've got an idea, a little cash, and rent due in a few months. Time to build something people want — before the money runs out.`
- **Primary:** `Let's do this` · **Secondary:** `Skip intro` (→ A2 name entry)
- **Why here:** Opens with the player's motivation (play out the founder fantasy), not with the app's systems. Zero mechanics on this screen.

#### A2 — Name capture (small commitment) — *existing screen, reframed copy*
- **Goal:** Personal commitment. Keep the existing CEO-name + company-name inputs (`@expo/ui`) and two-lifetime storage exactly as they are.
- **Headline:** `Every startup starts with a name.`
- **Body:** `What should we call you, founder? And what's the company?`
- **Primary:** `Found {companyName}` (button label updates live with the typed name)
- **Why here:** Naming yourself and your company is the first act of ownership. This screen already exists — only copy changes.

#### A3 — Founder type (personal question → real personalization)
- **Goal:** One question that both commits the player and *actually sets the starting `focus`* in `newGame()` — real personalization, not theater.
- **Headline:** `What kind of founder are you?`
- **Options** (single-select cards, each maps to a starting Focus):
  - `Product perfectionist` — *Ship quality, win on craft* → `core`
  - `AI true believer` — *Ride the smartest wave in tech* → `ai`
  - `Hardware builder` — *Real things you can hold* → `hardware`
  - `Hype machine` — *Attention first, product later* → `hype`
- **Primary:** selecting a card advances. No skip on this one (it's one tap and it matters).
- **Why here:** After committing a name, the player states an identity. The answer configures their run, so the game immediately feels *theirs*. (Default remains `core` if intro was skipped.)

#### A4 — Reflection + the one promise (climax)
- **Goal:** Mirror the player's choices back, then make the single promise the whole game rests on.
- **Headline:** `{companyName} is live.`
- **Body (reflection, varies by A3 choice):** e.g. `You're a product-first founder — {companyName} will win on quality. Devs build it, customers pay for it, rivals copy it.`
- **Then the promise:** `Your job from here is simple: make the calls, one week at a time. Everything on the next screen is just information to help you decide. When you're ready — hit "Next Week".`
- **Primary:** `Take me to HQ` → `router.replace('/hq')`
- **Why here:** The player has committed (name), chosen an identity (focus), and been heard (reflection). Now the game collapses all its complexity into one instruction before showing the dense screen. This is the anti-overwhelm moment.

### Phase B — Guided first move (in-game, HQ)

#### B1 — Next Week spotlight (first HQ visit only)
- **Goal:** Convert the promise into the first action within seconds.
- **Form:** A one-time callout anchored to the **Next Week** button in `GameChrome` (`game-chrome.tsx:94`) — a small glowing pill/tooltip above it: `This is the whole game → advance a week`. Dismisses on first tap of Next Week (or tap-anywhere).
- **Storage:** `FirstRunHint`-style AsyncStorage key `startup-tycoon/hints/next-week-spotlight`.
- **Why here:** The first tick is the value preview — the player *sees* the loop work (numbers move, news fires, Week-in-Review recaps it). Nothing teaches the game better than one real week.

#### B2 — HUD decoder hint (first HQ visit)
- **Goal:** Defuse the four unexplained HUD numbers.
- **Form:** Replace/extend the current HQ `FirstRunHint` (`hq.tsx:59`) with: `Top bar: your cash, how many weeks it lasts (runway), customers, and the current week. Cash at $0 for 3 weeks = game over.`
- **Why here:** Runway and the bankruptcy rule are the only *lose condition* — the one piece of front-loaded knowledge that's non-negotiable.

#### B3 — First Week-in-Review framing
- **Goal:** Make the first recap land as "this is your feedback loop."
- **Form:** On the *first* `WeekInReviewSheet` only, prepend one line: `Every week ends like this — what changed, and why.` (gated by hint key `first-week-review`).
- **Why here:** Closes the loop: action (Next Week) → consequence (review). After this the player has the full core loop.

### Phase C — Progressive contextual hints (teach on first contact)

Extend the existing `FirstRunHint` pattern (keys under `startup-tycoon/hints/`):

| Trigger | Hint copy (draft) | Where |
|---|---|---|
| First decision card appears | `Decision cards are your weekly judgment calls. There's rarely a "right" answer — just trade-offs.` | one-line header inside `DecisionModal`, first time only |
| Week budget drops to last dot | `You get a few free weeks each day — the dots below. They refill tomorrow.` | near the dots meter in `GameChrome` |
| Week budget hits 0 (before `BuyWeeksSheet`) | `Out of weeks for today. Come back tomorrow — {companyName} will be waiting.` | soft framing so the paywall reads as optional, not a wall |
| First Market tab visit | `Two rivals want your customers. Quality and hype decide who wins the market.` | `market.tsx` (currently has no hint) |
| First Focus-switch modal open | `Switching focus costs ~4 weeks of drag — commit, don't flip-flop.` | focus-switch modal in `hq.tsx` |
| First time runway < 10 weeks | `Runway is getting short. The Money tab is where founders raise cash — before terms get ugly.` | HQ |
| Drawer never opened by week 6 | `Stuck on a term? The ☰ menu has a full glossary with your live numbers.` | HQ, points at hamburger |

Keep Team/Money hints as-is (`team.tsx:118`, `money.tsx:105`). Cap visible hints at **one at a time per screen** — a queue, never a stack.

## 5. Implementation tasks

1. **`src/app/onboarding.tsx` → step pager.** Local `step` state rendering A1–A4; horizontal slide or simple crossfade (reanimated available). New-vs-returning logic already exists (`isReturningCeo`, line 24) — returning CEOs enter at A3.
   Status: done
   Deviation: returning CEOs enter at **A2**, not A3. A3 has no company-name input, so skipping A2 would leave every later run named `Newco`. A2 already collapses to a single company field for a returning CEO, so it costs one tap and keeps naming intact.
2. **Founder type → starting focus.** Pass chosen focus through `startNewGame` (`game-store.tsx:555`) into `newGame()` (`src/game/engine.ts:141`) as an optional param (default `'core'`, so all other call sites — `game-over.tsx`, `settings.tsx` debug — are untouched).
   Status: done
3. **Profile flag.** Add `onboardingVersion: number` to `PlayerProfile` (`game-store.tsx`), persisted alongside `ceoName` in `PROFILE_STORAGE_KEY`. Gate the *full* intro (A1) on `!profile?.onboardingVersion`; version it so a future revamp can re-show. `resetAll()` already clears profile → intro correctly re-triggers.
   Status: done
4. **Spotlight component.** New `src/components/game/spotlight-hint.tsx` — positioned tooltip w/ subtle pulse (reanimated), AsyncStorage-gated like `FirstRunHint`. Used for B1 (and reusable later). **Do not** use a `Modal` for this — avoids the documented iOS stacked-modal bug (`docs/bug-stuck-decision-modal.md`).
   Status: done — renders in normal flow directly above the Next Week button (no `Modal`, nothing to stack); visibility is owned by the caller so the same tap that ticks also retires it.
5. **Hint queue.** Small helper (extend `first-run-hint.tsx`) ensuring max one hint visible per screen; first-unseen-wins.
   Status: done — `useFirstRunHint(id, scope?)` plus a module-level slot map. Scopes in use: `hq` (decoder / short-runway / drawer) and `chrome` (spotlight / last-dot / out-of-weeks). Hints that can't collide (market, decision card, week review, focus switch) pass no scope.
6. **Copy pass** on B2/B3 + Phase C hints per the table above.
   Status: done — all seven Phase C hints wired, plus B2 and B3. "Drawer never opened by week 6" is tracked by having `Hud.openMenu` write the `drawer-glossary` hint key, so finding the menu unaided retires the nudge.
7. **Settings:** add "Replay intro" row in `settings.tsx` (clears `onboardingVersion` + hint keys) — useful for QA and curious players.
   Status: done
8. **Analytics** (PostHog, `src/analytics/events.ts`): `onboarding_intro_started`, `onboarding_step_viewed {step}`, `onboarding_founder_type {focus}`, `onboarding_skipped {at_step}`, `onboarding_completed`, `hint_shown {id}` / `hint_dismissed {id}`. Funnel: install → intro complete → first tick → 3 ticks → day-2 return.
   Status: done — all events added to `EVENTS` and fired, plus `onboarding_replay_requested`. `game_started` now also carries `focus`. The funnel itself still has to be built in the PostHog UI.

**Suggested order:** 3 → 1 → 2 → 4/5 → B-phase wiring → C-phase hints → 7 → 8.

**All 8 tasks implemented (2026-07-21).** Verified by `tsc --noEmit`, `eslint src`, and `vitest run` (336 tests pass) — the remaining tsc/eslint errors are pre-existing and in untouched files. Not yet verified on a device: the intro sequence, the spotlight, and the hint queue have no automated coverage, so a manual first-run pass (fresh install or Settings → Replay intro) is still outstanding.

## 6. Out of scope (deliberately)

- No changes to IAP flow, pricing, or `BuyWeeksSheet` mechanics — only the one soft-framing line before it.
- No interactive "forced tutorial run" (scripted first 3 weeks). Revisit only if analytics show players stalling before tick 1 despite the spotlight.
- No i18n — app is English-only today; keep copy inline like the rest of the codebase.
- No review prompt in onboarding — the right moment for a store review is a later value peak (first funding round or first profitable week), tracked separately.

## 7. Review checklist (from onboarding design principles)

- [x] Starts from the player's fantasy/problem, not a feature list (A1)
- [x] Every question personalizes or commits — founder type sets real game state (A3)
- [x] Answers reflected back (A4)
- [x] Concrete value preview before any ask — first real tick + Week-in-Review (B1/B3)
- [x] Monetization ask stays after value/commitment — week-budget paywall untouched, softened framing (C)
- [x] Clear intro → climax (A4 promise) → conclusion (first tick lands)
- [x] Targets activation (first ticks + day-2 return), not just education
