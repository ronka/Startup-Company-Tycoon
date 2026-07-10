# Plan: IAP Week Packs (RevenueCat, iOS-only v1)

> Generated from: conversation (grill-me session, 2026-07-10)
> Date: 2026-07-10

## Overview

Monetize the game with consumable "week pack" in-app purchases via RevenueCat, iOS only for v1. Two SKUs — 20 weeks / $1.99 and 60 weeks / $4.99 — sold from a bottom sheet that appears when the daily free budget (5/day, bank cap 10, unchanged) runs out, and from a tappable HUD week counter. Purchased weeks live in a separate pool: spent after free weeks, exempt from the bank cap, never expire, persist across game runs. Delivery is made idempotent via transaction-ID reconciliation against RevenueCat's `nonSubscriptionTransactions` on purchase and on launch. Reinstall loss of unspent weeks is accepted (anonymous RC IDs). Funnel is measured with client PostHog events plus the RevenueCat→PostHog integration. Android and web keep today's free-only behavior behind a platform gate.

---

## Tasks

### Task 1: Purchased-weeks pool, end to end

- **Type**: AFK
- **Blocked by**: None - can start immediately

#### What to build

The economy layer for purchased weeks, with no RevenueCat dependency. Extend `src/state/week-budget.ts` with a separate purchased-weeks pool: spend order is free weeks first, then purchased; purchased weeks are exempt from `WEEKS_BANK_CAP`, never expire, and survive new games. Persist the pool in `src/state/game-store.tsx` alongside the existing week budget (outside the per-run game state). Surface it in the HUD: the existing `WeekBudgetDots` in `src/components/game/game-chrome.tsx` gains a "+N" companion when the purchased pool is non-zero, and the out-of-weeks copy only shows when BOTH pools are empty. Add a dev-only grant action (behind the existing `devFreePlay`-style flag or a debug menu entry) so the slice is demoable without purchases.

#### Acceptance criteria

- [ ] `week-budget.ts` exposes a purchased pool with free-first spend order, cap-exempt, covered by unit tests (grant, spend order, day-rollover with non-zero purchased pool, persistence round-trip)
- [ ] Purchased pool persists across app restarts and across game runs (new game / game over does not reset it)
- [ ] HUD shows "+N" when purchased weeks exist; advancing weeks consumes free first, then purchased
- [ ] "Come back tomorrow" state only appears when both pools are empty
- [ ] Dev-only grant path allows demoing the whole flow without IAP
- [ ] `npm test` passes; web build unaffected

#### User stories addressed

- Player can keep playing past the daily cap using purchased weeks
- Player never feels paid weeks "ate" the free daily allotment

---

### Task 2: Buy-weeks sheet with stubbed purchases

- **Type**: AFK
- **Blocked by**: Task 1

#### What to build

The full purchase UX against a stub. Create `src/purchases/` exposing a small interface (get available packs, purchase pack) with a stub implementation that returns the two hardcoded packs (20 weeks / $1.99, 60 weeks / $4.99) and "completes" a purchase instantly in dev. Build the bottom sheet: triggered when the player tries to advance with 0 weeks in both pools (replacing/augmenting the current "come back tomorrow" row in `game-chrome.tsx`) and from tapping the HUD week counter anytime. Gate the buy surface to iOS via a platform check — Android/web keep today's behavior exactly. Add analytics events to `src/analytics/events.ts` following the existing centrally-captured pattern: `paywall_shown` (with `trigger: 'out_of_weeks' | 'hud'`), `purchase_started`, `purchase_completed`, `purchase_failed` (with error code).

#### Acceptance criteria

- [ ] Sheet opens from both triggers on iOS; buying a pack via the stub credits the purchased pool from Task 1
- [ ] Android and web never show the sheet or the tappable affordance; existing out-of-weeks copy remains there
- [ ] All four analytics events fire with correct properties (verifiable in PostHog debug/dev)
- [ ] Purchase-failure path shows a non-blocking error state in the sheet
- [ ] Works in Expo Go and web dev (stub only, no native module yet); `npm test` passes

#### User stories addressed

- Player who runs out of weeks is offered packs at the moment of highest intent
- Player can proactively stock up from the HUD without being nagged

---

### Task 3: Store admin setup (App Store Connect + RevenueCat)

- **Type**: HITL (thin) + AFK — most console work is automatable via the connected RevenueCat MCP
- **Blocked by**: None - can start immediately (parallel with Tasks 1–2)

#### What to build

Split between a thin human slice and MCP-driven setup. **Human-only**: sign the Paid Apps agreement in App Store Connect (banking + tax — sandbox purchases fail silently without it), provide the App Store Connect API credentials when the RevenueCat app is created, and create a sandbox tester account. **Via RevenueCat MCP** (no `startup-tycoon` project exists yet — verified 2026-07-10): create the project and iOS app (`com.ronkaa.startuptycoon`), create the two consumable products (`com.ronkaa.startuptycoon.weeks20` at $1.99, `com.ronkaa.startuptycoon.weeks60` at $4.99) and push them into App Store Connect with `create-product-in-store` / `submit-products-to-store`, create the `weeks` offering with two packages attached to the products, and fetch the public iOS SDK key (`list-app-public-api-keys`) into `.env` (following the existing PostHog `.env` pattern).

Note: RevenueCat Virtual Currencies were considered for the weeks balance and rejected — spending balance requires the secret API key (a backend we don't have). The local purchased pool + tx-ID reconciliation design stands.

#### Acceptance criteria

- [ ] Paid Apps agreement is Active in App Store Connect (human)
- [ ] Sandbox tester account created and signed in on the test device (human)
- [ ] RC project + iOS app exist; both consumable products created and pushed to App Store Connect in "Ready to Submit" state
- [ ] Offering `weeks` returns both packages (verifiable via MCP `get-offering`)
- [ ] Public SDK key in `.env` (never the secret key)

#### User stories addressed

- (Enabler — no direct user story; unblocks real purchases in Task 5)

---

### Task 4: EAS development build

- **Type**: HITL
- **Blocked by**: None - can start immediately (parallel with Tasks 1–3)

#### What to build

A development client so native purchase code can be tested (`react-native-purchases` cannot run in Expo Go). Add a `development` profile to `eas.json` (internal distribution, development client) and an npm script (e.g. `build:dev:ios`) consistent with the existing production scripts in `package.json`. Build and install the dev client on a physical iPhone. Per the eas-publish/expo-publish skill conventions, do not bump the app version for dev builds.

#### Acceptance criteria

- [ ] `eas.json` has a `development` profile; `npm run build:dev:ios` produces an installable dev client
- [ ] Dev client runs the app from the local metro server on a physical iPhone
- [ ] Production build scripts and profiles unchanged

#### User stories addressed

- (Enabler — no direct user story; unblocks sandbox testing in Task 6)

---

### Task 5: RevenueCat SDK integration with reconciliation

- **Type**: AFK
- **Blocked by**: Task 2, Task 3

#### What to build

Replace the stub with the real thing behind the same `src/purchases/` interface. Add `react-native-purchases`, configure it at app start (iOS only) with the public key from `.env` and anonymous app user IDs. Fetch the `weeks` offering so the sheet shows live localized prices instead of hardcoded ones (fall back gracefully if offerings fail to load). Implement transaction-ID reconciliation: persist a set of granted transaction IDs; on purchase completion AND on every app launch, diff `customerInfo.nonSubscriptionTransactions` against the granted set and credit any missing grants to the purchased pool — making delivery idempotent and crash-safe. Pass PostHog's distinct ID to RevenueCat via `setAttributes` (for the Task 6 PostHog integration). Provide a vitest stub and a web/Expo Go-safe module boundary mirroring the existing PostHog stubbing approach, so `npm test` and web builds stay green.

#### Acceptance criteria

- [ ] Sheet displays live prices from the RC offering on iOS; stub still used on web/tests
- [ ] Reconciliation is pure/injectable and unit-tested: missing grant credited once, already-granted tx never re-credited, multiple pending grants all credited
- [ ] Reconciliation runs on launch and after purchase; granted-tx set persists in AsyncStorage
- [ ] PostHog distinct ID set as an RC subscriber attribute before first purchase
- [ ] `purchase_failed` distinguishes user-cancelled from real errors (cancellation is not an error state in the sheet)
- [ ] `npm test` passes; web build and Expo Go unaffected

#### User stories addressed

- Player is reliably credited exactly the weeks they paid for, even if the app crashes mid-purchase
- Player sees correct localized store prices

---

### Task 6: Sandbox verification, PostHog integration, TestFlight pass

- **Type**: HITL
- **Blocked by**: Task 4, Task 5

#### What to build

End-to-end verification with real money rails. On the dev client with the sandbox tester: buy both packs, confirm credits and spend order; force-kill the app between purchase and grant to prove launch reconciliation self-heals; verify Android/web still show no purchase UI. Use the RevenueCat MCP (`list-purchases`, `get-customer`) to confirm each sandbox purchase landed server-side, instead of manual dashboard checks. In the RevenueCat dashboard, enable the PostHog integration (project 505800 token) and confirm server-verified revenue events plus the client funnel events land in PostHog. Finish with a TestFlight build via the existing production scripts and a final purchase pass there.

#### Acceptance criteria

- [ ] Both packs purchasable in sandbox; balances and spend order correct
- [ ] Kill-app-mid-purchase test: weeks appear on next launch, exactly once
- [ ] RevenueCat→PostHog integration live; revenue events and client funnel events visible in PostHog project 505800
- [ ] TestFlight build passes a full purchase flow
- [ ] Submission checklist ready: IAPs attached to the app version for App Review

#### User stories addressed

- Player on the released app can buy week packs that are delivered reliably
- Developer can see paywall funnel and verified revenue in PostHog

---
