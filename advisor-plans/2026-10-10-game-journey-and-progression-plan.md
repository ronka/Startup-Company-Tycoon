# Make Startup Empire Tycoon feel like a game

**Date:** 2026-10-10  
**Status:** TODO — product and implementation plan; no gameplay changes made  
**Planned against:** `ed6e11a`; working tree was clean at inspection  
**Priority:** P1  
**Scope:** First ten weeks, simpler HQ, and visible office growth; guided opening followed by the existing sandbox, with monetization unchanged.  
**Planning basis:** Supplied conversation summary plus inspection of the current repository. This is not a live usability study or a fresh analytics audit.

## Confirmed product decisions

These choices were made by Ron in the follow-up discussion and supersede the broader campaign proposal in the first draft.

| Decision | Confirmed direction | Implementation consequence |
|---|---|---|
| Main player reward | Watching the company grow from an empty office into an empire. | Office transformations and visible business progress are central; the scene is not incidental decoration. |
| Journey | Guided opening, then sandbox freedom. | The same company continues after week 10. No campaign selection, chapter reset, or forced acquisition. |
| Monetization | Keep current allowances, waiting periods, and products unchanged. | Preserve initial grant, regeneration, bank cap, spending order, week packs, revives, and entitlements. |
| Next release | First ten weeks, simpler HQ, and visible office growth. | Changes outside this slice are limited to integration and regression protection. |
| Teaching | Reveal controls gradually, with skip guidance and early recovery tools. | Progressive disclosure is reversible guidance; it is not a mandatory tutorial or a new set of economic restrictions. |

The proposed 2D office, exact objective thresholds, copy, and effort estimates remain implementation recommendations. They were not separately selected by the user.

## 1. The decision

Build a coherent first ten weeks around the existing simulation, then hand the same company back to the player with full sandbox freedom. Keep the office and concise feedback useful after guidance ends.

The immediate problem is that the game gives players many management tools without consistently explaining what they are trying to accomplish next or making the result feel tangible. A new player should be able to answer three questions at almost any moment:

1. What am I trying to achieve?
2. What can I do now to get closer?
3. What changed because of my last decision?

The first deliverable is a small, complete gameplay slice: an empty office becomes a functioning startup, customers arrive, the player solves a visible problem, and a milestone previews the next challenge. Do not start by building a large campaign, lifestyle store, or new premium currency.

All week numbers, thresholds, conversion targets, and effort estimates below are **design hypotheses**, unless explicitly identified as existing behavior. Validate them through simulation and playtests before treating them as final targets. The confirmed product constraints above are requirements, not hypotheses.

## 2. What already exists, and what is missing

| Area | Current repository evidence | Implication for this plan |
|---|---|---|
| Story introduction | `src/app/onboarding.tsx` already has the quit-your-job hook, identity setup, founder focus, reflection, and acquisition/IPO/bankruptcy explanation. | Shorten and connect the introduction to play. Another long introductory slideshow will not solve the problem. |
| Opening state | `src/game/balance.ts:46–56` starts with 250,000 company cash, no employees, zero product quality, and zero customers. | The empty-office starting point already supports a visible transformation. The first objective must get someone building. |
| HQ hierarchy | `src/app/(game)/(tabs)/hq.tsx` renders company metrics, leaderboard, hints, valuation/morale, a metric grid, strategy, and news inside a scroll view. | Replace the default reading order with objective → office → action → consequence. Keep detailed figures accessible. |
| Persistent metrics | `src/components/game/hud.tsx` already shows cash, runway, and users. HQ repeats some of these concepts and emphasizes valuation. | Avoid duplicating metrics; prioritize company survival and current objectives over valuation in the opening. |
| Visuals | `src/components/game/game-art.tsx` displays static HQ/team/money/market images; animated numbers, gauges, and sparklines already exist. | Add visuals tied to actual state changes. This is more specific than adding decorative art or animating every number. |
| Weekly consequences | `src/game/digest.ts`, `week-in-review-sheet.tsx`, and `week-ticker.tsx` already summarize changes. | Reuse the result pipeline, emphasizing the player's action and its consequence. |
| Endings | `src/game/types.ts` has bankruptcy, acquisition, and IPO; `src/game/score.ts` and `src/app/game-over.tsx` support exits and founder proceeds. | Keep existing endings and eligibility unchanged; explain these longer-term possibilities at the sandbox handoff. |
| Long-run escalation | `src/game/balance.ts:734–738` starts Boom around weeks 25–35 and Reckoning around 55–70. | Existing long-run depth arrives later than the opening. Add early objectives without globally compressing the entire simulation. |
| Persistent identity | `PlayerProfile` in `src/state/game-store.tsx:156` stores CEO identity and onboarding version. Run history stores up to 50 completed runs. | Preserve identity and history. A new career ledger is outside this release. |
| Access economy | `src/state/week-budget.ts:17–25` currently grants 10 initial free weeks, caps the free bank at 10, and regenerates one week every 36 minutes. Purchased weeks are separate and survive new runs. | The opening mini-arc should fit within ten ticks. Preserve purchased balances and keep access limits outside the simulation. |
| Purchases | The current game has week packs and bankruptcy revive behavior; `REVIVE` grants company cash through the engine. | Preserve the current products and effects. Distinguish company cash from real store prices in explanations. |
| Testing | Pure game/state tests use Vitest; `scripts/sim.ts` runs seeded strategy bots. | Extend these seams to validate progression and balance before polishing the opening. |

### Existing plans to reconcile

- `docs/2026-07-21-friendly-onboarding-plan.md` previously centered the first move on **Next Week**. This proposal supersedes that recommendation for new guided runs: the first move becomes a meaningful hiring/product decision, followed by a tick.
- `advisor-plans/2026-07-25-day-one-closing-panel.md` and `2026-07-25-arm-reengagement-at-the-wall.md` provide existing closing-panel and re-engagement work. Reuse those components.
- Older documents describe five-week daily allowances and midnight refills. Current source uses ten initial weeks and continuous regeneration. Do not copy obsolete budget assumptions.
- `docs/2026-09-29-posthog-review-and-improvement-plan.md` provides historical observations, not a current baseline. Its small-sample results must not be presented as proof that this new design will improve retention.

## 3. Turn the feedback into decisions

| Feedback | Proposed response | Priority |
|---|---|---|
| Dashboard/sandbox feeling | One active mission, a visible company, short cause-and-effect feedback, and an understandable next goal. | P1 |
| No clear core loop | Make a decision → advance the week → see its consequence → complete an objective → unlock a new choice. | P1 |
| Too much information | Progressive disclosure, a compact HQ, plain-language labels, and detailed sheets. | P1 |
| Everything exposed immediately | Reveal controls based on demonstrated progress, with approximate week pacing, a skip option, and early recovery access. | P1 |
| Next Week dominates | Use contextual action priority. Advancing time is primary when the player is ready to resolve their plan. | P1 |
| Weak graphical feedback | Office changes, confirmed hires, customer/product progress, and a small number of meaningful celebrations. | P1 |
| Resources are unclear | Separate spendable company cash, performance indicators, play allowance, and existing founder exit proceeds. | P1 |
| Broader audience | Test with people outside tech; explain terms in context. Broader comprehension is the first objective. | P1 |
| Startup chapters | Not selected: use a guided opening that hands off to the current sandbox. | Out of scope |
| Career/empire/lifestyle | Express growth through the current company and its office; defer cross-run wealth, status, and lifestyle systems. | Out of scope |
| Monetization opportunities | Keep allowances, waits, products, and existing offer rules unchanged. | Fixed constraint |
| Economy needs design | Document sources/sinks, model first-session pressure, and simulate good, poor, and exploitative strategies. | P1 |

Interpret “no scrolling” as **no required scrolling to understand the immediate objective and act at standard text size**. History, detailed rosters, and financial explanations can scroll. At large accessibility text sizes, allow scrolling rather than clipping content or shrinking text.

Interpret “HR at Week 10” as an example of pacing, not a requirement to create an HR department. The game currently has developers, sales, support, and leadership. Teach those first.

## 4. Define the player journey

### Player promise

“Build your first team, watch your startup come alive, then grow it your way.”

The main reward is a visible transformation from an empty office to an operating company. Business decisions drive that transformation. Existing acquisition and IPO paths remain long-term possibilities rather than prescribed chapter endings.

### Connected loops

| Loop | Player action | Reward | Next decision |
|---|---|---|---|
| A week | Hire, improve the product, manage demand, or resolve an existing event. | A visible company change and understandable customer/cash/team consequences. | Address the next bottleneck. |
| The opening | Complete a short sequence of real business objectives. | A functioning office, learned controls, and confidence to run the company. | Choose a personal sandbox goal. |
| The sandbox | Pursue growth, profitability, resilience, or an existing exit. | Continued office growth and the current game's business outcomes. | Adapt strategy using all available tools. |

### Week-10 handoff

- The existing company continues with the same cash, employees, customers, ownership, RNG state, and play-week balances. No reset, chapter transition, or new grant occurs.
- End automatic onboarding restrictions by week 10 even if optional lessons are unfinished. Do not keep a slower player trapped in a tutorial. Offer unfinished lessons as optional help.
- Celebrate only actual accomplishments. Record opening success separately from the fact that guidance ended.
- Reveal all existing controls that the original game would allow; retain original eligibility checks, including funding and IPO requirements.
- Offer a dismissible goal suggestion based on current state, such as improving product quality, growing customers, or becoming profitable. It must not create a new mandatory quest system.
- Keep the office as the main visual anchor. Advanced figures remain accessible through details without restoring the original dense default HQ.
- At exhausted play weeks, this handoff and management access still work; the next tick follows the unchanged regeneration/purchase rules.

Keep the existing founder-focus choice. Guidance and thresholds must work for all four focus profiles. Adapt the recommended route or objective thresholds to their actual mechanics rather than overriding the choice or inventing a separately balanced campaign.

## 5. Design the first ten weeks

Week 0 is setup; weeks 1–10 mean completed simulation ticks. The table is a target sequence, not a rigid script that assumes every player acts identically.

| Week | Story beat and objective | Player decision | New concept | Visible result / reward |
|---|---|---|---|---|
| 0 | “An idea needs someone to build it.” Queue the first developer. | Review the weekly salary and queue one developer. | Hiring costs money each week. | A reserved desk; clear “starts next week” copy. |
| 1 | “Your first teammate starts.” Begin building. | Advance the planned week. | Decisions resolve over time. | The desk fills after the hire commits; product progress appears. |
| 2 | “Make something people can use.” Reach the first product milestone. | Keep a lean team or invest in one more developer. | Faster progress costs more. | Product prototype changes visually; one sentence explains the trade-off. |
| 3 | “Someone tried your product.” Acquire the first customers. | Review product readiness and the customer outcome. | Quality affects customer conversion. | First-customer acknowledgement linked to actual engine results. |
| 4 | “Can you reach more people?” Try a sales hire. | Compare growth potential with added weekly cost. | Sales expands demand. | Sales desk and a preview of expected direction, without guaranteed projections. |
| 5 | “The idea is becoming a business.” Complete the first small milestone. | Review what the first team achieved. | A goal can span several weeks. | One compact celebration plus a tangible office improvement. |
| 6 | “Customers need help.” Learn support when demand justifies it. | Hire support if capacity is becoming tight. | Growth creates service obligations. | Support pressure is visible and its remedy is directly reachable. |
| 7 | “Your team has limits.” Understand a team trade-off. | Use an existing event if one occurs; otherwise compare the existing morale action with conserving cash. | Decisions have costs beyond growth. | A character reaction and one clearly attributed consequence; do not force an event on this week. |
| 8 | “How long can you keep going?” Inspect cash and runway. | Compare staying lean with a funding option if appropriate. | Cash remaining versus recurring spending. | A simple cash timeline; optional funding becomes legible. |
| 9 | “A bigger opportunity is ahead.” Learn ownership. | Review funding terms; raising is optional. | More company cash can mean less founder ownership. | Plain-language before/after ownership; no mandatory dilution lesson through forced purchase. |
| 10 | “Your company, your call.” Hand off to the sandbox. | Review actual accomplishments and optionally choose a suggested goal. | The player now chooses their own direction. | Office progress recap, full control visibility, and the same continuing company. |

### Objective and pacing rules

- Each objective needs a stable ID, prerequisites, a completion predicate, an action destination, success copy, and a recovery hint.
- Complete goals from authoritative game state, not from tapping a tutorial button. Viewing the Team tab is not equivalent to hiring.
- Queueing a hire gives immediate acknowledgement; only committed headcount earns the hire-completed milestone.
- Check goals after all relevant actions, including funding and event choices, not only after ticks.
- If the player already achieved a goal, mark it complete without making them repeat it. Aggregate multiple completions into one recap.
- If an outcome is late, retain the actionable objective and explain the bottleneck. Do not celebrate nonexistent customers because the calendar says week 3.
- Target a meaningful win by week 3 and a first mini-arc by week 10 for the recommended route. If simulations cannot deliver this, adjust the recommended decisions or objective thresholds. Do not extend the allowance or add cash/customer grants to force success.
- Do not require a premium purchase, leadership roll, or lucky random card to finish the opening.
- Never lock the only recovery action. Support must become available when capacity is threatened, even if that happens before week 6. Funding must be inspectable earlier when solvency requires it.
- When an existing random event needs a hidden capability, reveal the relevant control and explain it before the player must act. Preserve event cadence, draws, and seeded outcomes.
- Training wheels mean timely warnings, understandable costs, and reachable remedies. They do not grant immunity, free cash, guaranteed sales, or improved event odds.
- Keep “Skip guidance” reachable from the start and during the opening. It immediately reveals existing controls and dismisses teaching overlays without spending a week, resetting the company, altering mechanics, or granting rewards. Optional help can be reopened later without rehiding controls.
- At the free-week limit, show what was accomplished and when the next week becomes available. Do not promise a “tomorrow” refill when the actual timer is 36 minutes.

### First-session success definition

A new player can hire, advance time, explain one customer or cash change, and identify the next goal without a moderator teaching the interface. They see a meaningful reward before the play allowance runs out.

## 6. Redesign the information hierarchy

### Default HQ order

1. **Compact status:** company cash and one contextual health indicator; add customers once relevant. Current week and available play weeks remain clearly distinguished.
2. **Active mission:** a short story line, measurable progress, and the action that moves it forward.
3. **Office:** a compact stateful scene reflecting the company and its current milestone.
4. **Last consequence:** one sentence explaining the most relevant result of the last action/week.
5. **Action area:** a single visually dominant action with secondary access to time advancement when appropriate.

Move valuation history, detailed finances, market share, full news, leadership statistics, and leaderboard promotion into secondary views or later progression. Early valuation is less useful than understanding whether the team can build and the company can pay it.

### Action priority

| Current condition | Primary action | Handling of Next Week |
|---|---|---|
| Unresolved decision | Resolve the decision. | Disabled with a reason. |
| Immediate survival threat with an available remedy | Inspect funding or reduce planned spending. | Available after the warning; do not trap the player in an impossible remedy. |
| Mission requires an action | Open the relevant action surface, such as hiring. | Secondary, with the cost of waiting clear. |
| Hires are queued / weekly plan is ready | “Start the week” or “Run next week.” | Primary; show queued changes succinctly. |
| Waiting is the next useful step | “Next Week.” | Primary. |
| No play weeks remain | Show the refill countdown and useful management actions. | Explain the access limit separately from company cash. |

Use one shared action resolver so the mission card and persistent chrome do not recommend conflicting actions. Preserve the store's actual dispatch checks as the final authority.

### Screen changes

HQ and onboarding receive the substantial redesign. Team, Money, and Market changes are limited to progressive disclosure, concise explanations, and necessary navigation; a full redesign of every tab is outside this release.

| Surface | Change |
|---|---|
| Onboarding | Keep the story hook and identity. Move lengthy rules into contextual lessons. Show the first mission immediately after entry. |
| HQ | Replace the valuation-dominated dashboard with the order above. |
| Team | Begin with basic roles and readable per-week cost. Reveal support and leadership when useful. Keep detailed rosters in expandable sections/sheets. |
| Money | Lead with cash, spending, and how long cash lasts. Put dilution and advanced valuation behind explanations. |
| Market | Reveal once customer acquisition is relevant; emphasize a decision or bottleneck before competitor statistics. |
| Week review | Lead with “You did X; Y happened.” Show at most a few important changes, with full detail available. |
| Game over | Preserve the existing screen and outcomes; ensure no guidance overlay blocks bankruptcy, revive, or restart. |

Guidance must have a distinct visual form: character/avatar, action verb, progress, and a button. Passive metrics should not use the same treatment. Use icon and text labels, not color alone.

## 7. Make actions visibly matter

Build a small 2D office, using the existing rendering stack where possible. Avoid a navigable 3D office or an office-building economy in the first release.

| State change | Feedback | Durability |
|---|---|---|
| Hire queued | Reserved desk / pending badge with salary preview. | Until committed or cancelled. |
| Hire committed | Employee appears in the appropriate role zone. | Derived from current headcount. |
| Product milestone | Prototype, screen, or product display improves. | Derived from earned milestone. |
| First customers / major customer goal | Customer acknowledgement and visible customer activity. | Milestone persists; transient celebration does not replay on every launch. |
| Funding succeeds | Brief funding acknowledgement with cash and ownership consequences together. | Financial state remains authoritative. |
| Morale or support deteriorates | Clear visual cue plus readable explanation and remedy. | Tracks actual state. |
| Acquisition / IPO | Retain existing ending presentation; no new closing sequence in this release. | Existing run history persists. |
| Bankruptcy | Retain the existing outcome and recovery flow; clear guidance overlays. | Existing history and revive behavior remain unchanged. |

Rules:

- At small team sizes, show individual employees. At larger sizes, aggregate by role so rendering cost does not grow with thousands of staff.
- Distinguish decorative characters from named C-level hires. Do not invent employee identities that the simulation does not store.
- Do not fabricate a “major sale” if the engine only models aggregate customers. Use a real customer milestone, or add a separate sale event later.
- Use one feedback coordinator. Required decisions and game-over state take precedence; combine mission and unlock celebrations with the weekly recap where possible.
- Never stack a mission celebration, weekly recap, day-complete panel, permission prompt, and review request.
- Keep routine feedback brief and nonblocking. Reserve new larger celebrations for firsts and the opening milestone; retain existing exit presentation.
- Honor reduced motion and provide text equivalents. Audio and haptics are later enhancements, not prerequisites for understanding an outcome.
- Queue state changes immediately; a backgrounded app must resume to correct state even if an animation was skipped.

## 8. Define the resources and economy

### Resource vocabulary

| Concept | Category | Sources / increases | Sinks / decreases | Presentation |
|---|---|---|---|---|
| Company cash | Spendable simulation resource | Customer revenue, funding, explicit event outcomes. | Payroll, fixed/variable costs, paid operating choices. | Wallet/cash icon; consistently labeled company funds. |
| Product quality | Performance state | Developer effort and explicit improvements. | Decay and event effects. | Product progress; exact details on demand. |
| Customers | Business state | Converted demand. | Churn. | People icon and understandable growth/loss. |
| Morale | Team condition | Existing morale actions and positive events. | Pressure, layoffs, adverse events. | Team mood plus label. |
| Hype | Temporary demand/valuation modifier | Events and relevant focus effects. | Decay and negative events. | Attention icon with a plain-language explanation. |
| Founder ownership | Economic stake | Initial ownership; any explicitly modeled future changes. | Dilution from raising funds. | Ownership percentage at the point of a funding decision. |
| Play weeks | Access allowance | Timed regeneration and existing purchases. | A successfully processed tick. | Separate clock/calendar identity. Never label this company cash. |
| Founder proceeds | Existing exit outcome | Existing score calculation on an exit. | No new spendable career system. | Existing game-over/history surfaces; separate from company cash. |

Do not turn every indicator into a currency. Product quality, morale, and customers do not need a new shop or exchange rate.

### Currency decision

Keep simulation amounts, currency formatting, and current products unchanged. Explain that company cash is fictional game money and distinguish it from real store prices and available play weeks. Do not introduce a new currency, rename products, alter revive benefits, or rewrite purchase offers in this release.

Record any currency confusion observed in playtests for future consideration. The original feedback's fictional-currency suggestion does not override the user's confirmed scope.

### Economy worksheet and simulation

Create a reproducible model with one row per simulated week and columns for:

- Starting cash, revenue, each expense category, event/funding movements, and ending cash.
- Headcount by role, product quality, customers acquired/lost, morale, ownership, and runway.
- Mission progress, control reveals, earned cosmetic milestones, and guidance status.
- Play weeks used and where an actual session limit would interrupt the arc; model access separately from the pure engine.

Reconcile modeled cash changes with the actual tick order. The current engine bills revenue against customers held at the start of the week; newly acquired customers must not be promised immediate revenue if it arrives on a later tick.

Run the recommended opening, a cautious player, an over-hiring player, an idle player, and an experienced optimizer across all four starting focuses and a fixed seed matrix. Start with 100 seeds per guided policy/focus combination; keep focused unit tests smaller and deterministic.

Initial targets to validate:

- A following-the-guide run sees product progress in its first resolved week and customers around weeks 2–3.
- At least 95% of guided simulated runs finish the opening objective by week 10 without bankruptcy or purchases; inspect every failure for an unfair dependency rather than merely increasing starting cash.
- Poor decisions produce understandable pressure and a reachable recovery choice; they do not need to achieve the guided success target.
- By the end of the opening, the player has made at least two meaningful trade-offs.
- Week-10 handoff and skip guidance both expose all ordinarily available controls without resetting company state or changing economic outcomes.
- There is no reward duplication through reload, repeated goal evaluation, replaying the introduction, or starting a new company.

Validate the opening against current economy rules. Tune objective thresholds, recommended decisions, and reveal timing first. Do not add scenario-specific starting conditions, event odds, exit rules, or extra play allowance. If the current economy cannot support a satisfying ten-week opening, report the evidence and propose a separate balance decision rather than silently expanding scope.

## 9. Office progression scope

For this release, office progression belongs to the current company. Start with an empty scene; show reserved desks, committed hires, product progress, and a modest cosmetic transformation when a real milestone is earned.

Cosmetics have no cash cost, stat benefit, exchange value, or effect on purchase products. They communicate accomplishments. Persist earned cosmetic milestone IDs with the run and derive employee presence from actual headcount, so layoffs and cancelled hires remain truthful.

Keep employee rendering bounded for mature sandbox saves. Guidance ends, but the office should continue reflecting team size and business state. No free-form decoration editor or new room-purchasing mechanic is required.

Campaign chapters, career ledgers, cross-run wealth, reputation systems, houses, cars, investments, prestige resets, and permanent economic boosts are deferred ideas, not later steps automatically authorized by this plan.

## 10. Monetization is a fixed constraint

Preserve all existing access and product behavior:

- Ten initial free weeks, free-bank cap of ten, and one regenerated week every 36 minutes.
- Existing spending order and separation of free and purchased weeks.
- Existing week packs, prices/product IDs, revive products and effects, restore, and entitlement reconciliation.
- Existing purchase triggers and waiting rules; no new offer-timing experiment.
- No bonus tutorial weeks, cash rewards, rewarded ads, chapter gates, or new premium currency.

The opening must demonstrate visible progress within this allowance. If a milestone and the existing allowance panel coincide, sequence the feedback cleanly without changing purchase eligibility or consuming an additional week. At the wall, show what has been achieved and the actual refill countdown.

Purchase and return metrics are regression guardrails for this release, not authorization to optimize products or change monetization.

The broader-audience hypothesis does not require age collection in the game. Begin comprehension testing with adult non-tech participants; a deliberate expansion into a teenage market remains a separate audience and distribution decision.

## 11. Technical design and boundaries

### Preserve existing architecture

- `src/game/` remains pure TypeScript: no React, storage, analytics, purchases, wall-clock time, or UI animation dependencies.
- Game mechanics and progression predicates must be deterministic for a given state/action sequence.
- The state layer owns persistence, guidance preferences, analytics, and play allowances.
- Screens and components render decisions from shared selectors; they do not independently invent unlock rules.
- Match the existing `describe`/`it`/`expect` Vitest patterns in `src/game/__tests__/engine.test.ts` and storage mocking in `src/state/__tests__/game-store.test.ts`.
- Use existing theme, `ThemedText`, shared buttons, and sheet conventions. Do not introduce a second design system.

### Proposed modules

Names are proposed new files, not claims about current code.

| Module | Responsibility |
|---|---|
| `src/game/progression.ts` | Pure objective evaluation and milestone detection, without modifying simulation outcomes. |
| `src/game/__tests__/progression.test.ts` | Early/out-of-order success, deterministic evaluation, and milestone identity. |
| `src/state/guidance.ts` | Pure reveal, skip, recovery-access, handoff, and primary-action rules. |
| `src/state/__tests__/guidance.test.ts` | Skip at every stage, early recovery access, and week-10 handoff even with unfinished lessons. |
| `src/lib/office-scene.ts` | Pure projection from game state to a bounded visual scene. |
| `src/components/game/mission-card.tsx` | One actionable goal and its progress. |
| `src/components/game/office-scene.tsx` | Office presentation using the scene projection. |
| `src/state/game-feedback.ts` | Pure feedback priority/deduplication rules, integrated with existing chrome. |
| `scripts/sim-progression.ts` | Reproducible opening report against the existing engine and focus profiles. |

Persist run-scoped guidance schema/config version, status (`active`, `skipped`, or `finished`), and earned milestone IDs. Derive objective progress from authoritative state rather than storing conflicting totals. Guidance status is a UI/teaching choice, not a separate game mode or score class.

Persist guidance and earned cosmetic IDs with the saved run so reloads cannot re-hide acknowledged controls or replay every celebration. The engine must ignore these fields when calculating money, customers, events, scores, and eligibility. Extend save normalization with tested legacy defaults.

Progressive disclosure is a presentation rule, not a new mechanical permission system. Direct navigation to an advanced tool should offer immediate access/skip rather than trap the player. Event-related and survival-related controls reveal early. Preserve the existing engine guards for actual gameplay eligibility.

### Existing files expected to change during implementation

- `src/game/types.ts` and save normalization in `engine.ts` only as needed for persisted guidance/milestones. Balance, score formulas, and event behavior remain unchanged.
- `src/state/game-store.tsx` and corresponding tests; `day-close.ts` only if needed to make the opening summary consistent with existing wall timing.
- `src/app/onboarding.tsx`, HQ, and narrowly scoped disclosure/navigation changes in the other three game tabs and tab layout. Game-over work is regression verification, not a redesign.
- `src/components/game/game-chrome.tsx`, `hud.tsx`, `week-in-review-sheet.tsx`, `day-complete-sheet.tsx`, and teaching components.
- `src/analytics/events.ts`, plain-language explanation helpers, and relevant theme tokens.

### Migration and rollback

- Existing live saves receive guidance-off defaults; do not hide existing controls or reset progress. Their new office renders from actual state without retroactive celebration spam.
- New runs persist a guidance version and status. Returning players can skip immediately. Configuration changes must not rewrite an active objective halfway through a session.
- Extend `normalizeSave` with tested defaults. Preserve all purchase pools and transaction IDs.
- Use a new-run rollout switch with a safe offline default. Disabling new enrollment must not corrupt guidance already in progress.
- Rollback disables new enrollment and falls back to full control visibility. Persistence must retain compatible unknown fields and real company state.
- Since this release does not change economic rules or grant gameplay advantages, preserve existing score formulas and leaderboard contracts. If a future design introduces boosts or separate scenarios, ranking comparability requires a separate decision.
- The adjacent website, entitlement server, and leaderboard backend are out of scope.

## 12. Ordered implementation backlog

Effort ranges assume one experienced developer with product/design input. They are planning estimates, exclude external review queues, and should be revised after the prototype. Keep all work TODO until actually completed.

| ID | Work package | Dependency | Estimated effort | Risk | Status |
|---|---|---|---|---|---|
| A | Establish baseline and finalize the first-company brief | None | 1–2 days | Low | TODO |
| B | Prototype the ten-week journey and screen hierarchy | A | 2–3 days | Low | TODO |
| C | Implement objective state, reveal/skip rules, and migration | B | 2–4 days | Medium | TODO |
| D | Implement guided onboarding and contextual actions | C | 3–5 days | Medium | TODO |
| E | Build the office feedback and compact result flow | D | 3–5 days | Medium | TODO |
| F | Tune guidance against the economy and validate sandbox handoff | C–E | 2–4 days | Medium | TODO |

Total implementation planning range: **13–23 working days** for A–F, excluding participant recruitment and release review. Re-estimate after B; no campaign, career, or monetization work is included.

### A. Baseline and design brief

- [ ] Walk a fresh install and an existing save; record where the next action becomes unclear.
- [ ] Establish current first-action, week-3/week-10 progression, return, and purchase baselines by app version and cohort.
- [ ] Decide the first product/customer milestone predicates using the real engine formulas.
- [ ] Write the story beats and two meaningful trade-offs in this plan or a dated companion document.
- [ ] Record test/typecheck/lint results before changing code; do not assume historical clean results still apply.

**Acceptance:** A readable first-company brief, defined baseline denominators, and a list of any pre-existing check failures. Historical analytics are labeled by date.

### B. Prototype before full implementation

- [ ] Produce a tappable sequence for week 0, first hire, first customer, a problem, week-10 completion, and return after the allowance limit.
- [ ] Include default, small-screen, and large-text layouts.
- [ ] Test with five people unfamiliar with the app, including non-tech participants.
- [ ] Ask them to play and narrate; avoid explaining the intended action first.

**Acceptance:** At least four of five identify the next action and explain one action/result relationship without moderator help. Treat this as a usability gate, not statistical proof of retention. Revise the prototype if it fails.

### C. Build the progression foundation

- [ ] Add the proposed opening objectives and pure evaluators.
- [ ] Add guidance status/version, milestone persistence, and legacy guidance-off defaults.
- [ ] Implement progressive reveals, immediate skip, and early recovery access without adding engine restrictions.
- [ ] Integrate explanations with existing events without altering their eligibility, cadence, or RNG draws.
- [ ] Add the progression simulation harness and tests before changing presentation.

**Verification:** `npx vitest run src/game src/state` passes, including new migration, objective, reveal, and skip tests. Seeded replay produces identical results. A legacy-save fixture retains its controls and balances.

### D. Connect objectives to playable UI

- [ ] Replace the first-run Next Week spotlight with a first meaningful action.
- [ ] Add the mission card and shared primary action resolver to HQ/chrome.
- [ ] Reveal systems progressively across Team, Money, and Market.
- [ ] Replace jargon in visible copy; retain detailed definitions on demand.
- [ ] Emit progression events from confirmed state transitions and exposures.

**Verification:** Targeted progression tests and typecheck pass relative to the recorded baseline. Manually complete the opening route and an out-of-order route; neither has contradictory CTAs or inaccessible recovery actions.

### E. Make outcomes visible

- [ ] Build a bounded office scene projection and rendering.
- [ ] Distinguish pending hires from committed employees.
- [ ] Add persistent milestone transformations and compact transient feedback.
- [ ] Integrate mission/unlock feedback into existing recap priority.
- [ ] Verify reduced motion, background/resume, and no stacked modal sequence.

**Verification:** Scene-projection and feedback-priority tests pass. Manually demonstrate first hire, first customers, funding, support pressure, and a milestone with correct state and readable feedback.

### F. Validate the opening and sandbox handoff

- [ ] Run the guided policy/focus/seed matrix and inspect failure traces.
- [ ] Run existing simulation bots to detect unintended sandbox changes.
- [ ] Test the first allowance interruption and return with free and purchased weeks; confirm all budget constants, spending rules, and purchase effects remain unchanged.
- [ ] Test week-10 handoff with finished and unfinished goals, skip at every earlier stage, and continued sandbox play beyond week 10.
- [ ] Run another five-person fresh-user playtest on the implemented slice.
- [ ] Review telemetry ordering and deduplication before rollout.

**Acceptance:** The simulation targets in section 8 pass; at least four of five players can act and explain consequences without help; existing entitlements and legacy saves pass regression checks. All controls are available after handoff or skip, without a company reset or extra grant. Otherwise iterate within this slice.

### Completion of this plan

After A–F pass, record the measured results and remaining usability issues. Further work should address evidence from this release. Campaigns, career systems, or monetization changes require a new product decision and are not automatic follow-on tasks.

## 13. Measurement and rollout

### Instrumentation

Reuse `game_started`, `week_advanced`, `hires_changed`, `funding_round_raised`, `game_over`, `week_advance_blocked`, `returned_after_wall`, and the existing purchase events. `hires_changed` represents planning changes, so it is not sufficient evidence that employees started work.

Add a small progression vocabulary:

| Event | Trigger |
|---|---|
| `mission_presented` | A mission becomes visible for the first time in that run/version. |
| `mission_action_tapped` | Player uses the mission CTA. |
| `mission_completed` | Authoritative state first satisfies the goal. |
| `control_revealed` | Guidance reveals an existing control. Include reason: scheduled, progress, recovery, event, skip, or handoff. |
| `opening_arc_completed` | The opening's defined outcomes are achieved. |
| `guidance_skipped` | The player explicitly chooses full control access. |
| `guidance_finished` | Week-10 handoff ends automatic teaching, whether or not all objectives were achieved. |

Common properties: run ID, mission ID where applicable, guidance version/status, week, first/returning player, acquisition cohort, and application/update version. Emit from confirmed changes; use stable deduplication identities. Do not add personal names or free-text story input to analytics.

### Decision metrics

| Question | Metric / denominator |
|---|---|
| Can people start? | New guided runs with a committed first hire and first tick / eligible new guided runs. |
| Does the action feel productive? | Runs with first customers and first mission completion / eligible new guided runs; also time to these outcomes. |
| Is the opening coherent? | Opening completions / guided runs with enough observation time; report blocked and abandoned paths separately. |
| Is the access limit interrupting too early? | Runs hitting the limit before a meaningful milestone / guided runs hitting the limit. |
| Do people return? | D1 and D7 active return among cohorts old enough to qualify; define exact day windows before analysis. |
| Does the opening lead to sandbox play? | Players advancing beyond week 10 / players reaching the handoff with sufficient follow-up time; segment allowance exhaustion. |
| Does guidance respect freedom? | Skip rate and subsequent play; distinguish deliberate skipping from failure to complete objectives. |
| Did the redesign regress purchases? | Existing purchase completion per exposed player, payer return, and error/refund indicators where available. Products and offer rules stay fixed. |

Use the latest comparable production cohort as the baseline. With low traffic, begin with usability and staged cohorts; do not launch several underpowered A/B tests or declare victory from a small percentage swing. Predefine an observation window and minimum cohort size appropriate to actual traffic before rollout.

### Release stages

1. Developer testing on seeded runs and legacy fixtures.
2. Small external playtest, with no new monetization changes.
3. Limited guidance enrollment for new runs, while existing saves keep full control access.
4. Broader rollout after comprehension, migration, purchase, and stability checks pass.
5. Observe the handoff into sandbox play and refine the opening based on the evidence.

Disable new enrollment if there is a progression dead end, duplicated reward, save migration failure, or purchased-balance regression. Keep a compatible path for already-enrolled runs.

## 14. Verification commands and test coverage

Commands below are derived from the checked-in scripts/configuration. **They were not executed for this planning-only task.** Implementation begins by recording their actual baseline.

| Purpose | Command | Expected result |
|---|---|---|
| Inspect drift | `git diff --stat ed6e11a..HEAD -- src scripts package.json vitest.config.ts` and `git status --short` | Identify changed assumptions before execution; preserve unrelated work. |
| Full tests | `npm test` | All existing and new tests pass. |
| Game/state checks | `npx vitest run src/game src/state` | All selected pure tests pass. |
| Purchase regression | `npx vitest run src/purchases src/state/__tests__/week-budget.test.ts src/state/__tests__/revive.test.ts` | Existing grants, spending, restore, and revive tests pass. |
| Typecheck | `npx tsc --noEmit` | Exit 0, or a documented pre-existing failure baseline with no newly introduced errors. |
| Lint | `npm run lint` | No new lint errors. |
| Existing sim | `npm run sim -- balanced 12345` and `npm run sim -- grower 100` | Deterministic reports; compare baseline outcomes rather than assume both must win. |
| New progression sim, after C adds it | `npx tsx scripts/sim-progression.ts` | Exits nonzero on an acceptance failure; prints policy/focus/seed outcomes and failure traces. |

Do not use a simulation success exit code alone as proof of balance; inspect the reported outcomes and compare against explicit assertions.

Required new regression coverage:

- Goal completion before its scheduled week, delayed completion, and multiple goals completing together.
- Pending versus committed hires, including cancellations and layoffs.
- Hidden control reached through direct navigation, skip, recovery, or week-10 handoff; verify the original engine eligibility rules remain authoritative.
- Early need for support/funding, and existing events that require a control not yet introduced.
- Replay determinism and no accidental extra RNG draws from rendering or previews.
- Legacy saves, mid-mission relaunch, missing optional fields, and unknown future versions.
- Guidance/milestone persistence interrupted during a write, relaunch without duplicate celebration, and skip state retained.
- Guidance ending with unfinished objectives; continuing after bankruptcy revive without restarting completed lessons or changing benefits.
- Budget depletion, regeneration, purchased-pool fallback, and restart without re-grants.
- Feedback ordering when a decision, milestone, unlock, recap, and allowance exhaustion coincide.

Manual acceptance includes supported small phones, large text, screen reader labels/focus, reduced motion, background/resume, and a mature large-team save. The current test setup is a Node environment with React Native stubs; passing Vitest does not validate real layout or native modal behavior.

## 15. Scope, stop conditions, and maintenance

For this planning task, only this plan and the existing advisor-plan index change. Implementation is future work.

During implementation, keep account authentication, entitlement server behavior, product IDs, native build configuration, and the neighboring website out of scope unless a concrete dependency requires a separate plan. If creating an implementation branch, use the repository's `codex/` prefix.

Revisit the design before proceeding if:

- A guided goal cannot be reached under actual engine rules without misrepresenting outcomes.
- The opening appears to require changing economic rules, event odds, access allowances, waiting periods, or existing products.
- A control reveal rule leaves the player exposed to a problem they cannot address, or skip fails to give full normal access.
- A proposed reward would change scoring or require a new campaign/career/leaderboard system.
- A requested implementation requires changing native dependencies or build artifacts beyond the planned scope.

Read the exact [Expo v57 documentation](https://docs.expo.dev/versions/v57.0.0/) before writing implementation code, as required by `AGENTS.md`. Native builds, EAS submissions, and OTA publication require explicit user confirmation. Local planning and pure tests do not authorize publishing.

Future balance changes must update the progression seed matrix; future story content must declare prerequisites and failure recovery; cosmetic milestones must use stable IDs and idempotent completion records. Keep user-facing resource terminology consistent across the app, widget, notifications, and share cards.

## 16. Focused learning alongside implementation

Keep learning attached to decisions:

- Read Hunicke, LeBlanc, and Zubek's [MDA paper](https://users.cs.northwestern.edu/~hunicke/MDA.pdf), which connects mechanics, resulting play dynamics, and player experience. Then write the intended player feeling for each opening beat and identify which actual mechanic produces it.
- Draw the company's resource flow using existing formulas: where cash comes from, where it goes, and how quality/sales/support affect the loop. Turn that diagram into the simulation worksheet in section 8.
- Play through the first sessions of two relevant management games and record, firsthand, when each new system appears, how success is shown, and where the player first chooses a trade-off. Treat observations as hypotheses for this game, not rules to copy.
- Revisit recordings from this game's playtests after every slice. Player comprehension and desire to continue decide which ideas survive.

## 17. First release checklist

- [ ] A new player always has one clear, actionable objective.
- [ ] The first meaningful action changes a visible company state.
- [ ] The opening teaches product, customers, costs, and at least two trade-offs through play.
- [ ] The recommended route reaches an opening milestone within the initial ten-week allowance.
- [ ] Guidance, passive data, and urgent problems look and read differently.
- [ ] Main actions fit the standard viewport; details and large-text layouts remain accessible.
- [ ] Unlocks cannot create dead ends or remove necessary recovery tools.
- [ ] The office and feedback reflect actual state; no false sales or hire celebrations.
- [ ] Legacy saves, purchase balances, and restore behavior survive.
- [ ] Analytics distinguish the redesigned experience from historical cohorts.
- [ ] Skip is always reachable and grants full normal control access without changing the company.
- [ ] Week 10 ends automatic guidance even when optional lessons remain unfinished.
- [ ] All allowances, waiting periods, products, and purchase rules remain unchanged.
- [ ] Simulation and usability gates pass before rollout.

**Recommended starting point:** complete A and B, then build C–F as one coherent ten-week experience. Finish with a verified handoff into the existing sandbox. Campaign, career, and monetization changes are outside this plan.

**Not audited:** live production telemetry, native runtime screenshots, security, server architecture, purchase-store configuration, or actual demographic composition. UI findings are grounded in source structure and the supplied feedback; device verification remains part of execution.
