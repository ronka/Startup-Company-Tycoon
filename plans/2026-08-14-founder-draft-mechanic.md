# The Founder Draft — brainstorm

A drafting mechanic for Startup Empire Tycoon, inspired by 82-0 / 1-T.
**It replaces C-level hiring entirely.** It is not a fourth system bolted on.

Status: **brainstorm + prototype**, nothing implemented in `src/game/`.
Prototype: `prototypes/2026-08-14-founder-draft.html` (double-click to open).

---

## 0. The framing

`src/game/clevels.ts` is already a drafting system wearing an HR costume:

| The ask | What `clevels.ts` already does |
| --- | --- |
| random cohort of recognizable tech people | `CANDIDATES_PER_OFFER = 6`, parody-name pools |
| strengths *and* weaknesses | `CLevelPerk` across 7 axes, incl. `cto-shortcut` (upside + `tradeoffMultiplier`) |
| personality / flavour | `PERSONALITIES` + `CLevelQuirk` |
| roles | `C_LEVEL_ROLES = ['cto','cmo','cfo']` |
| price spread inside one offer | `OFFER_BANDS = [scrappy, scrappy, mid, mid, elite, elite]` |
| "no strictly-worse cards" invariant | `perkPower()` / `isDominated()` + property test |

Three things are missing, and replacement supplies all three at once:

1. **Scarcity.** `HIRE_CLEVEL` (`engine.ts:617`) keeps `candidates: slot.candidates` after you hire, and `FIRE_CLEVEL` generates a **fresh** offer. A player can hire → fire → reroll the pool indefinitely for a morale hit. There is no scarcity in the current recruiting at all.
2. **Cast.** Functional execs (Ruth Poratt, Seth Godinn), not the founders who start arguments.
3. **Consequence.** No perk currently hurts you unpredictably.

**A draft is `pendingEvent`-shaped.** `tick()` already freezes the whole simulation while `state.pendingEvent` is set, and `decision-modal.tsx` / `candidate-picker.tsx` / `clevel-card.tsx` / `choice-button.tsx` all already exist. **Zero new screens.**

---

## 1. Replacement, not addition — and why it's the *smaller* change

The Team tab runs two hiring systems today: headcount steppers and C-level hiring. The draft takes over the second one completely. It does **not** sit beside it.

What actually changes in the engine:

| Today | After |
| --- | --- |
| `CLevelSlot.candidates` — a standing offer you browse any time | a **pushed** one-shot cohort, same field |
| `HIRE_CLEVEL` action fired from a bottom sheet | same action, fired from the draft modal |
| `CandidatePicker` opened by the player | **deleted** — the modal replaces it |
| `cLevelPayroll` in `weeklyBurnFor` | **unchanged** |
| `cLevelPerkMultiplierFor(cLevels, 'cto', axis)` | **unchanged** — perk axes are untouched |
| `FIRE_CLEVEL` → regenerates a fresh offer | seat sits **empty** until the next cohort |

Three seats stay three seats. The perk axes stay exactly as they are. `balance.ts` needs no new multiplier slots. **Replacement is a smaller diff than adding a parallel system would have been** — and it deletes a screen rather than adding one.

> An earlier draft of this doc argued for splitting perk axes "by layer" so drafted founders wouldn't collide with C-levels. Replacement dissolves that problem — there is nothing left to collide with. Ignore it; founders use the existing axes directly.

**One thing to decide separately:** the original ask mentioned CEO / CTO / CPO / Growth. That doesn't match `C_LEVEL_ROLES` (`cto`/`cmo`/`cfo`), and renaming or adding a seat means touching `PERK_TABLE` and every `cLevelPerkMultiplierFor` call site. Keep three seats as-is for v1 and price the rename as its own piece of work — don't ship `cmo` labelled "Growth."

---

## 2. Where it appears in the loop

A blocking modal on a slow cadence, separate from the event deck.

The event deck draws every 2–4 weeks (`drawCadenceWeeks`); runs last ~60–80 weeks (Boom 25–35, Reckoning 55–70), so a run sees ~20–30 cards. A draft riding that cadence becomes just another card. **Target: 4–5 per run** — `weeksUntilNextDraft`, interval **12–18**, mirroring `weeksUntilNextEvent`.

**The first cohort must land at week ~4.** Today a player can hire a CTO at week 0. If the draft is the *only* route to leadership, a week-9 first draft leaves a dead opening the player can't influence. Week 4 keeps the run moving. (The prototype uses exactly this and it feels right.)

---

## 3. What the player is choosing

**Three people. Take one. The other two are gone.**

Three, not six — six is a shopping list you optimise, three is a decision you remember.

Each carries a **seat** (CTO/CMO/CFO) and a **cost shape**, and a cohort always spans all three shapes:

| Shape | Cash | Equity | The pitch |
| --- | --- | --- | --- |
| **Hired gun** | $12–18k/wk | 2–3% of your stake | "Pay me. I don't want a piece." |
| **Operator** | $7–10k/wk | 6–10% | The balanced middle. |
| **True believer** | $1.5–2.5k/wk | 17–21% | "I'll work for nothing. I want a slice." |

This is the mechanic. Every cohort asks **which resource can I spare right now — runway, or my exit?** And the honest answer moves with your cash position, your stage, and how close the next round is.

The card shows five lines and no more:

```
   CFO                                   TRUE BELIEVER — WANTS A SLICE
   Sam Altmann
   "Always be raising."
   ▲ −40% round dilution, +25% valuation multiple
   Cash: $2,500/wk · burn $41,200 → $43,700   Runway: 14 wks → 13 wks
   Equity: 20% of your stake = 20.0 points · you go 100.0% → 80.0%
```

---

## 4. How they affect the startup

Passive multipliers on the axes `balance.ts` **already threads**, via the seat they occupy — `cto-productivity`, `cto-techDebt`, `cmo-hypeGain`, `cmo-hypeDecay`, `cfo-burnCut`, `cfo-roundTerms`. Two additions worth one argument each: conversion/churn in `advanceMarket`, and a valuation multiple in `valuationFor`.

**Equity cost is a share of your *remaining* stake, not flat points.** This is load-bearing, and the prototype proved it. Score is `equity × valuation`: a flat cost *subtracts* while perks *multiply* and compound over 60+ weeks. A flat 2.5-point card breaks even at a **+2.6% uplift** — every card clears that trivially, so taking someone is always correct and there is no draft.

| Cost | Uplift needed to break even |
| --- | --- |
| flat 2.5 points off 100% | **+2.6%** — auto-take, no decision |
| 7% of remaining stake | **+7.5%** |
| 20% of remaining stake | **+25%** — only a real marquee clears this |

Every card carries a legible threshold, and the prototype prints it. It also makes costs compound naturally: with funding rounds diluting you 20% a time, a 20% card at week 55 is the same proportional bite out of a much scarcer supply.

---

## 5. Permanent seats, or collectible modifiers?

**Permanent seats — three of them, exactly as today.**

This reverses the recommendation an earlier version of this doc made, and the prototype is why. The standard objection to seats is that once all three are full, late cohorts are dead cards — only ever "marginal upgrade?", the least interesting question in the genre.

**Sunk equity kills that objection.** Replacing a seated founder means:

- the equity you already gave the incumbent **does not come back** — you paid 20% of your stake for someone who is now gone;
- the new person costs their own share of what's left, *on top*;
- the team takes a morale hit (`C_LEVEL_DEPARTURE_MORALE_HIT` already exists).

So a late cohort asks a genuinely hard question: *is this person enough better to be worth paying twice?* The sweep says the answer is often yes and sometimes no — which is the definition of a live decision. §9 has the numbers.

It's also thematically exact. You don't claw back founder equity. The co-founder who left with their shares is the most recognizable story in the industry.

**Firing without replacing is now a real cost.** With no standing offer to fall back on, the seat sits empty until a cohort happens to walk in — up to 18 weeks with no CTO. The old pull-based system had no such cost; you could fire and rehire the same week.

---

## 6. What makes the choice hard

1. **Two currencies, and you're short of a different one at different times.** The gun/operator/believer spread means there's rarely a card that's cheap in both.
2. **Equity compounds and is the score.** Every signing is permanent and every replacement is paid for twice.
3. **You don't know what's coming.** Save the CTO seat for a possible Jensen Wong at week 40, or take the solid one now?
4. **Timing changes value.** A hype founder is worth far more in Boom than Reckoning; a burn-cutter is worth more at 6 weeks runway than right after a raise. The eras and trend waves already in the engine do this for free.

**The non-dominance invariant must carry over.** `perkPower()` / `isDominated()` exist so no card is strictly worse than a peer. Extend the property test to the founder pool — it's the guardrail that keeps 18 hand-written people from silently producing dead cards.

---

## 7. Why you'd ever take the disaster

**Chaos buys raw power per unit of cost.** A chaos founder is the best deal in the cohort on paper and carries a weekly chance of firing an event. Same structure as the existing `cto-shortcut` perk (better productivity, worse tech debt), with the cost moved from a guaranteed multiplier to a random draw.

Three things make it tempting rather than a trap:

- **The die can roll good.** Muskk posts through it: sometimes hype ×1.8, sometimes ×0.5 and the customers leave. A coin skewed bad is a gamble; a coin that's always bad is just a worse card.
- **Chaos is a late-run rescue.** At 5 weeks runway in week 55, a 40%-swing gamble is strictly correct. Nothing else in the game fills the "I need variance" role.
- **The story is the reward.** "I made Bess Holmzz my CMO at week 12 and IPO'd anyway" is the run people describe to someone else.

Ladder: **0** clean · **1** ~4%/wk · **2** ~7%/wk · **3** ~10%/wk, run-defining, with numbers to match.

---

## 8. Keeping it immediately understandable

- **One sentence on the modal:** *"Take one. The other two walk. Some want cash, some want a piece of you."*
- **Show the consequence, not the input** — runway before/after and stake before/after, on every card. Never make the player do arithmetic.
- **Reuse the decision-modal chrome exactly.** Players already know a blocking card with choice buttons.
- **Never more than five lines per person.**
- The Leadership section on the Team tab stays where it is and keeps `clevel-card.tsx`; it just shows who you drafted, and "Empty — wait for a cohort" instead of a browse button.

---

## 9. What the prototype found

Eight blind strategies, six seeds, 80 weeks. Median founder take-home:

| Strategy | Median | |
| --- | --- | --- |
| Fill seats, then replace only on a clear upgrade | **$180.8M** | the skilled line |
| Fill seats, never replace | $111.9M | |
| Always take the operator | $69.1M | |
| Always take the hired gun | $57.5M | |
| Always take the true believer | $57.0M | |
| Switch on runway (<14 wks → believer) | $53.6M | |
| Pass on everyone | $46.8M | |
| Always take the chaos pick | $26.4M | wild variance, $6M–$235M |

Four findings:

1. **Seats are not dead late.** Replacing on upgrades beats never-replacing by **62%**. Sunk equity plus a morale hit prices replacement high enough to hurt and low enough to be worth doing. This was the open question and the answer is clean.
2. **The two currencies are balanced.** Gun $57.5M vs believer $57.0M — dead level, with the operator middle mildly ahead. Neither cash nor equity is the dominant currency. (Getting there took raising believer stakes to 17–21%; at 13–17% equity was clearly the cheaper currency.)
3. **Skill ordering is correct.** Selective > blind-fill > mono-shape > passing > chaos-always. The mechanic rewards judgment rather than a memorized rule.
4. **Salary scale is dangerous and needs care in the real engine.** The first pass gave hired guns $21–30k/wk salaries — against `STARTING_CASH = 250_000` that bankrupted the run at week 9–11 on **five of six seeds**. That's a trap, not tension. $12–18k/wk is survivable-but-tight early. Whatever the real numbers, check the early-game runway explicitly.

**One thing not proven.** A naive runway-switching rule ($53.6M) *underperformed* both mono-shape strategies. So the cost-shape mix is balanced in aggregate, but I have not demonstrated that a simple timing heuristic beats just picking a lane. Either my heuristic is bad or the timing signal is weaker than §6.4 claims — worth watching when you play it.

All of this comes from a deliberately crude fake economy. Treat the **rankings** as signal and the **absolute numbers** as noise. The one finding that transfers regardless is the break-even arithmetic in §4, which follows from the shape of `scoreFor`, not from any tuning.

---

## 10. The variant ladder

### V0 — Reskin only (half a day, zero new state)
Make `HIRE_CLEVEL` clear the rest of the offer (`candidates: []`) so picking one burns the cohort. Add founder names and a chaos axis to `PERK_TABLE`. Still pull-based and salary-only, but it tests whether one-shot cohorts feel good at all. **Worth shipping first regardless.**

### V1 — Full replacement ★ recommended, and what's prototyped
Cohort of 3 pushed on a 12–18 week timer from week 4, spanning gun / operator / believer, filling the existing three seats, priced in salary **and** a share of remaining equity, with sunk equity on replacement and empty seats after a firing. `CandidatePicker` is deleted.

New state: `pendingDraft`, `weeksUntilNextDraft`, and a `stake` field on the candidate type. `CLevels` itself is unchanged.

### V1.5 — The one that got away
The two you pass on join a rival and buff their `productQuality` / `marketShare`. Cheap (rivals already have the stats), makes the news log sing — *"Adam Newmann joins Bitwarp"* — but can read as punitive. **The prototype has a toggle; decide by feel.**

### V2 — Factions and synergies
Named sets ("the Paypall Mafia", "the Foogle diaspora") paying off when you collect two. Maximum replayability, and where lightweight stops being lightweight: pairwise interactions can't be checked by the `isDominated` property test. **Deliberately cut.** Revisit after V1 ships.

---

## 11. Names — follow the repo, not the prompt

Every name in `clevels.ts` is deliberately misspelled: `Linus Torvold`, `Jensen Wong`, `Kylie Jennerr`, `ex-Foogle`, `ex-ClosedAI`. Match it; the prototype does.

One call to make deliberately: **Holmes and SBF are convicted individuals, and this app is live on the App Store.** Attaching real convicted people to a fraud mechanic is materially different from `Kylie Jennerr` having a marketing perk. Options: (a) keep the parody names, (b) swap in fully fictional archetypes ("the Turtleneck", "the Altruist") who play identically. Decide it rather than defaulting into it.

---

## 12. Open questions

- **Seat rename** (CEO/CPO/Growth) — priced separately, see §1.
- **Can you decline into an empty board?** Currently yes: pass on all three at week 4 and run with no leadership. Fine, but confirm it isn't a newbie trap.
- **Does a cohort ever offer two people for the same seat?** The prototype prefers distinct seats. An all-CTO cohort would be a sharp "which kind of CTO" question — worth trying.
- **Save shape.** This changes `GameState`. The `no-migrations-pre-release` note in my memory is now **stale** — the app is live, so a save-key bump discards real players' runs. Needs a real migration or a deliberate wipe decision.
