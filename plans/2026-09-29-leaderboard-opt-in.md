# Leaderboard opt-in: real players on the board

Date: 2026-09-29

## Status (2026-09-29)

**App side implemented** (A1–A9, but no "assisted" badge: the board stays simple).

**Website side** is implemented and deployed in preview mode; see `startup-tycoon-website/plans/2026-09-29-leaderboard-real-players.md`. That doc supersedes the W-tasks below: there's no bulk-delete route (opt-out deletes each run through the existing `DELETE`), and mixed mode reports `mode: 'live'` with `samplesIncluded: true`. The website privacy and support pages are updated, but App Store Connect privacy answers and the mobile opt-out bug still need work before the OTA.

**Decisions since the first draft:**
- Samples and real players are mixed. The user removes the samples once there are enough real players.
- Public fields are only company name, week, stage, status, and founder stake.
- No assisted or paid-run marking.

**Code map:**
- `src/state/leaderboard-sync.ts`: pure logic (snapshots, queue, prompt rule), with tests.
- `src/state/leaderboard-provider.tsx`: storage, network, rank lookup, join-sheet state.
- `src/components/game/leaderboard-join-sheet.tsx`: the consent sheet.
- `src/components/game/leaderboard-rank-card.tsx`: the HQ teaser.
- The week-5 ask is in `game-chrome.tsx`. The Settings switch is in `settings.tsx`. The run ID is assigned in `game-store.tsx`'s `storeReducer`.

## Goal

Let players opt in to publishing their runs on the global leaderboard, so the board shows real founders alongside the seeded samples. Drive opt-ins with three touchpoints:

1. **Onboarding**: a soft mention only, with no sign-in before the first week.
2. **Week 5**: the real ask, a sheet that ends in Sign in with Apple and consent.
3. **HQ teaser**: "You're #X of Y", shown to everyone and always tappable. Players who haven't opted in get "Join to claim it".

This touches two repos: this app, and `startup-tycoon-website`, which holds the leaderboard API and the Neon table.

## Decisions (agreed 2026-09-29)

| Topic | Decision |
|---|---|
| Identity | Opt-in goes through **Sign in with Apple** (live in 1.0.4). The website's `PUT/DELETE /api/leaderboard/runs/:runId` already resolve the app's bearer session. |
| Onboarding | Soft mention only, with no sign-in step. |
| Teaser rank | Show `#X of Y` against the public board **as is**, with samples counted. Tradeoff accepted: while the board is mostly samples, the count includes fictional startups. See open question 2. |
| Scope | One global **"Publish my runs"** toggle. Every run auto-publishes while it's on. Turning it off unpublishes all your runs. |

## What already exists

- **App:** read-only board screen at `src/app/(game)/leaderboard.tsx` and client at `src/lib/leaderboard-api.ts`. SIWA account module at `src/account/`, with `signInWithApple` and `hasSessionToken`. `founderStakeFor()` is in `src/game/balance.ts:707`.
- **Website:** `leaderboard_runs` table, `PUT` upsert with revision and transition checks, `DELETE` unpublish, and a per-account rate limit of 1-minute windows (`allowWrite`). `parseRunInput` accepts only `companyName, week, stage, outcome, founderStake, valuation, founderEquity, revision, publish`, so there is **no `sector` yet**.
- **Gaps:**
  - `PUT` always stores player rows as `visibility: 'hidden'`.
  - The board query shows **either** samples (`preview`) **or** players (`live`), controlled by `LEADERBOARD_LIVE`, never both.
  - There's no rank lookup for a run that isn't on the board.
  - There's no name moderation.
  - `GameState` has no stable run ID.

## Website work (ships independently, no app release needed)

- [ ] **W1. Mixed board mode.** Add a third mode, `mixed`: rank `player` and `sample` rows together by founder stake, keeping the `Sample` flag on each row. Suggested switch: `LEADERBOARD_MODE=preview|mixed|live`.
  - **Wire compatibility:** the shipped app's `parseBoardPage` turns any mode other than `'live'` into `'preview'`. In mixed mode, report `mode: 'live'` plus a new `samplesIncluded: true` flag, so OTA-22 clients stay correct.
  - **Ranks:** every row in mixed mode, samples included, gets a real `rank` from **one** ordering: stake desc, `score_updated_at` asc, `run_id` asc. W4 must use exactly the same ordering.
  - **This reverses a recorded rule.** The website plan said samples are "never counted as actual players", and commit `cdf3fef` plus the sample/live separation tests enforce it. Those tests change. The rule is superseded by this plan.
  - **Sample cron:** the daily job keeps growing samples, so they could permanently hold the top ranks. Set `SAMPLE_CRON_ENABLED=false`, or cap sample stakes, when switching to mixed.
  - Recommended rollout: go to `mixed` once opt-in ships. Retire the samples (`live`) once real players pass a threshold, e.g. 50.
- [ ] **W2. Honor the publish signal.** When `publish: true` and the name passes moderation, store `visibility: 'public'`. When it's `false`, keep the row hidden.
- [ ] **W3. Name moderation.** Add a profanity/slur blocklist check on `companyName`. A blocked name either stays hidden or is replaced with a neutral fallback like "Stealth Startup #1234". Add a manual hide path, even if it's only SQL at first.
- [ ] **W4. Rank lookup: `GET /api/leaderboard/rank?stake=N[&runId=…]`.** Public, and uploads nothing. It returns `{ rank, total, mode }`, where rank = 1 + the number of public rows with a higher stake, using W1's ordering. The app uses this for the teaser whether or not the player has opted in. Cache it for a short time.
  - Not on the board (no `runId`, or the run is hidden): the app shows "#X of **total + 1**", since the player isn't counted in `total`.
  - On the board: exclude the player's own row when counting rows above them.
- [ ] **W5. `DELETE /api/leaderboard/runs` (all of mine).** Bulk unpublish for turning the toggle off. It can instead be implemented as "set visibility hidden" so turning the toggle back on restores the rows.
- [ ] **W6. (Optional) `sector` in `parseRunInput`**, so real rows show the focus the way samples show a sector.
- [ ] **W7. Privacy and App Store compliance.** This is outside this repo, and it has to happen **before** the release that starts uploading.
  - The privacy policy now lives at `startup-tycoon-website.vercel.app/privacy`. It explains the public fields, server-only valuation and equity, ongoing updates, and removal options.
  - Update the App Privacy labels in App Store Connect.
  - Company names on a public board are user-generated content. Guideline 1.2 needs a report mechanism and contact info, not only filtering. See A8's Report action. The app was rejected once already, so treat this as real risk even though the feature ships by OTA.

## App work

### A1. Stable run ID (GameState change: needs an explicit OK)

- Add `runId: string` (UUID v4) to `GameState`. Generate it in the store (not in the pure engine) and pass it in `NEW_GAME`.
- **Existing saves:** on load, backfill a UUID if it's missing, and write it back to the save. There's no version gate (see memory: no migrations), so this is the one migration step. Keep it tolerant: a missing `runId` just means "generate one".
- Add a `revision` counter per run in the upload queue, not in `GameState`. It increases on every snapshot sent.

### A2. Opt-in state and settings

- Persisted preference: `leaderboardOptIn: 'unset' | 'in' | 'out'`, plus `optInPromptedAt` / `promptDismissCount`. Store it in the same place as other player prefs, not in `GameState`, so it survives new runs.
- **Settings row:** "Publish my runs to the leaderboard" toggle.
  - Turning it on with no session runs SIWA, then consent.
  - Turning it off calls bulk unpublish (W5).
- Account deletion already cascades on the server, so no extra work is needed there.

### A3. Consent sheet (shared by every entry point)

- One bottom sheet: "Put {Company} on the global leaderboard?"
  - Lists exactly what's public: company name, week, stage, founder stake.
  - States that the CEO name and Apple ID are never shown.
  - Buttons: **Sign in with Apple & join** / Not now.
- If already signed in (for purchase recovery), skip SIWA and use a single "Join" button.
- On success: set `'in'`, then upload the current run right away.

### A4. Uploader

- `src/lib/leaderboard-sync.ts`: builds the snapshot from state and calls `PUT` with `publish: true`.
  - `founderStake = founderStakeFor(equity, valuation)`, rounded to match the server's ±1 check.
  - When the run ends, send the final score from `scoreFor`. Bankruptcy sends 0.
  - Outcome mapping. `GameOverReason` has exactly three values: `null` → `running`, `bankruptcy` → `bankrupt` (the server's spelling), `acquired` → `acquired`, `ipo` → `ipo`. Stage names match the server's as they are.
- **Triggers:** week advance (debounced, at most one call in flight, latest snapshot wins), game over, and revive (bankrupt → running).
- **Offline:** keep one pending snapshot per `runId` in storage and retry on app foreground.
  - 429: back off.
  - 409 `run_conflict`: drop the snapshot (an older one lost).
  - 401: clear the session and set opt-in back to `'unset'` so the player is asked again.
- Upload only when `leaderboardOptIn === 'in'` and `hasSessionToken()`.

### A5. Onboarding soft mention

- One line on the `goal` or `launch` beat of `src/app/onboarding.tsx`, e.g. "Top founders make the global leaderboard."
- There's no button and no sign-in. It plants the idea for the week-5 ask.
- Keep it inside the existing StoryStep copy. Don't add a new step.

### A6. Week-5 prompt

- Show the consent sheet (A3) once the run reaches week 5, only if opt-in is `'unset'` and the run isn't over.
- Fetch the rank first (W4), so the sheet can say "You'd be **#7 of 312** right now."
- On "Not now": ask again at most once more (e.g. at a stage-up or a funding round), then stop. Set `'out'` only from the explicit toggle.
- Don't stack it on top of other week-close modals, such as decision modals, the review ask, or the notification ask. Queue it behind them in the day-close flow.

### A7. HQ rank teaser

- A compact card or pill on `src/app/(game)/(tabs)/hq.tsx`: "🏆 #X of Y founders".
- Fetched from W4 with the current founder stake. Refresh on week advance and on focus, and cache the last value so it never flashes empty.
- **Not opted in:** "You'd be #X of Y · Join", which opens the consent sheet.
- **Opted in:** "#X of Y", which opens the leaderboard screen scrolled or highlighted to your row.
- **Offline or error:** hide the card. Don't show a broken state.
- Wording: the server's `mode` field decides between "founders" (live/mixed) and "startups" (preview), so the count is never overstated as all real people.

### A8. Leaderboard screen touches

- Highlight your own rows. Needs `runId`, since the server already returns it.
- Add an "Unverified community board" footnote, matching the website's framing.
- **Report** action on player rows, e.g. a long press that opens a `mailto:` with the `runId`. Guideline 1.2 requires it (see W7).
- Update `parseBoardPage` to read `samplesIncluded`.

### A9. Analytics (captured centrally in the store, per the PostHog convention)

- `leaderboard_optin_prompt_shown { source: week5|hq|settings|board }`
- `leaderboard_optin_accepted { source }` and `leaderboard_optin_declined { source }`
- `leaderboard_optout`
- `leaderboard_run_published`, and `leaderboard_publish_failed { status }`
- `leaderboard_teaser_tapped { opted_in }`
- Funnel to watch: week-5 reach → prompt shown → accepted.

## Release: what ships how

| Piece | How it ships |
|---|---|
| W1–W7 | Vercel deploy of the website. Apply any schema change to Neon as a separate step. |
| A1–A9 | **OTA** (`eas update`), as long as it's pure JS. SIWA and SecureStore are already in the 1.0.4 native binary. Confirm before publishing. |
| Native build | Not needed. `expo-crypto` is **not** installed, so don't add it. Generate the run ID as a pure-JS UUID v4 from `Math.random`. That's fine here: the ID only has to be unique, not secret, and the server enforces ownership through the session. |

**Order:**
1. W1–W5 and W7 on the website, with the mode still `preview`.
2. App OTA.
3. Switch the website to `mixed`.
4. Later, `live` once real players pass the threshold.

## Verification

- **Unit:** snapshot builder (stake math matches the server's ±1 rule, bankrupt = 0, terminal outcomes), upload queue (debounce, latest wins, handling of 409, 429, and 401), and `runId` backfill on an old save.
- **Website tests:** mixed-mode ranking, publish → public, blocked name stays hidden, the rank endpoint's off-by-one at ties, bulk unpublish.
- **Device (dev build or TestFlight):**
  - Fresh install → onboarding mention → week 5 prompt → SIWA → row appears on the board.
  - Settings toggle off → row gone.
  - Revive → row back to running.
  - Airplane mode during week advance → uploads on the next foreground.

## Open questions

1. **Real player threshold for `live`:** 50? 100? Or never retire samples and let them drift down naturally?
2. **Samples in the teaser count:** you chose "#X of Y as is". Mixed mode keeps samples labeled `Sample` on the board, so "Y founders" includes around 12 fictional ones. That's fine at scale. Revisit if players complain.
3. **Paid weeks and revives (fairness):** add an "assisted" badge on runs that used a bailout? Not in v1 unless you want it.
4. **Default company names:** do many players keep a generated default name? If so, the board may be full of duplicates. It may be worth nudging a rename in the consent sheet.
