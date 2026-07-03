# Startup Tycoon — MVP Design

*Football Manager, but you run a high-tech startup.*

A single-player, turn-based management game. You found a company, make weekly decisions
(hiring, fundraising, responding to market events), and try to reach the best possible
exit — IPO or acquisition — before you run out of cash.

Built in this repo: Expo 57 + React Native, expo-router, gluestack-ui v5, TypeScript.
Phone-first UI, also runs on web.

---

## 1. Core Loop

```
┌─► Review dashboard (cash, runway, valuation, news feed)
│      │
│   Make decisions (hire/fire, raise money, answer event cards)
│      │
│   Tap "Next Week"  ──►  sim ticks one week
│      │
│   Sometimes: an EVENT CARD interrupts and demands a choice
│      │
└──────┘   ...until IPO, acquisition, or bankruptcy → score screen
```

- **Time**: 1 turn = 1 week. A typical run is ~150–400 weeks (3–8 years), 15–30 real minutes.
- **Game over**: bankruptcy (cash below zero and can't raise), accepted acquisition, or IPO.
- **Score**: founder's equity % × exit valuation. Bankruptcy scores 0.

## 2. Game State (the whole model)

One serializable `GameState` object:

| Group | Fields |
|---|---|
| Clock | `week`, `era` (see §4), `stage` (Garage → Seed → Series A → Growth → Exit) |
| Money | `cash`, `weeklyRevenue`, `weeklyBurn`, `valuation`, `founderEquity` |
| Product | `productQuality` (0–100), `techDebt` (0–100) |
| Market | `marketShare` (you + rivals sum to ≤100), `hype` (global multiplier, 0.5–2.5) |
| Team | `headcount` per role (devs, sales, support), `morale` (0–100), hired `cLevels` |
| Rivals | 2 named rivals: `productQuality`, `marketShare` each |
| Decks | remaining event cards per era, active timed effects |
| RNG | seed + counter (deterministic, testable, save-safe) |

### Team model
- **Rank-and-file are numbers, not people.** "Hire 3 devs" is a stepper, not a scouting screen.
  Roles for MVP: **Developers** (build product), **Sales** (convert quality into revenue),
  **Support** (slow churn / protect market share).
- **C-levels are named individuals.** Slots: CTO, CMO, CFO. Each open slot offers 2–3
  generated candidates (name + one-line personality + salary + one passive perk, e.g.
  *CTO "Dana Levi": dev productivity +15%*). Hiring/firing a C-level is a real decision
  with a morale ripple.

### Weekly tick (the entire economy, in order)

```
devEffort   = devs × moraleFactor × ctoBonus
productQuality += devEffort − decay − techDebtDrag
revenue     = productQuality × marketShare × hype × salesFactor
cash       += revenue − payroll − fixedBurn
morale      = drift toward baseline; layoffs/crunch/events push it
marketShare = shifts by (yourQuality − rivalQuality) gap, small steps
valuation   = revenue × industryMultiple × hype     (user-count proxy pre-revenue)
rivals      = scripted slow growth + event-driven jumps
```

Every formula is a pure function in one balance file. No hidden systems.

## 3. Decisions the Player Makes

| Decision | Where | Effect |
|---|---|---|
| Hire / fire per role (±N) | Team screen | payroll, devEffort; **firing hits morale hard** and briefly spikes hype-neutral "runway relief" |
| Hire / replace C-levels | Team screen | perks, salary, morale ripple |
| Raise a funding round | Money screen | cash injection, dilution; terms scale with valuation & hype |
| Accept / reject acquisition offers | Event card | ends game at offer price |
| File for IPO | Money screen (unlocked at revenue + stage threshold) | ends game at valuation × hype |
| Answer event cards | Event modal | varied |

**Layoffs are the signature tension** (per the original pitch): firing 10 devs saves
runway *now* but tanks morale → productivity → quality → valuation over the next weeks.
The valuation chart should visibly dip after layoffs.

## 4. Timeline: Eras & the Event Deck

The run moves through three **eras**, each with its own authored card deck. Every 2–4
weeks one card is drawn from the current era's deck.

| Era | Trigger | Flavor of cards |
|---|---|---|
| **Scrappy** (start) | week 0 | seed offers, first customer, co-founder drama, tech-debt shortcuts |
| **Boom** | first priced round OR week 60 | **AI hype wave**, rival raises mega-round, poaching attempts, acquisition feelers |
| **Reckoning** | valuation > threshold OR week 160 | market crash, regulation, IPO window opens/closes, serious acquisition offers |

Card types:
1. **News** — auto-applied effect, shows in feed (*"AI hype wave: hype +40% for 8 weeks"*).
2. **Decision** — modal with 2–3 choices (*"Rival offers to buy you for 2.1× valuation — sell / counter / refuse"*).
3. **Timed effects** — cards can attach modifiers with a countdown (hype waves, morale slumps).

**MVP content target: ~30 cards total** (10 per era). Cards are plain data objects —
adding content never touches engine code.

## 5. Funding & Exit

- **Rounds**: Seed → A → B. Player initiates from the Money screen; terms
  (amount, dilution) are computed from current valuation × hype. Low runway (<8 weeks)
  triggers worse "bridge" terms. Each round advances `stage` and unlocks the next era's pressure.
- **Cap table is one number**: `founderEquity`, reduced per round. No investor management in MVP.
- **Acquisition**: arrives as event cards; frequency/price scale with valuation and hype. Accepting ends the run.
- **IPO**: unlocked at Growth stage + revenue threshold + open "IPO window" (era condition).
  Ends the run at `valuation × hypeAtListing`.

## 6. UI — 4 tabs + 2 modals (gluestack-ui, expo-router tabs)

| Screen | Contents |
|---|---|
| **HQ** (dashboard) | valuation sparkline, cash / runway / revenue / morale stat tiles, news feed, big **Next Week** button (always visible) |
| **Team** | steppers per role ("Devs 12 [−][+]"), morale bar, 3 C-level cards (filled or "Hire" with candidate picker) |
| **Money** | cash & burn chart, runway countdown, founder equity %, **Raise Round** / **IPO** buttons with computed terms |
| **Market** | market-share bars (you vs 2 rivals), hype meter, era timeline showing where you are |
| Event modal | card art-free: title, flavor text, 2–3 choice buttons with visible effects |
| Game-over screen | outcome, score, run stats, "New Game" |

Design bar: clean stat tiles and steppers, no drag-and-drop, no charts library beyond a
simple SVG sparkline (`react-native-svg` is already installed).

## 7. Architecture

```
src/game/            ← pure TypeScript, ZERO React imports, fully unit-testable
  types.ts           GameState, EventCard, CLevel, ...
  engine.ts          tick(state, decisions) → state ; applyChoice(state, card, choice)
  balance.ts         every tunable constant & formula in one file
  events/            era decks as plain data (scrappy.ts, boom.ts, reckoning.ts)
  clevels.ts         candidate generator (name pools + perk table)
  rng.ts             seeded deterministic RNG
  score.ts           end-state detection + scoring

src/state/
  game-store.tsx     React context + useReducer wrapping the engine; save/load

src/app/(game)/     expo-router tab screens: hq, team, money, market
src/app/game-over.tsx
```

- **Engine is a pure reducer**: `(GameState, Action) → GameState`. UI dispatches actions;
  "Next Week" dispatches `TICK`. This makes the whole game testable without rendering.
- **Persistence**: single autosave slot, JSON via AsyncStorage
  (add `@react-native-async-storage/async-storage` — the only new dependency).
- **Determinism**: seeded RNG stored in state → same seed replays identically; balance
  tests can simulate 400 weeks in a loop.

## 8. Testing

- Unit tests on the engine: tick math, event application, funding dilution, end-state detection.
- **Balance harness**: script that auto-plays N runs with simple strategies
  ("never hire", "hire aggressively", "always take funding") and asserts sane outcomes
  (e.g. default strategy survives ≥ 40 weeks; no strategy prints infinite money).

## 9. Build Order (milestones, each independently playable/testable)

1. **Engine skeleton** — types, balance, tick loop, seeded RNG; console-playable via a test script.
2. **HQ screen + Next Week** — dashboard wired to the store; the game "runs" end to end with no decisions.
3. **Team screen** — role steppers, morale, layoff consequences; C-level candidates & perks.
4. **Money screen** — funding rounds, dilution, runway pressure, bankruptcy end state.
5. **Event system** — deck drawing, news feed, decision modal, timed effects; author Scrappy deck.
6. **Market & rivals** — rival model, market-share shifts, Market screen; author Boom + Reckoning decks.
7. **Exits & scoring** — acquisition cards, IPO flow, game-over screen, autosave/resume.
8. **Balance & polish pass** — run the balance harness, tune `balance.ts`, empty states, haptics/animation sprinkles.

## 10. Explicitly Out of Scope (MVP)

- Individual non-C-level employees, skills, or scouting
- Multiple products / product pivots
- Detailed cap table, board seats, investor personalities
- Marketing campaigns, PR management, office/perk management
- Multiplayer, leaderboards, cloud saves
- Difficulty modes, scenario editor, mod support

Everything above has an obvious hook to add later (e.g. events are data; roles are a table),
but none of it blocks shipping the MVP.
