# Quick wins from the weekly PostHog review

Created: September 8, 2026. Status: tasks 1–3 implemented in the workspace; the PostHog experiment is running. The app release has not been published.

Implemented PostHog resources:

- [Initial free weeks: 5 vs 10 experiment](https://us.posthog.com/project/505800/experiments/461830) — running; flag `initial-free-weeks-v1` / ID `871092`; 50% control and 50% test at 100% eligible rollout.
- [Commerce measurement QA dashboard](https://us.posthog.com/project/505800/dashboard/2074757) — current outcome trends plus an event table that automatically picks up new `paywall_*` and `purchase_*` events.
- [Commerce outcomes by surface](https://us.posthog.com/project/505800/insights/Db0FoBBL) and [commerce event QA table](https://us.posthog.com/project/505800/insights/cRFcYsPh).

Implementation validation:

- `npm test`: 34 files and 524 tests passed.
- Product-app TypeScript check: passed using the root config with the unrelated `app-store-screenshots/` and `video/` workspaces excluded.
- Focused ESLint passed for every changed file except `buy-weeks-sheet.tsx`, which retains its pre-existing `set-state-in-effect` error on unchanged state-reset lines. The repository-wide lint command also reports pre-existing React hook errors in `animated-number.tsx`, `notification-manager.tsx`, and `use-color-scheme.web.ts`.
- PostHog's experiment-results query completed without configuration warnings. It correctly reports zero control and zero test exposures before the app release.
- No EAS build, submission, or OTA update was run. The active PostHog flag is harmless to existing releases; experiment exposures begin only after this code ships.

## Evidence and priorities

Source: the PostHog queries run in this task for **August 31–September 6, 2026**, compared with August 24–30. Project: [Startup Company Tycoon, 505800](https://us.posthog.com/project/505800). Dates use UTC; configured test accounts were excluded. This plan keeps that reporting window rather than silently refreshing the numbers.

| Observed signal | Implication to investigate |
| --- | --- |
| App openers: 121 → 46; people with install events: 90 → 32 | Recover acquisition alongside product improvements. |
| 26 people triggered 78 blocked advances; 20 people generated 56 blocks at game week five | Players want to continue beyond the initial allowance. |
| Only 1 of 26 blocked players recorded a purchase within 24 hours | The limit is not converting many blocked players into buyers in this sample. |
| 33 of 41 progressing players played on only one day that week | Investigate repeat play; this is not a cohort retention rate. |
| Onboarding completion: 92.9% → 85.7%; median duration: 21 → 53 seconds | Find where onboarding became slower before cutting steps. |
| Full onboarding-to-first-week conversion: 78.8% → 83.3% | Do not assume the longer onboarding is worse overall. |
| Three purchased outcomes from two people, one restored outcome from another; zero purchase starts | Repair purchase measurement before interpreting monetization. |

Effort estimates below are rough engineering time, excluding release review and experiment observation.

| Order | Quick win | Effort | Deliverable |
| --- | --- | --- | --- |
| 1 | Make purchase and paywall metrics trustworthy | 0.5–1 day | Consistent event meanings and corrected funnel |
| 2 | Clarify the exhausted-budget screen | 0.5 day | Accurate refill message and clearly labeled actions |
| 3 | A/B test 5 versus 10 initial free weeks | 1–2 days setup | One controlled retention experiment |
| 4 | Investigate the Spain/Israel acquisition drop | 1–2 hours initial review | Source-level explanation and one recovery action |
| 5 | Audit the existing return reminder | 0.5 day | Verified scheduling/open flow and measured return funnel |
| 6 | Identify the slow onboarding step | 1–2 hours analysis | One targeted follow-up change, if supported |

## 1. Fix purchase measurement first

- [x] Normalize `outcome` and `surface` across the RevenueCat paywall, fallback purchase sheet, revive purchase flow, and restore controls. Count a new purchase only when `outcome = purchased`; report restores separately.
- [x] Separate paywall presentation attempts from confirmed presentation and dismissal. RevenueCat now confirms presentation immediately before calling its hosted-paywall UI rather than after that UI closes.
- [x] Check the installed RevenueCat SDK's supported callbacks before adding `purchase_started`. The native hosted paywall does not expose an actual purchase-start callback, so that surface uses presentation → purchased outcome; the in-app sheet and revive purchase emit starts from their explicit purchase buttons.
- [x] Build a PostHog readout by surface for commerce events, confirmed shows, purchased users, restores, failures, and granted weeks. Its event-prefix table automatically includes presentation attempts, dismissals, and cancellations after release. It never uses the game's simulated `revenue` property; real-currency reconciliation remains a RevenueCat/store operational check because no transaction-value feed is connected to PostHog.

**Acceptance:** a successful purchase, cancellation, restore, and failure each produce the intended events without double counting. Historical data remains explicitly labeled with its older semantics.

**Code locations:** `src/state/buy-weeks-flow.ts`, `src/components/game/buy-weeks-sheet.tsx`, `src/app/game-over.tsx`, `src/analytics/events.ts`, and the paywall wrapper under `src/purchases`.

## 2. Make the daily limit understandable

The exhausted primary button currently says “That’s the week — see you tomorrow” but opens a purchase flow on supported devices. The screen also repeats the return message in several places.

- [x] Show one clear allowance message: “5 free weeks refill at local midnight,” using the actual local refill policy.
- [x] Label the purchase action “Get more weeks.” Keep “See you tomorrow” as a separate choice in the day-complete panel.
- [x] Reuse the existing day-complete panel and its next-session agenda without adding another modal or permission prompt.
- [x] Include remaining free/purchased weeks, the exact next-refill timestamp, daily allowance, and local date in blocked-advance events.

**Acceptance:** labels match actions; midnight and timezone behavior match the budget; unsupported purchase surfaces still explain when play resumes. Compare repeated blocked attempts per affected player descriptively, without claiming a causal before/after effect.

**Code locations:** `src/components/game/game-chrome.tsx`, `src/components/game/day-complete-sheet.tsx`, `src/state/week-budget.ts`.

Ship this consistently to both groups before enrolling the allowance experiment.

## 3. A/B test: 5 versus 10 initial free weeks

**Hypothesis:** a longer first visit lets players experience enough progress to return, instead of meeting the daily limit before they are invested.

Test the **initial grant first**. Keep subsequent refills at five weeks/day and the free bank cap at ten in both groups. This isolates the first-visit experience and keeps the change small. A daily-refill experiment can follow if the initial-grant result supports it.

| Setting | Proposal |
| --- | --- |
| Proposed PostHog flag | `initial-free-weeks-v1` |
| Control, 50% | 5 initial free weeks |
| Treatment, 50% | 10 initial free weeks |
| Eligibility | New installs on an experiment-capable release, before their first budget is granted; exclude configured test accounts |
| Assignment | Once per eligible install; persist the applied variant and grant state |
| Primary outcome | Percentage of exposed installs that record next-local-day gameplay within 48 hours (`daily_streak_credited`, `streak_days >= 2`) |
| Secondary outcomes | Return gameplay 168–192 hours after exposure; first-visit progression; time to first limit; first-seven-day purchased users |
| Guardrails | First gameplay activation, purchase/grant failures, and first-seven-day net revenue per exposed install when transaction data is available |

### Implementation checklist

- [x] Persist one enrollment record containing experiment key, variant, assignment time, applied initial allowance, and grant-applied status. Persist the assignment and first budget before emitting PostHog's canonical exposure event.
- [x] Resolve the flag during normal startup with a 2.5-second cap. If assignment is unavailable, grant the ordinary five weeks without enrollment or exposure.
- [x] Keep assignment stable across app restarts, new companies, and account changes. Retain the enrollment marker across `resetAll` so the same install cannot enroll or receive the treatment grant again. Uninstall/reinstall deduplication remains a limitation of install-based enrollment.
- [x] Separate the initial allowance from `WEEKS_PER_DAY`; daily refills stay at five, the bank cap stays at ten, and paid-week behavior is unchanged.
- [x] Record canonical exposure only after the grant is durable, capture an allowance-applied QA event, and register the applied variant as a persistent analytics property.
- [x] Verify treatment/control mapping, malformed and missing enrollment records, existing-install fallback, offline flag failure, persistence order, day rollover, cap behavior, and free-first spending in the automated suite. The widget continues to consume the same persisted budget shape.

**Code locations:** `src/state/week-budget.ts`, `src/state/game-store.tsx`, `src/analytics/posthog.ts`, `src/analytics/events.ts`, `src/widgets/snapshot.ts`, and the existing budget/widget tests. No feature-flag consumption was found in the current app source, so this requires assignment plumbing, not just changing a number.

### Readout and decision

- Analyze **all exposed eligible installs by their assigned variant**, including people who never reach the wall. Comparing only wall-hitters would select different populations after treatment.
- Include only fully observed windows: at least 48 hours for the primary outcome and 192 hours for the day-seven return outcome. Use those elapsed windows consistently; they are not calendar-day retention.
- Establish the primary-outcome baseline and choose a minimum worthwhile effect before launch. Size the experiment from those inputs; the historical 8/41 multi-day figure is not the required baseline.
- At roughly 32 installs/week, four weeks yields at most about **64 installs per arm**, before exclusions. Use 28 days as an operational review checkpoint, not an automatic winner deadline. Report counts and uncertainty; extend or mark inconclusive if the result is too imprecise.
- Check assignment/exposure balance and technical failures early. Do not repeatedly choose a winner from fluctuating daily retention percentages. Two purchasing people are insufficient to establish monetization safety.
- Stop new treatment enrollment for duplicate grants or other functional failures; preserve weeks already granted. Roll out only after the retention result and monetization tradeoff are sufficiently clear for a product decision.

## 4. Find the acquisition source that disappeared

Spain's app openers fell **39 → 7**, Israel's **21 → 1**, and the US **17 → 14**. Geography is a clue, not attribution; a person can also appear in multiple country buckets.

- [ ] Compare daily first installs by country, platform, and release. Verify available attribution properties before using them.
- [ ] Check App Store Connect campaign/referrer data and the dates of any known promotions or announcements. Separate lower store traffic from lower listing conversion.
- [ ] If an identifiable promotion ended, prepare one repeatable acquisition action and a tagged link to measure it. If attribution is missing, add campaign tagging for the next promotion.

**Acceptance:** a supported explanation or an explicit attribution gap, plus one concrete recovery action. Posting, contacting others, or buying traffic is a separate execution decision.

## 5. Verify the return reminder already in the app

The app already has a day-complete panel, a permission flow, and a scheduled local reminder. The weekly findings do not establish that any of these are broken.

- [ ] Query the existing wall → permission → schedule → notification-open events and subsequent gameplay, checking each event's properties first.
- [ ] Verify delivery and open handling on a device, including cold launch. A scheduled event does not prove delivery, and an open proves engagement only for that notification.
- [ ] If a functional defect is found, fix it before experiment enrollment. Otherwise hold reminder timing and copy constant during the allowance test.

**Acceptance:** documented delivery/open behavior and return counts with complete observation windows. Do not claim notification lift by comparing users who granted permission with users who declined; those groups self-select.

**Code locations:** `src/components/game/notification-manager.tsx`, `src/state/notification-schedule.ts`, `src/state/notification-permission.ts`, `src/state/notification-content.ts`. Check the already-executed `advisor-plans/2026-07-25-arm-reengagement-at-the-wall.md` for context; do not recreate that feature.

## 6. Find one onboarding improvement, then queue it

- [ ] Break down `onboarding_step_viewed` by step, first-time versus replay/returning flow, and release. Compute ordered drop-off and time between steps.
- [ ] Inspect the step with the largest new delay or loss. Shorten one redundant explanation or interaction if the data supports it; retain steps that help players reach their first game week.
- [ ] Measure onboarding → first week advanced, not just faster completion. The full activation funnel improved in the reviewed week.

**Acceptance:** one evidenced change with a defined activation outcome. Queue behavioral changes until after the free-week experiment to keep the low-traffic readout interpretable.

**Code location:** `src/app/onboarding.tsx` (current sequence: hook, name, founder, reflect, goal, launch).

## Execution order and references

Purchase measurement, wall copy, and experiment setup are now implemented together. Keep reminder timing and copy unchanged while the allowance test runs; its audit can proceed as read-only work. Investigate acquisition and analyze onboarding while the experiment collects data. Record acquisition changes and release dates, keep both variants concurrent, and run one product experiment at a time at this traffic level.

Before implementation, read the repository-required [Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/). Run checks appropriate to the changed code and validate both assignments on device. Native builds, submission, and OTA publication require confirmation under `AGENTS.md`.

PostHog setup references checked for this plan:

- [React Native experiments](https://posthog.com/docs/experiments/installation/react-native)
- [Experiment exposure and outcome ordering](https://posthog.com/docs/experiments/exposures)
- [React Native feature flags](https://posthog.com/docs/libraries/react-native#feature-flags)
