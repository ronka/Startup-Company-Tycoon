# Rename: "Startup Company Tycoon" → "Startup Empire Tycoon"

Branch: `rename-startup-empire`. Triggered by an App Review rejection for name
similarity to an existing game.

The codebase carried **two** old variants — `Startup Company Tycoon` (app.json,
share text) and `Startup Tycoon` (everything in-app). Both are now
`Startup Empire Tycoon`. "Tycoon" is kept deliberately — it's generic genre
vocabulary (Game Dev Tycoon, RollerCoaster Tycoon…); the collision Apple
flagged is in "Startup **Company**" and in the icon artwork, not in "Tycoon".

---

## 1. Done in this branch (code)

| File | What changed |
| --- | --- |
| `app.json:3` | `expo.name` → `Startup Empire Tycoon` (writes `CFBundleDisplayName`) |
| `src/app/index.tsx:66` | Title-screen wordmark — now stacked on three lines at 56pt; worth an eyeball on a small device |
| `src/app/onboarding.tsx:193` | Story-step eyebrow |
| `src/app/(game)/_layout.tsx:27` | Drawer label |
| `src/state/notification-content.ts:43` | Default push-notification title |
| `src/widgets/company-widget.tsx:64` | Empty-state widget tile — 21 chars at 15pt will wrap to two lines in `systemSmall`; check before shipping |
| `src/lib/share-card.ts:15,93` | `APP_NAME` in run-share text + doc example |
| `scripts/sim.ts:335` | Headless-sim banner (cosmetic) |
| `package.json:2` | npm package name (cosmetic) |
| `.env:7-10` | Comment now notes the RevenueCat app still holds the old name |
| tests | `share-card.test.ts` ×3, `notification-content.test.ts` ×1 |

`npm test` — 439 passing, 31 files.

`ios/` and `android/` are gitignored (CNG), so there are no native files to
edit — `expo prebuild` regenerates them from `app.json`. **But** both dirs
exist on this machine from an earlier prebuild and still hold the old
`CFBundleDisplayName`. `npm run ios` will reuse them and show the old name,
which looks like the rename failed. Run `npx expo prebuild --clean` (or delete
the two dirs) before testing locally. EAS prebuilds remotely, so production
builds are unaffected.

---

## 2. Deliberately NOT changed — the app is live (`id6787488376`)

Changing any of these costs users, money, or a worse rejection:

- **`bundleIdentifier` / android `package`** (`com.ronkaa.startuptycoon`) — a
  shipped App Store record's bundle ID is immutable. Changing it creates a
  *new* app: loses installs, ratings, and the whole IAP catalog.
- **IAP product IDs** — `PRODUCT_ID_PREFIX` in `src/purchases/product-weeks.ts:4`
  and the purchases tests. Registered in App Store Connect and RevenueCat;
  renaming breaks purchases and transaction-ID reconciliation.
- **App Group** `group.com.ronkaa.startuptycoon` (`app.json:53`) — tied to the
  provisioning profile and the widget's shared container.
- **AsyncStorage keys** — the seven `startup-tycoon/…` keys in
  `game-store.tsx:59-65`, plus `notification-permission.ts`, `store-review`,
  `first-run-hint`, `game-chrome`, `notification-manager`. Live players' saves
  are behind these.
- **`slug: "startup-tycoon"`** — part of the EAS project identity, no upside.
- **`scheme: "startuptycoon"`** — existing deep links. To add a new one, make
  `scheme` an array and *append* `"startupempire"`; don't replace.
- **`src/analytics/config.ts:8`** — comment names the real PostHog project
  (`startup-company-tycoon`, id 505800). Accurate until that project is renamed.

None of these are user-visible. Apple's objection is to the *displayed* name.

---

## 3. Assets — all five branded images still say "STARTUP COMPANY TYCOON"

This is the biggest remaining item, and probably the actual cause of the
rejection: the icon is a wordmark in a style that reads as the other game.

| File | Where it shows | Note |
| --- | --- | --- |
| `assets/images/icon.png` (1024²) | iOS home screen, App Store listing | Full wordmark |
| `assets/images/android-icon-foreground.png` | Android adaptive icon | Full wordmark |
| `assets/images/splash.png` (1000²) | Launch screen | Full wordmark on `#00387F` |
| `assets/images/favicon.png` | Web tab | Wordmark, illegible at size |
| `assets/logo-white.png` | Marketing only | Full wordmark. Not imported by `src/` or `app.json` — lower priority |
| `assets/logo-transperent.png` | Marketing only | Same wordmark on transparency. Also unreferenced in code |
| `app-store-screenshots/public/app-icon.png` | Screenshot deck | Copy of the old icon; replace when the icon is redrawn |

The first four ship inside the binary or the store listing and are blocking.
The last three are marketing surfaces.

Recommendation: don't just swap the words. The 3-D yellow-and-blue city-skyline
treatment is itself close to the game Apple flagged. A distinct mark removes the
similarity argument entirely rather than arguing about it.

---

## 4. Needs your action outside the repo

- **App Store Connect** — app name, subtitle, keywords, promotional text.
  This is what Apple rejected; `expo.name` alone does not change the listing.
  ("Startup Empire Tycoon" is 21 chars, under the 30 limit. Worth checking the
  name isn't already taken before committing.)
- **Screenshots** — `app-store-screenshots/` is a gitignored Next.js subproject,
  so nothing there is in this commit. I did edit
  `app-store-screenshots/app-store-screenshots.json:3` locally
  (`appName` → `Startup Empire Tycoon`); that change lives only on this machine.
  `public/app-icon.png` there is still the old icon, and
  `public/screenshots/{apple,android}/…/en/` are currently empty — the deck gets
  re-rendered once the new icon exists.
- **RevenueCat** — rename the "Startup Tycoon iOS" app display name. Cosmetic;
  **product IDs stay**.
- **Expo/EAS** project display name on expo.dev, and **PostHog** project 505800
  name. Both cosmetic.

### Open question — `src/constants/links.ts` (left untouched on purpose)

`PRIVACY_POLICY_URL` and `SUPPORT_URL` point at
`https://www.ronka.dev/startup-tycoon/{privacy,support}`. I did **not** repoint
these: a dead privacy URL is a Guideline 5.1.1 rejection, which is worse than
the one being fixed.

If you want them on a `/startup-empire/` path, the order is: publish the new
pages (with redirects from the old paths) → update `links.ts` → update the
matching URLs in App Store Connect. The page *copy* also names "Startup Tycoon"
twice per `2026-07-28-app-store-iap-review-readiness.md`.

---

## 5. Ship path

`expo.name` sets `CFBundleDisplayName`, which is native. **This cannot ship as
an `eas update` OTA** — it needs a prebuild, a new production build, and a
resubmission. Per `AGENTS.md`, no build gets run without your say-so.

Expect the iOS home-screen label to read `Startup Emp…` — springboard truncates
around 12 characters. That's normal and not worth shortening `expo.name` over:
Apple allows the App Store name (30 chars) to differ from the on-device label.
If you'd rather control the truncation, the lever is `CFBundleName` via
`ios.infoPlist`, not `expo.name`.

Rough order:

1. Redraw the assets (§3).
2. Decide the `links.ts` question (§4).
3. Bump the version past 1.0.2 — `npm run build:production:ios` does this via
   `scripts/bump-app-version.js`.
4. Build + submit, and update the App Store Connect metadata (§4) in the same
   submission.
