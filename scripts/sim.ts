/**
 * Headless simulation harness. Runs the pure engine to bankruptcy (or a week
 * cap) under a chosen strategy bot and prints a state table plus a summary —
 * proof the game runs, and balances, with zero UI.
 *
 *   npm run sim                    # passive bot, default seed
 *   npm run sim balanced           # balanced bot, default seed
 *   npm run sim aggressive 777     # aggressive bot, explicit seed
 *   npm run sim grower 100         # IPO-rush bot: raises every round on cooldown, sales-heavy — Task 9 IPO-reachability bot
 *   npm run sim complacent 100     # grows early, then coasts — dies in Reckoning (see Task 5)
 *   npm run sim salesheavy 100     # 30 sales / 3 devs — boom-then-bleed acceptance bot (Task 1)
 *   npm run sim devheavy 100       # 30 devs / 1 sales — quality with no lead-gen to sell it — Task 9 matrix bot
 *   npm run sim coregrinder 100    # all-in on core focus + devs — Task 2 quality/churn acceptance bot
 *   npm run sim hardware 100       # switches to hardware focus week 0 — Task 2 ARPC/burn acceptance bot
 *   npm run sim hypechaser 100     # switches to hype focus week 0 — Task 3 trend-wave acceptance bot
 *   npm run sim 12345               # passive bot, explicit seed (legacy form)
 *
 * Task 9 acceptance matrix: balanced / salesheavy / devheavy / coregrinder /
 * hypechaser / hardware, each run across several seeds. `balanced`,
 * `coregrinder`, `hardware`, and `hypechaser` all cap their ongoing sales
 * and/or dev hiring (see each bot's own comment) — uncapped versions of these
 * loops were the actual root cause of "every strategy eventually goes
 * bankrupt from pure payroll bloat once its market saturates," not an
 * underlying engine imbalance (see plan notes for the numbers).
 */

import { isStrategy, runSim, type Strategy } from './sim-core';

const arg2 = process.argv[2];
const arg3 = process.argv[3];
const strategy: Strategy = arg2 && isStrategy(arg2) ? arg2 : 'passive';
const seed = Number(arg2 && isStrategy(arg2) ? (arg3 ?? 12345) : (arg2 ?? 12345));

for (const line of runSim(strategy, seed).lines) console.log(line);
