# Plan: Expense breakdown — tap "Weekly burn" to see where the money goes

> Generated from: plans/expense-burn-breakdown.md
> Date: 2026-07-04

## Overview

The Money tab shows Weekly burn as a single number. This plan exposes the five components the engine already sums (`weeklyBurnFor` in `src/game/balance.ts`) via a new pure function `weeklyExpensesFor`, and surfaces them in a breakdown modal that opens when the player taps the Weekly burn `StatTile` — including a per-role payroll detail that answers "how much do all my employees cost?".

---

## Tasks

### Task 1: Tap Weekly burn → basic breakdown modal

- **Type**: AFK
- **Blocked by**: None - can start immediately
- Status: done

#### What to build

A thin end-to-end slice: engine breakdown function → tappable tile → modal listing expense lines with a total that matches the tile.

- **Engine** (`src/game/balance.ts`): add `ExpenseLine` and `ExpenseBreakdown` interfaces and `weeklyExpensesFor(state: WeeklyStatsInput): ExpenseBreakdown`, placed next to `weeklyStatsFor` and reusing the same inputs. Emit the five components of PRD §1 (team salaries, exec salaries, overhead, morale perks, hardware COGS), omitting zero lines. `total` is the sum of lines and must equal `weeklyBurnFor(...)` by construction. (Defer `payrollByRole` to Task 2 — `lines` and `total` only in this slice.)
- **UI** (`src/components/game/stat-tile.tsx`): add optional `onPress?: () => void`; when provided, tapping calls it. Tiles that don't pass it keep the built-in explainer toggle unchanged.
- **UI** (`src/app/(game)/(tabs)/money.tsx`): pass `onPress` on the Weekly burn tile to open a new burn-breakdown `Modal` following the raise/IPO modal pattern in the same file. Title "Where the money goes" + week subtitle; one `space-between` row per line (label left, `formatMoney(amount)` right); bold **Total burn** footer equal to the tile value; close button using the same dismiss idiom as the other modals. Add hint text (e.g. "Tap for breakdown") via the tile's existing `hint` prop for discoverability. Data comes from `weeklyExpensesFor(state)` alongside the existing `deriveWeeklyStats(state)` call.
- **Tests** (new `src/game/__tests__/expenses.test.ts`): `weeklyExpensesFor(state).total === weeklyStatsFor(state).burn` for base state, hardware focus (COGS + 1.4× overhead), morale lever on, hired CFO with burn-cut perk, and execs hired; zero lines omitted (no morale line when lever off, no COGS line for software focus).

#### Acceptance criteria

- [ ] `weeklyExpensesFor` exists in `src/game/balance.ts` and its `total` equals `weeklyStatsFor(state).burn` in all tested scenarios
- [ ] Zero-amount lines are omitted (morale off, non-hardware focus)
- [ ] Tapping the Weekly burn tile on the Money tab opens the breakdown modal; the tile shows a discoverability hint
- [ ] Modal lists each non-zero expense line with `formatMoney` amounts and a bold Total burn row matching the tile value
- [ ] Other StatTiles (Runway, Valuation) still toggle their explainers on tap — `onPress` is opt-in
- [ ] New expenses tests plus existing test suite pass (`npm test`)

#### User stories addressed

- Player can see where Weekly burn goes instead of one opaque number (PRD Context)
- Breakdown total is always consistent with the burn tile (PRD §1)
- The burn tile is discoverably tappable (PRD §2)

---

### Task 2: Payroll per-role detail, percent shares, and Net footer

- **Type**: AFK
- **Blocked by**: Task 1
- Status: done

#### What to build

Enrich the Task 1 slice so the modal directly answers "how much do all my employees cost?" and shows relative weight and net position.

- **Engine** (`src/game/balance.ts`): add `payrollByRole: Record<Role, number>` to `ExpenseBreakdown` (`headcount[role] × WEEKLY_SALARY[role]`); the Team salaries line subtotal stays `payrollFor(headcount)`.
- **UI** (`src/app/(game)/(tabs)/money.tsx`): under the Team salaries row, render per-role detail in small secondary text (`3 devs · $7.5K   1 sales · $2K   1 support · $1.5K`); add a percent-of-burn label to each line (no ProgressBars); add a **Net** footer row = `revenue − burn`, colored `success` green when positive and `danger` red when negative, matching the customer-flow rows' coloring.
- **Tests** (`src/game/__tests__/expenses.test.ts`): `payrollByRole` matches `headcount × WEEKLY_SALARY` per role and sums to the Team salaries line.

#### Acceptance criteria

- [ ] `payrollByRole` on `ExpenseBreakdown` matches `headcount × WEEKLY_SALARY` per role; roles with zero headcount contribute nothing to the rendered detail
- [ ] Team salaries row shows per-role breakdown in secondary text
- [ ] Each expense line shows its share of burn as a percent label
- [ ] Net row shows `revenue − burn` with success/danger coloring
- [ ] Full test suite passes (`npm test`)

#### User stories addressed

- Player can see how much all employees cost, per role (PRD Context, §2)
- Player can see each expense's share of burn and the weekly net at a glance (PRD §2)

---

## Verification (from PRD)

1. `npm test` — new expenses tests + existing suites pass.
2. Run the app (`/run` flow), open Money tab, tap **Weekly burn**: modal lists team salaries (with per-role detail after Task 2), exec salaries, overhead; total matches the tile.
3. Toggle morale lever / switch to hardware focus, re-open the modal: morale + COGS lines appear and the total still matches the tile.
4. Confirm Runway/Valuation tiles still show their explainers on tap.
