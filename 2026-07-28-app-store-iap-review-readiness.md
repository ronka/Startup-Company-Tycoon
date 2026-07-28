# App Store review readiness for IAP — what's in code, and what's left

Companion to the IAP work landed on 2026-07-28. The code side is done; the
items below live outside the repo (website + App Store Connect) and are the
ones that actually get apps rejected.

## 🔴 Blocker: the privacy policy contradicts the app

`https://www.ronka.dev/startup-tycoon/privacy` currently says:

> "Startup Tycoon does not require an account and does not transmit your
> gameplay data to us." … only uses Expo Application Services (EAS) "solely to
> deliver app updates."

That is not what the app does. It ships:

- **PostHog** (`src/analytics/posthog.ts`) — sends gameplay events to
  `POSTHOG_HOST` on every meaningful action, carrying run context (week, cash,
  valuation, stage, morale…) via `gameProps`, plus a persistent anonymous
  distinct ID and the player's **CEO name** (`CEO_NAME_SET` sets it as a person
  property).
- **RevenueCat** (`src/purchases/revenuecat.ts`) — processes purchases and is
  explicitly linked to the PostHog identity via
  `setAttributes({ $posthogUserId })`.

Two consequences:

1. **Guideline 5.1.1(i)** requires the policy to identify what data is
   collected and confirm that third parties receiving it provide equal
   protection. A policy that denies collection the app performs fails this.
2. The **App Privacy "nutrition labels"** in App Store Connect must match real
   SDK behaviour. Declaring "Data Not Collected" while PostHog and RevenueCat
   are linked is a well-known rejection *and* a compliance problem independent
   of Apple.

### Replacement text to publish

> **What we collect**
>
> Startup Tycoon has no accounts and no login. Your saved game — company,
> progress, and purchased weeks — is stored only on your device.
>
> We use **PostHog** for product analytics. It receives anonymous usage events
> (screens opened, in-game actions, and run statistics such as week number,
> cash, and valuation) together with a randomly generated identifier and basic
> device information (device type, OS version, app version). If you enter a CEO
> name, that name is attached to this identifier. This identifier is not linked
> to your real-world identity and is regenerated if you delete and reinstall
> the app.
>
> We use **RevenueCat** to process in-app purchases. It receives your purchase
> transactions and a random identifier so purchases can be delivered and
> restored. Payment itself is handled entirely by Apple — we never see or
> receive your payment details.
>
> We use **Expo Application Services (EAS)** to deliver app updates.
>
> **How it's used**
>
> Only to understand how the game is played, fix bugs, and deliver and restore
> purchases. We do not sell your data, do not use it for advertising, and do
> not use third-party ad or tracking networks.
>
> **Third parties**
>
> PostHog, RevenueCat, and Expo are contractually required to protect this data
> to the same standard set out in this policy and may use it only to provide
> their service to us.
>
> **Retention and deletion**
>
> Game data lives on your device and is erased when you delete the app or use
> Settings → Reset app. Analytics events are retained for up to 12 months.
> To withdraw consent or request deletion of data associated with your device,
> email **hi@ronka.dev** and we'll delete it.
>
> **Contact** — hi@ronka.dev

Adjust the retention window to whatever PostHog is actually configured for.

## App Store Connect checklist

- [ ] **Privacy Policy URL** → `https://www.ronka.dev/startup-tycoon/privacy`
- [ ] **Support URL** → `https://www.ronka.dev/startup-tycoon/support`
- [ ] **App Privacy labels** — declare, at minimum:
      *Usage Data → Product Interaction* (linked to identity, for Analytics),
      *Identifiers → User ID* (analytics + app functionality),
      *Purchases → Purchase History* (app functionality),
      *Other Data → CEO name* if you keep sending it. Must match the policy above.
- [ ] **Paid Applications Agreement** signed and active in Business — IAPs
      simply don't load without it, which reviewers see as a broken paywall.
- [ ] **Create all three products** as **Consumable**, matching
      `src/purchases/product-weeks.ts` exactly:
      `com.ronkaa.startuptycoon.weeks20`,
      `com.ronkaa.startuptycoon.weeks60`,
      `com.ronkaa.startuptycoon.revive`
- [ ] **RevenueCat offerings** named `weeks` and `revive`
      (`OFFERING_LOOKUP_KEY` / `OFFERING_LOOKUP_KEY_REVIVE`).
- [ ] **Attach the IAPs to the app version.** First-ever IAP submission *must*
      go up with a new app version, and all three products must be selected in
      the version's In-App Purchases section. Products left in "Ready to
      Submit" and not attached are the single most common IAP rejection.
- [ ] **Screenshot + review notes per product** — App Store Connect requires a
      review screenshot for each. Use the buy-weeks sheet for the two packs and
      the bankruptcy game-over screen for revive.
- [ ] **Review notes** — tell the reviewer how to reach each paywall:
      > Week packs: tap the week counter in the top bar at any time, or play
      > until the daily free weeks run out. Bailout: it appears on the game-over
      > screen when a run ends in bankruptcy. Restore Purchases is in
      > Settings → Purchases and on both purchase screens.

## What the code now does (for reference)

- **Restore Purchases** (`src/components/game/restore-purchases-button.tsx`) in
  Settings → Purchases, on the buy-weeks sheet, and on the bankruptcy paywall.
  Backed by `Purchases.restorePurchases()` and the existing idempotent
  reconciliation, so it can never double-grant. Reports restored / nothing to
  restore / store unreachable as three distinct states.
- **Privacy Policy, Terms of Use, Support** rows in Settings → Legal & Support,
  and privacy/terms links under both paywalls
  (`src/components/game/legal-links-row.tsx`, `src/constants/links.ts`).
- **Purchase disclosure** on both paywalls: one-time purchase, not a
  subscription, weeks never expire.

Terms of Use points at Apple's standard EULA, which is correct as long as no
custom licence agreement is uploaded to App Store Connect. If you upload one,
update `TERMS_OF_USE_URL` in `src/constants/links.ts` to match.
