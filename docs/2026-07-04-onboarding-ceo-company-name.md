# Onboarding: CEO name + company name

## Goal

Add a first-run onboarding step so a new game collects:

1. **CEO name** — the player. Set once, **persists across games** (never asked again on restart).
2. **Company name** — asked **every** new game. Drives the HQ header, shown as `"{companyName} HQ"`.

Restarting a game (game-over → play again, or the debug "start new game") should ask **only** for a new company name, greeting the returning CEO by name.

## Key design decision: two different lifetimes

| Datum | Lifetime | Where it lives |
| --- | --- | --- |
| CEO name | Per **player** — survives `NEW_GAME` | New standalone profile store in AsyncStorage, **outside** `GameState` |
| Company name | Per **run** — wiped with the save on `NEW_GAME` | New field on `GameState` |

`GameState` is fully replaced by `newGame()` on every restart (`storeReducer` → `NEW_GAME`), so anything stored there is *by definition* per-run. The CEO name must therefore live in a separate persisted slice, or it would be wiped on every new game. The engine stays pure and never sees the CEO name (it doesn't affect the simulation) — it's a UI/profile concern only.

## Current state (what exists today)

- Onboarding today is just `src/app/index.tsx` (`StartMenu`): a "New Game" button that calls `startNewGame()` then `router.replace('/hq')`. No name entry anywhere.
- `newGame(seed = Date.now())` in `src/game/engine.ts` builds a fresh `GameState`. No `companyName`.
- `NEW_GAME` action is `{ type: 'NEW_GAME'; seed?: number }`.
- `startNewGame(seed?: number)` in `src/state/game-store.tsx` dispatches `NEW_GAME`.
- Three entry points call `startNewGame()`:
  - `src/app/index.tsx:18` (start menu)
  - `src/app/game-over.tsx:34` (play again)
  - `src/app/(game)/settings.tsx:68` (debug "Start new game")
- `src/app/(game)/(tabs)/hq.tsx:52` renders a hardcoded `<ThemedText type="subtitle">HQ</ThemedText>`.
- Save key: `STORAGE_KEY = 'startup-tycoon/save/v1'`. Sibling slices already follow the same pattern: `WEEK_BUDGET_STORAGE_KEY`, `STREAK_STORAGE_KEY` — each loaded/persisted by its own `useEffect` in `GameProvider`. The new profile slice mirrors this exactly.
- Per `[[no-migrations-pre-release]]`: no migration code. Adding a field to `GameState` → **bump the save key** so old shapes are discarded, don't migrate.

## Implementation

Status: done — all sections below implemented, `npx vitest run` (289 tests) and `npx tsc --noEmit` both pass, `npm run sim balanced 100` verified against the new `newGame` signature.

### 1. Profile slice (CEO name) — `src/state/game-store.tsx`

- Add `export const PROFILE_STORAGE_KEY = 'startup-tycoon/profile/v1';`
- Type: `export interface PlayerProfile { ceoName: string; }`
- Add `const [profile, setProfileState] = useState<PlayerProfile | null>(null);` (null until load resolves / never-set, distinguishing "first run ever").
- In the mount `useEffect`, load `PROFILE_STORAGE_KEY` alongside the existing save/week-budget/streak reads.
- Add a persist `useEffect`: when `profile` changes and `!loading`, write it. (Guard `null` — don't write null over a stored profile.)
- Expose on `GameContextValue`:
  - `profile: PlayerProfile | null`
  - `setCeoName: (name: string) => void` — sets `{ ceoName }` and persists.
- **Do not** clear the profile in `clearSave()` — the CEO is meant to outlive individual runs. (If a "reset everything" is ever wanted, that's a separate explicit action.)

### 2. Company name on `GameState` — `src/game/types.ts` + `src/game/engine.ts`

- Add to `GameState` (near `createdWithSeed`): `/** The company name chosen at onboarding; drives the HQ header. */ companyName: string;`
- Change `newGame` signature to accept it. Use an options object to avoid positional ambiguity with the existing `seed` default:
  ```ts
  export function newGame(companyName: string, seed: number = Date.now()): GameState
  ```
  and set `companyName` in the returned object.
- Update `NEW_GAME` action → `{ type: 'NEW_GAME'; seed?: number; companyName: string }`.
- Update both `NEW_GAME` handlers to pass it through:
  - `engine.ts` `reduce()` → `newGame(action.companyName, action.seed)`
  - `game-store.tsx` `storeReducer()` → `newGame(action.companyName, action.seed)`
- Provide a sensible fallback constant (e.g. `DEFAULT_COMPANY_NAME = 'Newco'`) for callers that don't collect a name (sim script, tests).

### 3. Store `startNewGame` signature — `src/state/game-store.tsx`

- `startNewGame: (companyName: string, seed?: number) => void` → dispatches `{ type: 'NEW_GAME', companyName, seed }`.
- Update the `GameContextValue` type and the implementation.

### 4. Onboarding screen — new `src/app/onboarding.tsx`

A single route that collects the name(s) then starts the game.

- Read `{ profile, setCeoName, startNewGame }` from `useGame()`.
- Local state: `companyName` (always), `ceoName` (only when `profile?.ceoName` is missing).
- **Branch on `profile?.ceoName`:**
  - **First run (no ceoName):** two `TextInput`s — "Your name" (CEO) and "Company name". Header copy like *"Name yourself and your company."*
  - **Returning (ceoName set):** one `TextInput` — "Company name". Header greets: *"Welcome back, {ceoName}. Name your next company."*
- Validation: trim inputs; disable the confirm button until required fields are non-empty; cap length (e.g. 40 chars); fall back to `DEFAULT_COMPANY_NAME` only if somehow empty.
- On confirm:
  1. If first run: `setCeoName(ceoName.trim())`.
  2. `startNewGame(companyName.trim())`.
  3. `router.replace('/hq')`.
- Register the route: it's a top-level screen like `index`. Confirm it resolves under the root `Stack` in `src/app/_layout.tsx` (add a `Stack.Screen name="onboarding"` if screens are explicitly listed there; otherwise file-based routing picks it up).
- Style to match `index.tsx` (hero + `PrimaryButton`, `ThemedText`, `Spacing`, `useTheme`). Reuse `PrimaryButton`; use RN `TextInput` themed to `theme.text` / `theme.backgroundElement`.

### 5. Route the three "new game" entry points through onboarding

Replace the direct `startNewGame()` + `router.replace('/hq')` calls with `router.push('/onboarding')` (or `replace`):

- `src/app/index.tsx` `newGame()` → navigate to `/onboarding`.
- `src/app/game-over.tsx` play-again handler → navigate to `/onboarding`.
- `src/app/(game)/settings.tsx` debug "Start new game" → navigate to `/onboarding`.

All three land on the same screen; the returning-CEO branch means restarts ask only for the company name — satisfying "don't ask for the user name again."

### 6. Display `{companyName} HQ` — `src/app/(game)/(tabs)/hq.tsx`

- Replace `<ThemedText type="subtitle">HQ</ThemedText>` with `{state.companyName} HQ`.
- Consider surfacing the CEO too (optional, small): a "CEO: {profile?.ceoName}" line on the HQ strategy area or in Settings. Not required by the ask; include only if cheap.

### 7. Discard old saves — `src/state/game-store.tsx`

- Bump `STORAGE_KEY` from `'startup-tycoon/save/v1'` → `'startup-tycoon/save/v2'`. Old saves lack `companyName`; per `[[no-migrations-pre-release]]` we drop them rather than migrate. (Week-budget/streak keys unaffected.)

## Edge cases

- **Old in-progress save (pre-`companyName`):** discarded by the key bump; the start menu shows only "New Game", which routes through onboarding. No `undefined HQ`.
- **Empty/whitespace names:** trimmed + validated; company falls back to `DEFAULT_COMPANY_NAME`; CEO confirm gated until non-empty.
- **`clearSave()` / debug reset:** wipes the run, keeps the profile — CEO name survives, matching the "never ask again" requirement.
- **Very long names:** length cap + the HQ header should `numberOfLines={1}` / ellipsize so `{companyName} HQ` never breaks layout.

## Files touched

| File | Change |
| --- | --- |
| `src/state/game-store.tsx` | Profile slice (load/persist/expose), `startNewGame(companyName, seed?)`, bump `STORAGE_KEY` to v2 |
| `src/game/types.ts` | `companyName` on `GameState`; `companyName` on `NEW_GAME` action |
| `src/game/engine.ts` | `newGame(companyName, seed?)`; `NEW_GAME` handler passes it; `DEFAULT_COMPANY_NAME` |
| `src/app/onboarding.tsx` | **New** onboarding screen (branching on saved CEO) |
| `src/app/_layout.tsx` | Register `onboarding` route if screens are listed explicitly |
| `src/app/index.tsx` | "New Game" → `/onboarding` |
| `src/app/game-over.tsx` | Play again → `/onboarding` |
| `src/app/(game)/settings.tsx` | Debug new game → `/onboarding` |
| `src/app/(game)/(tabs)/hq.tsx` | Header → `{companyName} HQ` |
| `scripts/sim.ts` | `newGame(DEFAULT_COMPANY_NAME, seed)` |

## Tests

- Update every `newGame(...)` / `NEW_GAME` call in `src/**/__tests__` to pass a company name.
- `engine`: `newGame('Acme')` sets `companyName: 'Acme'`.
- `game-store` (`storeReducer`): `NEW_GAME` with `companyName` produces state carrying it.
- Profile persistence: `setCeoName` writes `PROFILE_STORAGE_KEY`; a new game does not clear it.
- Onboarding branch logic (if extracted to a testable helper): missing ceoName → both fields; present → company only.

Status: done, with one deliberate gap — profile persistence and onboarding branch logic live in `GameProvider`/`onboarding.tsx` (React hooks/components), and this repo's vitest config (`vitest.config.ts`) is scoped to pure-TS engine/state tests only ("no React Native test infra needed"). Added the two tests that fit that existing pattern instead: `engine.test.ts` (`newGame` sets `companyName`) and `game-store.test.ts` (`NEW_GAME` carries `companyName` through `storeReducer`). Adding RTL/hook-testing infra for the other two was out of scope for this change.

## Out of scope

- Renaming an existing company mid-run.
- Editing the CEO name after first set (could be a later Settings row).
- Any avatar / richer profile.
