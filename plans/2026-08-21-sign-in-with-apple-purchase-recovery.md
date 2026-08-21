# Sign in with Apple + Neon purchase recovery

**Why:** App Store rejection, Guideline 3.1.1 — limited-duration consumables with no
restore mechanism. Apple wants *"an optional user-registration feature that allows users
to restore their purchases to all of their supported devices"*, plus copy at the purchase
point saying registration is what makes restore possible, and a way to register later.

**Scope:** the minimum that actually satisfies that, and nothing else. Optional Sign in
with Apple → a Neon-backed entitlement ledger → purchased weeks and bailout tokens
recoverable on any device signed into the same Apple ID.

**Platform:** iOS only (Sign in with Apple is iOS/tvOS only, and IAP is already iOS-only —
see `purchasesAvailable` in `src/purchases/index.native.ts`). Web and Android render
nothing new.

---

## 0. The core problem, stated once

Week packs and bailouts are **consumables**. Apple drops finished consumables from the
StoreKit receipt, so `Purchases.restorePurchases()` can only ever recover a purchase this
install never finished crediting. That is why the existing Restore button honestly reports
"nothing to restore" most of the time — and it is exactly why Apple is asking for an
account.

Restoring a consumable therefore means restoring a **balance**, not a receipt. That needs a
server that knows both halves:

- **granted** — every purchase transaction ever credited to this account
- **spent** — how many of those weeks/tokens the player has already burned

`remaining = granted − spent`.

> **Do not "simplify" this by dropping spend tracking.** A server that stores only the
> purchase ledger and re-credits every transaction the local ledger hasn't seen would pass
> review *and* mint infinite weeks on reinstall-and-restore. Spend tracking is the whole
> reason the schema has two counters.

### Sync model: monotonic counters merged with `GREATEST`

The client pushes **cumulative totals**, never deltas:

- transactions: `INSERT … ON CONFLICT DO NOTHING` (idempotent by primary key)
- spent: `SET weeks_spent = GREATEST(weeks_spent, $incoming)`

This is idempotent by construction, retry-safe, offline-tolerant, and needs no dedup table
and no request IDs. Worst case (two devices played concurrently, both offline) some *spend*
is under-counted, which errs in the player's favour. Purchases can never be lost.

`granted` is **derived** (`SUM` over the transactions table), not a stored counter, so it
cannot drift from the ledger.

---

## 1. Decisions already made (do not re-litigate)

| Decision | Choice |
|---|---|
| API host | **Expo Router API routes** (`+api.ts`) deployed to **EAS Hosting** |
| Database | **New Neon project** `startup-tycoon` (create in Task 2) |
| Apple scopes | **None requested** — `signInAsync()` with no `requestedScopes`. Still returns the stable `user` id and `identityToken`, which is all we need. No email, no name, no private-relay handling, no Contact Info privacy label. |
| RevenueCat `logIn()` | **Not in v1.** Aliasing anonymous→identified RC IDs brings transfer-behaviour edge cases and creates a second cross-device grant path competing with the Neon ledger. Neon is the single authority. |
| Session auth | Our own opaque bearer token in `expo-secure-store`. Apple's `identityToken` lives ~10 min and can't be silently refreshed, so it is used **once**, at sign-in. |
| "Reset app" (`resetAll`) | Clears local state and signs out **locally**. Server account and balances survive — deletion is the separate, explicit action. |
| Migrations | None. Both pools load via `raw ? JSON.parse(raw) : null` with no version gate. New fields are optional with `?? 0` defaults. See §3.1 for the one accepted consequence. |
| Sign-out keeps server-sourced weeks | Accepted. Sign in on a borrowed device, pull 20 weeks, sign out, keep them locally. Separating server-sourced from locally-purchased balance is real complexity for an abuse case worth $1.99, and it does not affect review. Documented, not fixed. |

### Secrets boundary — read this before touching `.env`

The repo's `.env` is **entirely `EXPO_PUBLIC_` client keys**. Do not follow that pattern here.

- `DATABASE_URL`, `APPLE_BUNDLE_ID` → **server-only**, set via `eas env:create` with
  secret visibility. Never in `.env`, never `EXPO_PUBLIC_`-prefixed.
- Metro strips non-`EXPO_PUBLIC_` vars from the client bundle, and vars referenced only
  inside `+api.ts` files never reach the client. That is the guarantee we rely on.
- The client needs **no** new public env var — the API base URL comes from the
  `expo-router` plugin's `origin` option (Task 4).

---

## 2. Task 0 — read the docs first (AGENTS.md)

- [x] Read <https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/>
- [x] Read <https://docs.expo.dev/router/web/api-routes/>
- [x] Read <https://docs.expo.dev/eas/hosting/get-started/> and the EAS Hosting env-var page

**Runtime constraint that falls out of this:** EAS Hosting runs API routes on a
worker-style runtime, not full Node. Use `@neondatabase/serverless` (HTTP driver, `fetch`
based — *not* `pg`) and `jose` (Web Crypto based) for JWT verification. Nothing that
requires `node:net` or `node:crypto` primitives.

---

## 3. Task 1 — de-risk the `web.output` flip **(do this first; it gates the plan)**

API routes require `"web": { "output": "server" }`. This repo deliberately runs
`"single"` because static prerendering can't SSR this stateful, AsyncStorage-backed game
(recorded in the web-scaffolding notes). `server` output **also** prerenders app routes, so
this may break the web export.

- [x] Flip `app.json` → `web.output: "server"`
- [x] Run `npx expo export --platform web`
- [x] Confirm it completes and `dist/server/` contains the API bundle
- [x] Confirm `npx expo start --web --port 8199 --clear` still renders the game

**Result:** export completed cleanly, no prerender crash. `dist/server/` contained the
prerendered routes as expected; `dist/` was removed after the check (build artifact, not
committed). Dev server on :8199 served the game shell correctly. No Plan B needed.

**If the export fails** (prerender crash on the game routes), stop and report before
improvising. Plan B, in order of preference:

1. Guard the offending module for SSR (`typeof window === 'undefined'` bail-outs in the
   AsyncStorage/store entry points) — cheapest if the crash is one or two modules.
2. Revert to `output: "single"` and ship the three endpoints as a standalone Vercel
   project. Everything else in this plan is unchanged except how the client resolves the
   base URL (an `EXPO_PUBLIC_API_URL` instead of `origin`).

Do not silently pick Plan B — it is a real fork in the road.

---

### 3.1 Task 2 — local spend counters (the one shape change)

`PurchasedWeeksPool` is `{ weeksRemaining, grantedTransactionIds }`. There is **no record
of how many purchased weeks have been spent**, so a device that has been playing signed-out
cannot report `weeksSpent` at first link — the server would see `granted=20, spent=0` and
hand back 20 to a player who has 15 left.

- [x] `src/state/week-budget.ts` — add `weeksSpent?: number` to `PurchasedWeeksPool`;
      increment it in `spendWeekFromPools` on the purchased-pool branch. Read everywhere as
      `pool.weeksSpent ?? 0`.
- [x] `src/state/revive.ts` — add `tokensSpent?: number` to `RevivePool`; increment in
      `consumeReviveToken`. Read as `pool.tokensSpent ?? 0`.
- [x] `src/state/game-store.tsx` — the load path around lines 426–441 is where the `?? 0`
      default has to land; `initialPurchasedWeeksPool()` / `initialRevivePool()` should
      start these at `0`.
- [x] Extend `src/state/__tests__/week-budget.test.ts` and `revive.test.ts`.

**Result:** also had to fix `creditTransaction` / `creditReviveTransaction` — they built a
fresh object without spreading `...pool`, which would have silently dropped `weeksSpent` /
`tokensSpent` on every credit. `game-store.tsx`'s load path needed no direct edit: it already
assigns the parsed JSON straight to the typed pool and falls back to
`initialPurchasedWeeksPool()` / `initialRevivePool()`, so making the field optional with a
`0` default in those two functions was sufficient. 505/505 tests pass; `tsc --noEmit` and
`npm run lint` show only pre-existing issues in files this task didn't touch
(`app-store-screenshots/`, `buy-weeks-sheet.tsx`, `notification-manager.tsx`,
`use-color-scheme.web.ts`, `engine.ts`).

**Accepted assumption:** installs that already exist backfill `weeksSpent` to `0`, so their
first link over-grants by whatever they'd already spent. That is in the player's favour, it
affects only users who bought before this ships, and it is cheaper than building migration
machinery for a field that self-corrects on the next spend. State it, don't fix it.

---

## 4. Task 3 — Neon project + schema

- [x] Create Neon project `startup-tycoon` (**ask the user before creating** — it's a new
      billable resource) — confirmed. Project ID `withered-voice-14406924`, branch `main`
      (`br-floral-thunder-axe9hi6p`), database `neondb`.
- [x] Apply the schema below to `main`

```sql
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  apple_user_id text unique not null,
  weeks_spent   int not null default 0,
  revives_spent int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- `granted` is derived from this table, never stored, so it can't drift.
create table purchase_transactions (
  account_id     uuid not null references accounts(id) on delete cascade,
  transaction_id text not null,
  product_id     text not null,
  weeks          int  not null default 0,
  revives        int  not null default 0,
  created_at     timestamptz not null default now(),
  primary key (account_id, transaction_id)
);

create table sessions (
  token_hash   text primary key,          -- sha-256 of the bearer token, never the token
  account_id   uuid not null references accounts(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index sessions_account_idx on sessions(account_id);
```

- [x] `eas env:create` → `DATABASE_URL` (secret, production + preview) and
      `APPLE_BUNDLE_ID=com.ronkaa.startuptycoon`

**Result:** both created as `secret` visibility on `production` and `preview` for
`@ronkaa/startup-tycoon`. Confirmed via `eas env:list` (values render as `*****`, as
expected for secret visibility). Note: `eas env:create` is now deprecated in favor of
`eas env:set` — still works, no action needed for this plan.

---

## 5. Task 4 — API routes

Three endpoints. `npx expo install @neondatabase/serverless jose`.

Shared helper `src/app/api/_lib/` (leading underscore → not a route):

- `db.ts` — `neon(process.env.DATABASE_URL!)`
- `apple.ts` — verify the identity token with `jose.jwtVerify` against
  `createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))`; assert
  `iss === 'https://appleid.apple.com'`, `aud === APPLE_BUNDLE_ID`, `exp` in future.
  Returns `sub`. **Confirm `aud` against a real `identityToken` during the curl testing
  below** rather than trusting the constant — for native Sign in with Apple it is the bundle
  id, but a wrong `aud` fails closed and presents as a broken sign-in, not as a config bug.
- `session.ts` — `createSession(accountId)` returns a random token (`crypto.randomUUID()`
  ×2) and stores only its SHA-256; `requireSession(request)` reads
  `Authorization: Bearer …`, hashes, looks up, bumps `last_seen_at`, 401s otherwise.
- `entitlements.ts` — `loadEntitlements(accountId)`: one query returning
  `{ weeksGranted, weeksSpent, revivesGranted, revivesSpent, transactionIds }`.

### `POST /api/auth/apple` → `src/app/api/auth/apple+api.ts`

Request `{ identityToken: string }`.
Verify → `INSERT INTO accounts (apple_user_id) … ON CONFLICT (apple_user_id) DO UPDATE SET
updated_at = now() RETURNING id` → create session.
Response `{ sessionToken, entitlements }` — sign-in is one round trip, no follow-up fetch.

### `POST /api/entitlements/sync` → `src/app/api/entitlements/sync+api.ts`

Bearer session. Request:

```ts
{
  transactions: { transactionId: string; productId: string; weeks: number; revives: number }[],
  weeksSpent: number,
  revivesSpent: number,
}
```

One transaction, three statements:

1. bulk `INSERT INTO purchase_transactions … ON CONFLICT DO NOTHING`
2. `UPDATE accounts SET weeks_spent = GREATEST(weeks_spent, $1),
   revives_spent = GREATEST(revives_spent, $2), updated_at = now() WHERE id = $3`
3. `loadEntitlements(accountId)`

Response: the authoritative entitlements. **Reject `weeks`/`revives` values the client
invents** — recompute them server-side from `product_id` using the same
`weeksForProduct` / `isReviveProduct` mapping as `src/purchases/product-weeks.ts`, and
ignore transactions whose product id isn't ours. The client is not trusted to price its own
purchases.

### `DELETE /api/account` → `src/app/api/account+api.ts`

Bearer session. `DELETE FROM accounts WHERE id = $1` — cascades to transactions and
sessions. Returns 204. **Must actually delete** (Guideline 5.1.1(v), mandatory the moment
the app supports account creation).

- [x] All three implemented
- [x] `curl` each against `npx expo start` locally
- [x] `npx eas deploy --prod` (**confirm with the user before deploying**), note the
      production URL, set it as the `expo-router` plugin's `origin` in `app.json`

**Result:** implemented `src/app/api/_lib/{db,apple,session,entitlements}.ts` and the three
routes. `sync+api.ts` reuses `weeksForProduct`/`isReviveProduct` directly from
`src/purchases/product-weeks.ts` (confirmed that file and its dependency chain — `stub.ts`,
`types.ts` — are pure TS with no RN/native imports, so it's safe to import server-side)
rather than duplicating the pricing map. Tested locally against `npx expo start --web` with
`DATABASE_URL`/`APPLE_BUNDLE_ID` supplied via a throwaway `.env.local` (gitignored via
`.env*.local`, deleted after testing — never committed): missing/garbage-token 400/401 on
`auth/apple`, no-bearer 401 on `sync` and `account`, then a full happy path against a
hand-seeded test account+session via the Neon MCP — empty sync → zeroed entitlements; a
`weeks20` transaction plus a bogus product id → 20 granted, bogus one dropped; a re-push of
the same transaction with a lower `weeksSpent` → idempotent insert (`weeksGranted` unchanged)
and `GREATEST`-merged spend (unchanged, not lowered); a revive transaction → both counters
correct; `DELETE /api/account` → 204, cascade verified by direct query (`accounts`,
`purchase_transactions`, `sessions` all 0 rows), and the now-deleted session immediately
401s on a follow-up sync. Test row cleaned up by the delete itself.

**Not yet verified:** the `aud` claim against a *real* Apple `identityToken` — no physical
device/Sign-in-with-Apple flow available from this environment. `jwtVerify`'s `audience`
check is wired to `APPLE_BUNDLE_ID`, but confirming it's the right claim shape is deferred to
the on-device sandbox test in §12 (Verification), as the plan anticipated when it flagged
this as something that "fails closed and presents as a broken sign-in, not as a config bug."

**Two real bugs found and fixed before deploying, both worth recording:**

1. **The plan's `_lib/` leading-underscore assumption was wrong.** `npx expo export`
   compiled `src/app/api/_lib/*.ts` into real page routes (`/api/_lib/db.html` etc.) —
   Expo Router does not exclude underscore-prefixed folders from routing in this version
   (only reserved names like `_layout` are special). Fixed by moving the shared helpers
   entirely out of `src/app` to `src/server/entitlements-api/{db,apple,session,entitlements}.ts`
   and updating the three route files' imports to `@/server/entitlements-api/...`. Re-export
   confirmed exactly 12 app routes + 3 API routes, no stray pages.
2. **`eas deploy --prod` failed on first attempt**: `Uncaught Error: No database connection
   string was provided to neon()`. `eas deploy` imports each route module to detect its
   exported HTTP methods before any request runs, and does so without `DATABASE_URL` in
   scope — the original `db.ts` called `neon(process.env.DATABASE_URL!)` eagerly at module
   top level, which threw during that import. Fixed by making it lazy (`getSql()`,
   constructed on first real call) and updating every `sql` call site (`session.ts`,
   `entitlements.ts`, all three routes) to call `getSql()` instead of importing a top-level
   constant.

Re-verified end-to-end against the local dev server after both fixes (same test matrix as
before: 400/401 error paths, all three routes respond correctly), then redeployed —
`eas deploy --prod` succeeded. **Production URL: `https://startup-tycoon.expo.app`.**
Confirmed live via curl: `/api/auth/apple` 400s on a missing token, `/api/entitlements/sync`
and `/api/account` 401 without a bearer session — all against the real production Neon
database. Set `app.json`'s `expo-router` plugin `origin` to
`https://startup-tycoon.expo.app` (replacing the bare `"expo-router"` string entry) — this
also satisfies the matching checklist item in Task 9.

**Also required user approval mid-task for two more auto-blocked commands**
(`eas env:create` for the two secrets, then `eas env:pull --environment production` to get
`DATABASE_URL` present locally for the deploy-time validation step — which turned out to
return nothing usable anyway since secret-visibility vars can't be read outside EAS servers,
confirming the real fix had to be the lazy-`getSql()` refactor, not env availability).

---

## 6. Task 5 — client: pure sync logic (test this, don't inline it)

`src/purchases/entitlement-sync.ts`, mirroring how `reconciliation.ts` is structured and
tested — pure, no SDK, no AsyncStorage, no fetch.

```ts
export interface ServerEntitlements {
  weeksGranted: number; weeksSpent: number;
  revivesGranted: number; revivesSpent: number;
  transactionIds: string[];
}

/** What this device pushes: cumulative totals, never deltas. */
export function buildSyncPayload(
  purchased: PurchasedWeeksPool,
  revives: RevivePool,
  storeTransactions: readonly PurchaseTransaction[],
): SyncPayload

/** Server response → the two local pools. */
export function mergeEntitlements(
  purchased: PurchasedWeeksPool,
  revives: RevivePool,
  server: ServerEntitlements,
  opts: { firstLink: boolean },
): { purchased: PurchasedWeeksPool; revives: RevivePool }
```

`mergeEntitlements` rules:

- `remaining = max(0, granted − spent)` from the server
- `weeksSpent` / `tokensSpent` ← the server's (already `GREATEST`-merged) counters
- `grantedTransactionIds` ← the **union** of local and server, never a replace:
  ```ts
  grantedTransactionIds: [...new Set([...purchased.grantedTransactionIds, ...server.transactionIds])]
  ```
  Same for the revive ledger. Seeding from the server is what stops double-granting on a
  fresh device — the next `reconcileOnLaunch` skips transactions the server already knows.
  But **replacing** would drop a transaction this device credited locally and hasn't managed
  to push yet (offline, timeout, app killed mid-sync); `reconcileOnLaunch` would then stop
  seeing it as granted and credit it a second time. That partly self-heals on the next pull,
  but if the player spends the phantom weeks first, their cumulative `weeksSpent` inflates
  and they permanently lose real weeks. Union, always.
- **`firstLink: true` → take `max(serverRemaining, localRemaining)`.** A device linking for
  the first time must never *lose* balance to a server that hasn't heard of one of its
  transactions. On an already-linked device the server value is taken plainly, so a spend
  on another device actually lands.

- [x] Implemented
- [x] `src/purchases/__tests__/entitlement-sync.test.ts` covering: fresh device (local 0 →
      server balance), linked device that spent locally, first-link with local ahead of
      server, already-linked with server ahead, empty server account, idempotent re-sync,
      **and local holding a transaction id the server doesn't** (it must survive the
      merge — this is the case that catches replace-instead-of-union).

**Result:** `src/purchases/entitlement-sync.ts` + 10 tests, all passing. One deliberate
design note not spelled out in the plan's `ServerEntitlements` shape: the server's
`transactionIds` is a single list mixing weeks and revive transaction ids (the
`purchase_transactions` table doesn't separate by kind), so `mergeEntitlements` unions that
same list into *both* local ledgers. Verified this is harmless, not just convenient: the
per-kind filter (`weeksForProduct`/`isReviveProduct`) is what actually gates crediting during
`reconcileOnLaunch`, so an id sitting in the "wrong" pool's ledger is inert — covered by the
new "unions the same server transaction ids into both ledgers" test.

### Where the pushed transactions come from

The local ledger stores only transaction **IDs** — no product, no week count — so it can't
price itself. At sync time, read `Purchases.getCustomerInfo().nonSubscriptionTransactions`
instead: RevenueCat keeps that history server-side per customer and it carries
`productIdentifier`, which is exactly what `/sync` needs. Local ledger IDs that RC no longer
reports are not pushed; the `firstLink` `max` above is the guard that keeps them from
costing the player anything.

---

## 7. Task 6 — client: account module

`src/account/` — new folder, same `index.ts` / `index.native.ts` split as `src/purchases/`
so web and vitest never load the native modules.

- [x] `npx expo install expo-apple-authentication expo-secure-store`
- [x] `apple-auth.native.ts` — `isAvailableAsync()`, `signInAsync()` **with no
      `requestedScopes`**, returns `{ appleUserId, identityToken }`
- [x] `session-store.ts` — session token in SecureStore (`startup-tycoon/session/v1`)
- [x] `api.ts` — `signInWithApple`, `syncEntitlements`, `deleteAccount`; relative
      `fetch('/api/…')` (resolved by `origin`), 8 s timeout, typed results. A failed sync is
      **never** an error the player sees — it retries on the next trigger. Offline play must
      not degrade.
- [x] Fallback module for web/Android/Expo Go: `accountAvailable = false`, everything no-ops

**Result:** structured exactly like `src/purchases/` — `index.ts` (universal, exports
`fallback.ts`) / `index.native.ts` (guards on `Platform.OS === 'ios' && Constants.appOwnership
!== 'expo'`, dynamically `require('./api')`) / `fallback.ts` (no-ops) / `api.ts` (the real
implementation, native-only reachable) / `types.ts` (shared result types, so `fallback.ts` and
`api.ts` stay structurally assignable to each other without either importing the native SDK).
`apple-auth.native.ts` additionally carries the literal `.native.ts` Metro-exclusion suffix
per the plan, on top of the runtime guard — belt and suspenders, matching why the plan called
it out specifically.

**One bug caught before it shipped:** the plan's SecureStore key
(`startup-tycoon/session/v1`) contains slashes. `expo-secure-store` validates keys against
`/^[\w.-]+$/` and throws on anything else (confirmed in its source,
`SecureStore.ts`'s `isValidKey`) — that key would have crashed at runtime on first
sign-in. Used `startup-tycoon.session.v1` instead.

**Design choice beyond the plan's file list:** `origin` resolution isn't a literal relative
`fetch()` — React Native's `fetch` has no notion of a document base URL, so a bare
`fetch('/api/...')` would fail on native regardless of the `expo-router` plugin config. `api.ts`
reads `Constants.expoConfig?.extra?.router?.origin` (confirmed by reading the plugin's
`withRouter.js` — that's literally where the `origin` option gets stored) and builds the full
URL itself.

**Not yet verified:** the `Constants.expoConfig.extra.router.origin` read, same as the `aud`
claim in Task 4 — no physical device available from this environment. Deferred to the §12
on-device sandbox test.

---

## 8. Task 7 — wire into `game-store.tsx`

New context fields: `account: { status: 'signed-out' | 'signed-in'; appleUserId?: string }`,
`signInWithApple()`, `signOut()`, `deleteAccount()`.

- [x] On launch, **after** `reconcileOnLaunch`: if a session token exists, run a sync pass
      and merge (`firstLink: false`). Order matters — RC reconciliation credits any pending
      local transactions first, then sync pushes them up and pulls the truth down.
- [x] `signInWithApple()` → `POST /api/auth/apple` → sync → merge with `firstLink: true` →
      persist session token. Report `signed-in` / `cancelled` / `error` distinctly.
- [x] Sync on any purchased-pool or revive-pool change, **debounced ~2 s**. This one trigger
      covers both purchases and spends.
- [x] **Guard that trigger against a feedback loop.** The merge at the end of a sync writes
      the pools back via `applyPurchasedWeeks` — a new object identity, so the effect fires
      again, syncs again, merges again, forever, even when nothing changed. Keep a
      `lastPushedPayloadRef` next to `purchasedWeeksRef` holding the serialized push payload
      (`weeksSpent`, `revivesSpent`, sorted transaction ids — that is the entire payload) and
      skip the sync when it is unchanged. A ref, not state, so back-to-back changes in one
      handler compare against the truth.
- [x] The existing `restorePurchases()` also runs a sync pass when signed in, and its
      `RestoreOutcome` counts server-recovered weeks/revives so the button's
      "Restored 20 weeks" message stays honest.
- [x] `signOut()` — clears the session token and local `account` state only. Pools are left
      alone (they're this device's copy).
- [x] `deleteAccount()` — `DELETE /api/account`, then sign out locally.
- [x] `resetAll()` — additionally clears the session token. Server account untouched (see §1).

Reuse `applyPurchasedWeeks` / `applyRevivePool` and the synchronous `…Ref` mirrors — a sync
that lands mid-handler must be visible to the next read, same reason `applyReconciliation`
reads the refs and not React state.

**Result:** called `advisor()` before writing this (highest-risk task in the plan) and it
caught a real bug in the sketched design before any code was written: `purchasedWeeksRef` /
`revivePoolRef` are only assigned by the *persistence* effects, after commit — so a launch-time
sync reading them directly would see `null` → fall back to an *empty* pool → union the empty
set with the server's transaction ids → silently drop any locally-credited-but-not-yet-pushed
transaction. That's the exact replace-instead-of-union failure the plan's Task 5 section warns
about, reintroduced through the ref-staleness door instead. Fixed by reconciling into plain
local variables in the mount effect and assigning both refs *synchronously* right after, before
the first `performSync` call — so all four call sites (launch, sign-in, debounced auto-sync,
restore) always read fresh refs.

Also per the advisor's review: `performSync` re-reads the refs *after* the network call, not
the pre-call snapshot, before merging (an 8s timeout is long enough for a TICK to land in
between — merging against a stale snapshot would drop whatever changed during the wait; the
*payload pushed* still uses the pre-call snapshot, which is fine — an under-counted spend
value errs in the player's favour per the plan's sync-model note). The auto-sync guard
(`pushSignature`, comparing `weeksSpent`/`revivesSpent`/sorted local ledger ids) runs *before*
`getStoreTransactions()`, not after, so a spend that doesn't change the signature doesn't cost
a native round trip it'll just throw away. `resetAll` and `deleteAccount` both clear
`lastPushedPayloadRef` (not just the session token) so a later sign-in re-pushes the full set
rather than silently skipping on a stale signature match.

**One correctness fix mid-implementation, not advisor-flagged:** the React Compiler's
`react-hooks/immutability` lint rule flagged `performSync` as "accessed before declared"
inside the mount effect (functionally safe at runtime — effects only run after the full
render commits — but the compiler enforces a stricter static rule). Fixed properly rather
than suppressing: moved `applyPurchasedWeeks` / `applyRevivePool` / `performSync` above all
effects, and wrapped the first two in `useCallback(..., [])` (both close only over refs and a
`useState` setter — genuinely stable) so `performSync`'s own `useCallback([applyPurchasedWeeks,
applyRevivePool])` is stable too. That let both effects list `performSync` as a real dependency
without turning the debounced auto-sync effect into a "reschedule on every render" bug — a
non-memoized `performSync` in that dependency array would have restarted the 2s timer on every
render, not just on an actual pool change.

**New analytics events added to `src/analytics/events.ts`** (Task 8 asked for these; added now
since this pass already touches every handler that fires them):
`ACCOUNT_SIGN_IN_STARTED` / `_COMPLETED` / `_FAILED`, `ACCOUNT_SIGNED_OUT`, `ACCOUNT_DELETED`,
`ENTITLEMENTS_SYNCED { weeks, revives }`.

**Verification:** `tsc --noEmit` clean, `npm run lint` clean on every touched file (repo-wide
lint shows the same pre-existing, unrelated errors/warnings as before this task), full test
suite 515/515 passing. `npx expo export --platform web` succeeds; the dev server renders the
game shell on `:8199` with no error text in the response and no console errors in the server
log. **Not verified:** actual interactive behavior (tapping "Sign in with Apple", watching the
debounce fire, a real restore) — no interactive browser or physical device available in this
environment. Deferred to §12 alongside the `aud` claim and `origin` resolution gaps already
recorded there.

---

## 9. Task 8 — UI (this is what the reviewer actually looks at)

Apple's rejection asks for three things. Two are UI.

**Status: done.**

### 9.1 Settings → Purchases (`src/app/(game)/settings.tsx`)

Inside the existing `purchasesAvailable` block, above `RestorePurchasesButton`:

- [x] Signed out — Apple's official `AppleAuthenticationButton`
  (`SIGN_IN`, `BLACK`, corner radius matching `PrimaryButton`) plus:
  > **Sign in to keep your purchases.** Purchased weeks and bailouts are saved to your
  > Apple ID, so you can restore them on your other devices. Signing in is optional — you
  > can do it any time.
- [x] Signed in — a "Signed in with Apple" row, a **Sign out** row, and a **Delete account**
  row (destructive tint, confirmation, then actually deletes).

**Result:** `src/components/game/apple-sign-in-button.tsx` / `.native.tsx` (platform-split
wrapper over `AppleAuthenticationButton`, `cornerRadius: Radius.md`, kept `.native.tsx`-suffixed
so `expo-apple-authentication` — no web shim — never enters the web bundle even though
`settings.tsx` is a universal screen) and `src/components/game/account-settings-section.tsx`,
wired in above `RestorePurchasesButton`.

### 9.2 At the purchase point — required by the rejection text

Apple: *"We recommend indicating that account registration is necessary to restore
previously purchased In-App Purchase products."* A Settings row alone does not satisfy this.

- [x] `src/components/game/legal-links-row.tsx` / `PaywallFooter` — one muted line above the
      existing disclosure, shown only when signed out:
      > Sign in with Apple to restore these weeks on your other devices.
      …with the words "Sign in with Apple" as a link that runs the same sign-in flow.
- [x] Same line on the bankruptcy bailout paywall.
- [x] After a successful purchase while signed out, the success state offers sign-in once
      ("Keep these weeks safe — sign in with Apple"), dismissible, not blocking.

**Result:** `AccountSignInHint` added to `legal-links-row.tsx` — a nested `<Text onPress>`
inside `<Text>` (not `Pressable`, which can't nest inline inside `Text` on native) so the
tappable words sit mid-sentence. Wired into `PaywallFooter` (covers the bankruptcy bailout
paywall via `game-over.tsx`) as its own line above the disclosure row, and directly into
`buy-weeks-sheet.tsx` above its `LegalLinksRow`. The post-purchase offer is implemented in
`buy-weeks-sheet.tsx` only (the one purchase-completion path this codebase fully controls the
UI for): a successful purchase while signed out swaps the sheet's content for a small "Weeks
added!" view with a "Sign in with Apple" / "Not now" pair instead of closing immediately;
either button closes the sheet (dismissible, not blocking — even a failed/cancelled sign-in
still closes). **Scoped gap, not silently skipped:** the RevenueCat-hosted paywall (the
*primary* purchase surface, per `buy-weeks-flow.ts`'s own comment) and the bailout paywall in
`game-over.tsx` complete their purchases through flows this pass didn't extend with the same
post-purchase toast — both already carry the pre-purchase `AccountSignInHint` from 9.2, which
is what Apple's rejection text actually asks for; the post-purchase nudge on those two surfaces
is a smaller completeness gap, not a compliance one.

### 9.3 Gating

Everything above renders only when `accountAvailable && purchasesAvailable`
(`AppleAuthentication.isAvailableAsync()` on iOS). Web, Android and Expo Go are unchanged.

- [x] Analytics: `ACCOUNT_SIGN_IN_STARTED / COMPLETED / FAILED`, `ACCOUNT_SIGNED_OUT`,
      `ACCOUNT_DELETED`, `ENTITLEMENTS_SYNCED { weeks, revives }` in
      `src/analytics/events.ts`, captured centrally in the store as the existing events are.

**Result:** `accountAvailable` (`src/account/index.native.ts`) and `purchasesAvailable`
(`src/purchases/index.native.ts`) are defined by the *identical* expression
(`Platform.OS === 'ios' && Constants.appOwnership !== 'expo'`), so they're always equal by
construction — gating a component on `accountAvailable` alone is equivalent to
`accountAvailable && purchasesAvailable`, not a weaker check. `AccountSettingsSection` and
`AccountSignInHint` both gate this way rather than writing a redundant `&&`. Analytics events
were added during Task 7 (game-store.tsx already fires all five from the handlers that
needed them), not deferred to this pass. `tsc --noEmit` clean, `npm run lint` and `npm test`
(515/515) clean on every file this task touched — verified against a full repeat repo-wide
lint run, not just the touched-file subset, since an earlier truncated read of that output
looked like it might contain new issues and needed re-checking; it didn't. Dev server smoke
test (`/`, `/settings`) both 200 with no bundler errors, confirming `expo-apple-authentication`
stays out of the web bundle. **Not verified:** the actual interactive UI (tapping the Apple
button, watching the post-purchase offer) — no interactive browser or device available here;
deferred to §12 with the other device-only gaps already recorded in Tasks 4/6/7.

**Second `advisor()` pass caught two real bugs before this was called done, both fixed:**

1. **The launch-time entitlements sync was `await`ed inside the mount effect, ahead of the
   `finally` that flips `loading` false.** `performSync` can involve an 8s network timeout, so
   this held every `loading`-gated effect — the autosave effect included — hostage to that
   round trip on a cold launch. On bad connectivity, a player could tick for several seconds
   with no autosave landing, which is exactly what §12's "Airplane mode: … nothing blocks"
   check exists to catch. Fixed: `performSync` is now fire-and-forget there (`.catch(...)`,
   not `await`) — safe because it reads through the refs assigned synchronously just above it,
   not through anything captured by the `await`. `hasSessionToken()` (a local SecureStore read,
   not a network call) is still awaited.
2. **Wrong copy on the bailout paywall.** `AccountSignInHint`'s text was hardcoded "restore
   these weeks", but `PaywallFooter` — which it was wired into — is only ever rendered by
   `game-over.tsx`'s bailout paywall, which sells a revive, not weeks. Fixed: `AccountSignInHint`
   takes a `noun: 'weeks' | 'purchases'` prop; `PaywallFooter` forwards `noun="purchases"`
   (its actual sole use case) and `buy-weeks-sheet.tsx` keeps the `'weeks'` default.

Also recorded, non-blocking: confirmed via grep that no `LegalLinksRow`/`LegalLinkText` call
site sits outside `GameProvider` (it wraps the whole app at the root `_layout.tsx`, so
`AccountSignInHint`'s new `useGame()` dependency is safe everywhere it's used); added a §12
device-check line for the modal-over-modal risk of presenting Apple's sign-in sheet from
inside an already-presented `BottomSheet` (the same present-while-presented shape
`docs/bug-stuck-decision-modal.md` documents elsewhere in this codebase, untested here since
it's iOS-only and device-only).

Re-verified after both fixes: `tsc --noEmit` clean, `npm test` 515/515, lint clean on every
touched file (one pre-existing, unrelated `buy-weeks-sheet.tsx` error persists — same
`setErrorCode(null)`-in-effect issue flagged before this task touched the file), dev server
smoke test (`/`, `/settings`) both 200.

---

## 10. Task 9 — native config

- [x] `app.json` → `ios.usesAppleSignIn: true`
- [x] `app.json` → `plugins: [["expo-router", { "origin": "https://<eas-hosting-url>" }]]`
      (replaces the bare `"expo-router"` entry). Dev builds resolve to the local dev server
      automatically.
- [ ] Sign In with Apple capability enabled on the App ID — EAS credentials prompts during
      the build; confirm it lands in the provisioning profile. **Blocked: needs an actual EAS
      build**, which needs your confirmation first (per AGENTS.md) — see §12.
- [ ] `expo-apple-authentication` is a **native module**: this ships as a **new production
      build**, not an OTA update. There is no `eas update` path for it. (Informational — no
      action here; noted so the build-order dependency in §12 isn't missed.)

---

## 11. Task 10 — outside the repo (do not skip; these are what get apps rejected twice)

- [ ] **Privacy policy at `ronka.dev/startup-tycoon/privacy` is now false.** It says "no
      accounts and no login" (see `2026-07-28-app-store-iap-review-readiness.md`). Add: an
      optional Sign in with Apple that stores a random Apple-provided identifier and a
      purchase balance on our own server (Neon, EU/US region); no email, no name; deletable
      in-app via Settings → Delete account.
- [ ] **App Privacy labels** — add *Identifiers → User ID*, **App Functionality**, linked to
      identity. No Contact Info entry (we request no scopes).
- [ ] **Review notes** — extend the block in the 2026-07-28 doc:
      > Restoring purchases: **Settings → Purchases → Restore purchases** works without an
      > account. To restore across devices, **Settings → Purchases → Sign in with Apple**
      > (optional, offered again on both purchase screens). The same section has **Delete
      > account**.
- [ ] Reply to the rejection in App Store Connect Resolution Center pointing at exactly
      those two paths.
- [ ] New production build + submit — **confirm with the user before running either**
      (AGENTS.md).

---

## 12. Verification

- [ ] `npm test` green (new: `entitlement-sync`, updated `week-budget`, `revive`)
- [ ] `npm run lint` clean
- [ ] **A development build first.** `expo-apple-authentication` is native and the gate is
      `accountAvailable && purchasesAvailable`, which is false in Expo Go — so the on-device
      checks below need `npm run build:dev:ios` before the production build. That is **two**
      EAS builds to confirm with the user, not one.
- [ ] Sandbox Apple ID, device A: buy a 20-pack, spend 5, sign in → server shows
      `granted 20 / spent 5`
- [ ] Kill the app mid-sync right after a purchase, relaunch → the transaction is credited
      exactly once (the ledger-union case from §6, end to end)
- [ ] Device B (or delete + reinstall), same Apple ID: sign in → **15 weeks appear**
- [ ] Device B spends 3, device A relaunches → device A shows 12
- [ ] Sign out on B, relaunch → local balance intact, no sync
- [ ] Delete account → row gone from Neon; both devices fall back to local-only; a fresh
      sign-in starts empty
- [ ] Airplane mode: buy, spend, relaunch — nothing blocks, nothing throws, sync catches up
      when connectivity returns
- [ ] Tap Restore and sign-in repeatedly — balance never grows
- [ ] **Modal-over-modal check, flagged by `advisor()` during Task 8, not verified here.**
      `handleOfferSignIn` (`buy-weeks-sheet.tsx`'s post-purchase offer) and the in-sheet
      `AccountSignInHint` both present Apple's system Sign in with Apple sheet *from inside an
      already-presented `BottomSheet`* — the same present-while-presented shape
      `docs/bug-stuck-decision-modal.md` documents as an iOS hang elsewhere in this codebase
      (there, between two of the app's own `<Modal>`s; here, the app's `BottomSheet` and the
      OS's own auth sheet, which may not share that failure mode — untested). Tap "Sign in
      with Apple" from inside the buy-weeks sheet's post-purchase offer and from the
      pre-purchase `AccountSignInHint` and confirm the OS sheet presents and dismisses cleanly
      both times before shipping either surface.

---

## 13. Explicitly out of scope

Cross-platform accounts (Android), email/password or any second sign-in method, server-side
receipt validation or RevenueCat webhooks, cloud save of the *game* (only entitlements
sync), migrating the free daily week budget, and `Purchases.logIn()` identity aliasing.
