# PostHog review and improvement plan

Created: September 29, 2026. Source: PostHog project [startup-company-tycoon, 505800](https://us.posthog.com/project/505800), covering **August 30 to September 29, 2026** (30 days, UTC). None of the users counted below are in the test-account cohort (404415). This follows up [the September 8 quick wins](2026-09-08-posthog-quick-wins.md).

Status: **Items 0, 2, 3 and 4, plus item 1 steps 3 to 5, are implemented in the workspace** (committed in `c4ee569` and published as OTA 1.0.4-20 on Sep 29, update group `d044a891-2680-48f1-9505-71b6dfc1344f`). Still open: item 0's PostHog steps, item 1 steps 1 and 2, and item 5 (see each item).

## Headline

Players get into the game fine, but they don't come back.

| Step (installs in the last 30 days) | Users | Share of installs |
| --- | --- | --- |
| `Application Installed` | 143 | 100% |
| `onboarding_completed` | 128 | 90% |
| First `week_advanced` | 121 | 85% |
| Hit the daily wall (`week_advance_blocked`) | 75 | 52% |
| Played a week on a **later calendar day** | 13 | 9% |
| Played on 3 or more days | 2 | 1% |
| Opened a re-engagement notification | 0 | 0% |

- Onboarding is healthy: 159 → 146 users across the six steps (92%). The slowest step is naming, with a median of about 14 s. **No action.**
- The first session is very short. Median time from the first week advanced to hitting the wall is **119 s** (quartiles 71 s to 212 s).
- Returning is the whole problem. Every item below is ranked by how directly it affects returning.

## 0. Ship the initial-weeks experiment: 10 weeks (implemented)
Status: blocked
Blocker: code is done. You approved ending the experiment on Sep 29, but the PostHog MCP connection lacks `experiment:write` / `feature_flag:write`, so the experiment couldn't be ended from here. Reconnect with those scopes, or end it in the PostHog UI (ship `test`). The OTA (1.0.4-20) was published on Sep 29.

Readout for [experiment 461830](https://us.posthog.com/project/505800/experiments/461830), flag `initial-free-weeks-v1`, Sep 8 to 29:

| Metric | Control (5) | Test (10) |
| --- | --- | --- |
| Exposed installs | 49 | 47 |
| Next-day return within 48 h (primary) | 3 (6.1%) | 3 (6.4%) |
| Advanced at least one week on day 1 | 41 | 41 |
| Mean weeks advanced in the first 7 days | 4.0 | 7.2 |
| Returned on day 7 | 0 | 0 |
| Purchased within 7 days | 0 | 0 |
| Hit the wall at least once | 27 | 23 |

What the data does and doesn't say:
- **Retention:** flat and badly underpowered. PostHog flags "not enough exposures". About 33 installs a week will never power a test at this effect size.
- **Weeks advanced:** the +80% is mostly mechanical, because test players were simply allowed to play more. It still means a first session about twice as long, which is what the hypothesis wanted.
- **Monetization:** there were zero purchases in either arm, so the effect on revenue is **unknown**, not "no harm".
- **Decision:** ship 10 as a product call. No harm was detected, the first session doubles, and when 90% of installs never return, a 2-minute first session is the worse default.

Changes in the workspace:
- **Removed:**
  - `src/state/initial-weeks-experiment.ts` and its test
  - the flag fetch with its 2.5 s timeout
  - enrollment persistence
  - the `initial_week_allowance_applied` event
- **Added `INITIAL_FREE_WEEKS = 10`** in `src/state/week-budget.ts`. `loadWeekBudget(isNewInstall)` grants it only when there's no save *and* no budget.
  - An existing save with no budget still gets 5.
  - `resetAll` still resets to 5 in memory, so resetting can't be used to farm the 10-week grant. Daily refill (5) and bank cap (10) are unchanged.
- **Cleanup on every launch (idempotent):** removes the old enrollment storage key and calls `posthog.unregister` on `initial_weeks_experiment`, `initial_weeks_variant` and `initial_weeks`. Without this, enrolled installs would keep tagging every event.
- **Checks:** `vitest` passed (521 tests). `tsc` shows no errors in `src/` (the 121 existing errors are all in other workspaces).

**PostHog sequencing (needs your go-ahead, not done):**
1. End the experiment now and **ship variant `test` at 100%**. Installs on the current release (1.0.4-19) then get 10 weeks right away, before any OTA. If the flag were deleted instead, they would silently fall back to 5.
2. Publish the OTA with this code.
3. Delete flag `initial-free-weeks-v1` (ID 871092) once almost no active users are on a pre-OTA update.

**Constraint for later:** 10 equals `WEEKS_BANK_CAP`, and `initialWeekBudget` clamps to it. A more generous first day would need the first-day grant to bypass the cap.

## 1. Build a reason to come back tomorrow (highest impact)

Evidence:
- Only 9% of installs play on a second calendar day.
- 99 users were asked for notification permission and only **30 granted** (30%).
- `reengagement_notification_scheduled` fires for 135 users, but that includes the 69 who denied permission, so it tells us nothing about delivery.
- `notification_opened`: 14 opens from 4 users in 30 days, and **none from anyone who installed in that window**.

What already exists: `DayCompleteSheet` shows a "Tomorrow" line from `tomorrowAgendaFor`. The system permission prompt fires with no pre-prompt at the wall (`NotificationPermissionAsk`, trigger `daily_wall`) or on the second launch. One notification is scheduled for 09:00 local on every backgrounding.

Why it isn't working:
- **The "Tomorrow" line isn't about tomorrow.** Of 120 players who saw the sheet, 79 saw `raise` ("You're clear to raise"), which they could do right now. 22 saw `event-soon`, 16 saw `runway`, 3 saw `steady`, and 0 saw `decision`.
- **The system dialog appears unannounced.** 12 of 51 players (24%) granted at the wall, against 18 of 46 (39%) on second launch, though that second group already chose to return.
- **The notification is mostly generic.** `notificationContentFor` has no `raise` or `event-soon` tier, so most players get "Week N — come back and check on the team."
- **There is only one notification.** It's rescheduled only when the app backgrounds, so a player who skips day 2 is never contacted again.

Status: blocked (steps 3, 4 and 5 and the measurement are done; steps 1 and 2 are open)
Blocker: step 1 needs a fresh install on a physical device. Step 2 is a TODO, below.

Steps, in order (about 3 days in total):
1. **Delivery audit (about 30 min).** On a fresh device install, grant permission and set the clock forward past 09:00. Confirm the notification arrives, then tap it from a cold launch and confirm `notification_opened` fires.
2. **A real cliffhanger (about 1 day).** When the day ends, pre-draw the next event card and pin it to land on tomorrow's first week. Tease it by name on the sheet ("A rival just poached your lead engineer. Tomorrow you decide how to respond."). Remove the `raise` tier from the "tomorrow" line and nudge the player to raise before closing the day instead. Code: `src/state/day-close.ts`, `src/game/engine` (draw order), `day-complete-sheet.tsx`.
   - **TODO (Sep 29, deferred as not easy):** the next card can't be previewed. The engine threads its RNG through the tick (trend, market and attrition rolls), so which card is drawn depends on what the player does before advancing. Pinning one needs (a) a new optional persisted field on `GameState` (for example `pinnedEventId`), (b) `drawEventIfDue` in `src/game/engine.ts` honoring it and forcing `weeksUntilNextEvent` to 1, which changes event cadence and needs balance tests, and (c) teaser copy for every card in `src/game/events/*`. Removing the `raise` tier from the "tomorrow" line belongs with this change, so it was left in place.
3. **Ask with a reason (about half a day).** Add a "Remind me at 9am" button on the day-complete sheet. Tapping it triggers the system dialog, and nothing fires without the tap. Keep the second-launch fallback. Code: `day-complete-sheet.tsx`, `game-chrome.tsx:215`, `notification-permission.ts`.
   Status: done. "Remind me at 9am" is the primary button on the day-complete sheet only while the install's permission ask is unspent. Tapping it closes the sheet, then asks (trigger `reminder_optin`, replacing `daily_wall`). "See you tomorrow" no longer asks. The second-launch fallback is unchanged. Not seen in the simulator: this install had already spent its ask and shown today's panel.
4. **Notification copy matches the teaser (about half a day).** The 09:00 notification names the same card ("Your lead engineer got poached — decide today"). Add the missing tiers so the two ladders agree. Code: `notification-content.ts`.
   Status: done for the ladder. `notificationContentFor` now climbs `tomorrowAgendaFor` itself, so it gains `raise` and `event-soon` and can't drift; a test checks both agree. Naming the specific card waits on step 2.
5. **A short reminder sequence (about half a day).** Schedule day 1 at 09:00, day 3 and day 7 (3 IDs), all cancelled and rescheduled on backgrounding. Day 3 and 7 use progress-based copy ("Your stake is $X — your company's still waiting"). Code: `notification-manager.tsx`, `notification-schedule.ts`.
   Status: done. `REMINDER_SEQUENCE` has 3 fixed IDs (day 1 keeps the old ID, so the pending single nudge is replaced) and `secondsUntilReminder` steps by calendar date. Day 3 and 7 use `progressReminderContentFor`. Notification data carries `reminder_day`, which `notification_opened` now reports.

Measurement: add `agenda_kind` and `teaser_card_id` to `day_complete_shown` and `reengagement_notification_scheduled`, add a `reminder_optin_tapped` event, and only log `scheduled` when permission is granted.
   Status: done, except `teaser_card_id` (waits on step 2). `day_complete_shown` already had `agenda_kind`, and `reengagement_notification_scheduled` now carries `agenda_kind` and `reminders`.

- [ ] **Success metric:** the share of installs with a `week_advanced` on a later local day, measured weekly with fully observed 48-hour windows. Baseline is 9% (13 of 133 installs old enough to measure).

## 2. Diagnose purchase failures (quick, protects revenue)

Evidence: `purchase_failed` fired 126 times, all from 2 users, all on the `revenuecat` / `out_of_weeks` surface with `error_code: "unknown"`:
- **Nigeria:** 105 failures over 34 minutes on Sep 23, with 109 paywall presentation attempts but only 2 shown.
- **Nepal:** 21 failures on Sep 15.
- **Not a territory problem:** I checked in RevenueCat and `weeks20` is available in both NG and NP, and available in new territories. So it isn't the Aug 29 territory issue. The real cause is invisible because the error code is lost.
- For scale: only 3 people bought anything in 30 days. One of them (US, Sep 29 01:48) may be your own device, since restore, settings and help events came from the same session.

- [x] Log RevenueCat's real error (`PURCHASES_ERROR_CODE`, `readableErrorCode`, `underlyingErrorMessage`) on `purchase_failed`, instead of mapping everything to `unknown`. Code: `src/purchases/revenuecat.ts`, `src/state/buy-weeks-flow.ts`.
- [x] Log why presentation fails: `paywall_presentation_attempted` without a matching `paywall_shown` (233 attempts vs 179 shows, mostly from the NG user).
- [x] After 2 consecutive failures, stop re-offering the purchase in a loop. Show "Purchases aren't available right now — your free weeks refill at midnight." A player tapping 100 times in 30 minutes is having a terrible experience.
- [x] Confirm whether the US Sep 29 purchase was you. If so, add that device to test cohort 404415.
  Answer (Sep 29): not you, so it's a real purchase. No cohort change.
- Done notes (Sep 29): `purchase_failed` now carries `error_stage`, `rc_error_code`, `rc_readable_error_code`, `rc_underlying_error_message` and `error_message` (`error_code` is unchanged). The hosted paywall splits the offerings load (`offerings`) from presentation (`present` / `paywall_result`). New events: `paywall_not_presented` with `reason`, and `purchase_retry_suppressed`. The gate in `src/state/purchase-failure-gate.ts` blocks for 5 minutes after 2 consecutive failures and shows an Alert. Any clean paywall close resets it. The Alert waits 350 ms so it can't present into a sheet that is still dismissing. Unit-tested only: the simulator's paywall loaded fine, so the failure path never ran.

## 3. Fix the `first-week-review` hint (small bug)

Evidence: `hint_shown` with `id = first-week-review` fired **492 times for 119 users**, one per week from week 2 through week 13, and was dismissed only **3** times. `FirstRunHint` retires a hint only when its own dismiss control is tapped. Closing `WeekInReviewSheet` doesn't retire it, so players see "Every week ends like this…" after every week of their first run.

- [x] Retire the hint on first render, or when the week-in-review sheet closes. Code: `src/components/game/week-in-review-sheet.tsx:49`, `src/components/game/first-run-hint.tsx`.
- [x] Check the other hints that are dismissed far less often than they're shown: `hq` (212 shown / 30 dismissed), `money` (150 / 7), `market` (157 / 14), `team` (160 / 20). Verify each is shown once, not once per visit.
  - Done (Sep 29, from the code, because the PostHog MCP lacks `query:read` so the per-user data couldn't be pulled): the tabs use default `Tabs` with no `unmountOnBlur`, so `hint_shown` fires once each time the game screens mount (a launch, or a new or continued run). It doesn't fire on every tab visit. That matches `hq` 212 / `team` 160 / `money` 150 / `market` 157 from about 120 users (about 1.3 to 1.8 each). These hints still retire only on ✕, which the code chooses on purpose. **Decision (Sep 29):** keep retire-on-✕ for these tab hints. The acceptance criterion applies to `first-week-review` only.
- **Acceptance:** `hint_shown` for each id is at most about one per user.

## 4. Make the wall stop inviting repeat taps

Evidence: players who hit the wall tap Advance about **5.3 times each** on 1.0.4-19 (337 blocks from 63 users). The Sep 8 copy changes shipped, but players still retry.

- [x] After the first blocked tap, change the Advance control into a non-button state: a refill countdown plus "Get more weeks". Code: `game-chrome.tsx` (exhausted branch).
- **Acceptance:** blocked taps per wall user drop from 5.3 to below 2. Paywall-shown-per-user shouldn't fall with it, since the purchase entry stays one tap away.
- Done notes (Sep 29):
  - **Seen in the simulator:** after one blocked tap, the control shows "Free weeks refill in 9h 22m" plus a secondary "Get more weeks". The RevenueCat paywall opens from it, and closing the paywall returns to the countdown. Screenshot: `artifacts/2026-09-29-wall-countdown.png`.
  - **Code only, not seen:** the button coming back after a refill, a purchase, or reaching midnight in-app. The latch is in memory, so a relaunch also brings the button back for one more tap.

## 5. Investigate hire/fire churn (analysis first)

Evidence:
- `hires_changed`: 3,093 events from 114 users (about 27 each). That's the main interaction, as expected.
- `layoff_confirmed`: 176 events from only **23** users (about 7.6 each).
- `game_over`: 14 bankruptcies against 12 acquisitions, with 5 bankruptcies still at the garage stage.

Status: blocked
Blocker: the PostHog MCP connection lacks the `query:read` / `insight:read` scopes. You agreed to reauthorize it on Sep 29; rerun once it's reconnected.

- [ ] Break `layoff_confirmed` down by `role` and `week`, and look at the `runway` / `cash` just before it. Find out whether players are firing people to survive (a balance problem) or undoing mis-hires (a UX problem: hire and fire controls too close together, or no undo).
- [ ] Only then pick a change. Samples are small, so treat this as a qualitative lead.

## Not recommended now

- **More onboarding work:** the funnel is at 92% step-to-step.
- **Another A/B test right away:** at about 33 installs a week, any single test takes months to read. Prefer shipping sensible defaults (items 1 to 4) and watching the weekly return metric. Run at most one experiment at a time, and only where the effect could be large.
- **Price changes:** 3 purchasers in 30 days is not enough signal.

## Order

1. **Item 0:** confirm the PostHog step (ship `test` at 100%), then OTA (needs confirmation under `AGENTS.md`).
2. **Items 2 and 3** (about half a day each): these can go in the same OTA as item 0.
3. **Item 4** (about half a day).
4. **Item 1:** the real project. Start with the delivery audit, then the cliffhanger plus pre-prompt.
5. **Item 5:** analysis in parallel.
