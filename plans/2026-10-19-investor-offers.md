# Investor offers: fundraising as a choice

**Status:** implemented 2026-10-19 (uncommitted). The open questions were settled with the recommended answers.

## What changed from this plan during implementation

- **Rounds go Seed → Series A–G** (8 rounds), not just A/B. Series B and later all count as Growth stage. Series C onward only get term sheets once valuation clears `ROUND_MIN_VALUATION` (C $400K … G $4M). Rival growth from raising is capped at the first 3 rounds (`RIVAL_GROWTH_ROUNDS_CAP`).
- **Offers come from their own RNG stream** (`offerSeedFor`: run seed × week × round), not `GameState.rng`, so dealing never shifts any other system's draws. Sim snapshots still moved, because bots now pick between offers and live longer on late-round money.
- **Liquidity is "the table refills when empty"**. An open round with no live offers deals 2 at once. With runway under the bridge threshold, every new offer is priced as a bridge and Vulture Partners joins the pool. There's no separate lifeline step.
- **Follow-up cards:** *Uncle Marty Has Notes* and *Foogle Makes Its Move* (an acquisition offer) in the Boom deck, and *SoftBanc Wants Its Growth* in the Reckoning deck. Their flags live in `src/game/investor-flags.ts`.
- **UI:** the Money tab's action card shows "Seed: 2 term sheets · names" with a **Review** button. `TermSheetsSheet` lists the offers with Pass/Take and a confirm step.
- Not done: the "offer expires this week" push notification.

## The idea

Today the Money tab has one **Raise** button. It sells a computed slice of the company for a computed amount (`roundTermsFor` in `src/game/balance.ts`). You can't choose who you raise from or what the terms are. The only decision is *when*.

After this change, each round (Seed, Series A, Series B) is a **choice between term sheets from named investors**:

- Offers **arrive over time**, not all at once. A new one may land on any week while the round is open.
- Each offer **expires**. You can wait for a better one, but the one you have might be gone.
- You can **pass** on any offer, or ignore it until it expires.
- Taking an offer **closes the round**, just like pressing Raise does today. Stage advances, the cooldown starts, and every other offer for that round is withdrawn.
- Investors differ in **amount vs. equity**, plus a **string** attached: hype from a brand-name fund, a morale cost from a pushy board, or a story flag that unlocks a follow-up card later.

Example seed table: *Grandma's savings* gives $40k for 0% (and you'll hear about it at every Sunday dinner). *Y Combinatorr* gives $500k for 7% plus a hype bump. *Andreessen Horrowitz* gives $900k for 20%, a big hype bump, and a board seat.

## Investor roster (`src/game/investors.ts`, new, pure)

Names follow the **clevels.ts convention**: lightly altered parody names, nobody with a criminal conviction, and existing spellings reused (Foogle, Macrosoft). This is *not* the verbatim-names convention of `clevel-draws.ts`.

Each investor is a template:

```ts
interface InvestorTemplate {
  id: string;                    // 'grandma', 'ycombinatorr', 'a16zz'…
  name: string;                  // 'Andreessen Horrowitz'
  kind: 'family' | 'angel' | 'accelerator' | 'vc' | 'tier1-vc' | 'corporate' | 'megafund' | 'crowd';
  rounds: RoundType[];           // which rounds they show up for
  amountMultiplier: number;      // × base round amount
  dilutionMultiplier: number;    // × base round dilution (0 for grandma)
  minValuation?: number;         // tier-1 funds only chase traction
  eras?: Era[];                  // e.g. megafunds only in boom
  string?: OfferString;          // hype / morale / storyFlag side-effect on accept
  pitch: string;                 // one-line flavour, same tone as C-level flavour
}
```

Draft roster (balance numbers get tuned in the sim pass):

| Round | Investor | Amount | Equity | String |
|---|---|---|---|---|
| Seed | Grandma's Savings Jar | tiny, flat ~$40k | **0%** | morale +3 ("she believes in you") |
| Seed | Uncle Marty's "Investment" | small | 5% | storyFlag `uncle-investor`, gates a later meddling card |
| Seed | Kickstartr campaign | small | 0% | hype +, only if hype ≥ 1.1 |
| Seed | Naval Ravikantt (angel) | modest | 8% | small hype + |
| Seed | Y Combinatorr | fixed ~$500k | 7% | hype + (demo day) |
| Seed | Techstarz | ~$120k | 6% | none |
| Seed | First Round Capitol | base | base | none |
| Seed | Andreessen Horrowitz | large | heavy | big hype +, morale −2 (board seat) |
| A | Sequoya Capital | large | base | hype +, needs valuation floor |
| A | Benchmarc | base | lower | none (founder-friendly) |
| A | Accell / Lightspeedd / Index Venturez | base ± jitter | base ± jitter | none (the "normal" offers) |
| A | Foogle Ventures (corporate) | base | lower | storyFlag `strategic-investor`, gates an acquisition-pressure card |
| A | Tiger Globall | large, fast | high | expires in 1 week |
| B | SoftBanc Vision Fund | huge | very heavy | hype ++, morale −5, boom only |
| B | Thrive Capitol / General Atlantik | large | base | none |
| B | Founders Fundd | base | lower | needs high product quality |
| Any (lifeline) | Vulture Partners LLC | bridge-sized | bridge × 1.2 | morale −3 |

## Engine design (`src/game/`)

### State

```ts
interface FundingOffer {
  id: string;             // `${investorId}-w${week}`
  investorId: string;
  round: RoundType;
  amount: number;         // locked at arrival
  dilution: number;       // locked at arrival, before accept-time discounts
  arrivedWeek: number;
  expiresWeek: number;
  isBridge: boolean;
}

// GameState
fundingOffers?: FundingOffer[];   // optional; undefined === []
```

### What's fixed at arrival and what applies on accept

- **Fixed when the offer arrives:** base `roundTermsFor(round, valuation, hype, runway, era)` × the investor's multipliers, clamped to `MAX_DILUTION_PER_ROUND`. The bridge and era climate are captured here. It's an exploding term sheet: what you see is what you sign.
- **Applied when you accept:** the CFO `cfo-roundTerms` perk and the one-time `CLEAN_RAISE_TERMS_FLAG` discount, applied on top of the locked dilution. Hiring a CFO after a good offer lands still pays off. The Money tab shows the post-discount number.
- `roundTermsFor` stays as the base function, so era, bridge, max-dilution and cooldown all keep working.

### Arrival (inside `tick`, seeded RNG only)

Each tick, while a round is open (a round remains, cooldown is clear, game isn't over):

1. Drop expired offers and log an `expired` entry for analytics.
2. **Opening guarantee:** on the first open week of a round, deal 2 offers. For Seed, one of them is always from the family/angel shelf, so the "zero equity vs. big VC" choice is visible right away.
3. **Lifeline guarantee:** if runway < `BRIDGE_RUNWAY_THRESHOLD_WEEKS` and no offer on the table is still live, deal a lifeline offer (Vulture Partners, or any eligible bridge-terms investor). No one can go bankrupt waiting on luck when today they could have pressed Raise.
4. Otherwise roll `OFFER_ARRIVAL_CHANCE[era]` (e.g. scrappy 0.35 / boom 0.55 / reckoning 0.2) to add one more offer, up to `MAX_OPEN_OFFERS = 3`.
5. Which investor shows up is a weighted pick from the templates that fit the round, era and valuation floor and aren't already on the table. Strong traction (valuation, hype) tilts the weights toward tier-1 funds.
6. Expiry: `arrivedWeek + randInt(2, 4)`. Tiger Globall gets 1 week, Grandma never expires.

This adds RNG draws to every tick, which **shifts every later draw**. Seeded tests that assert exact numbers, and sim baselines, will move. That's expected. Re-baseline them in the same change, and don't treat it as a regression.

### Actions

- `{ type: 'ACCEPT_FUNDING_OFFER'; offerId }` replaces `RAISE_ROUND`. Same effects as today (cash, dilution, `roundsRaised`, stage, `lastRoundRaisedWeek`, consumes the clean-terms flag, news entry naming the investor), plus applying the offer's string, plus clearing all offers. **It must never draw a card**, because the store's review-ask arming relies on that (see `game-store.tsx` around line 250).
- `{ type: 'DECLINE_FUNDING_OFFER'; offerId }` removes one offer. No other penalty in v1.
- `RAISE_ROUND` is removed from the union. Every caller listed below moves to the new actions.

## Every place that changes

| File | Change |
|---|---|
| `src/game/types.ts` | `FundingOffer`, `fundingOffers?`, new actions, remove `RAISE_ROUND` |
| `src/game/investors.ts` (new) | roster, weighted pick, `offerTermsFor` |
| `src/game/balance.ts` | arrival chances, `MAX_OPEN_OFFERS`, expiry range; keep `roundTermsFor` |
| `src/game/engine.ts` | offer generation in `tick`; accept/decline reducers |
| `src/game/events/standup.ts` + test | clean-terms reward copy says "your next accepted offer" |
| `src/game/events/scrappy.ts` | `scrappy-investor-interest` stays as news; check its copy doesn't contradict offers |
| `src/game/events/*` | 2–3 follow-up cards gated on the new story flags (Uncle Marty meddles, Foogle wants to buy you, SoftBanc demands hypergrowth) |
| `src/app/(game)/(tabs)/money.tsx` | Raise card becomes an **Offers** list: investor name, pitch, amount, equity %, string chip, "expires in N wk", **Take** / **Pass**. Confirm sheet keeps the equity before/after and stake copy. Empty state: "No term sheets yet. Traction attracts investors." Cooldown state unchanged. |
| `src/state/day-close.ts` `raiseAvailable` | true when **an offer is on the table**, not when the cooldown is clear |
| `src/lib/recommended-action.ts` | same switch; label "Review a term sheet" |
| `src/state/notification-content.ts` | uses `raiseAvailable`, so it follows along; optionally "an offer expires this week" |
| `src/lib/guide.ts` | `raise` target points at the first offer row; check Money unlock (guided run) always has an offer, via the opening guarantee |
| `src/state/game-store.tsx` | `captureAction` for the new actions; review ask arms on accept for A/B |
| `src/analytics/events.ts` | `funding_offer_received`, `funding_offer_accepted` (round, investor_id, amount, dilution, is_bridge), `funding_offer_declined`, `funding_offer_expired`. Keep `funding_round_raised` firing on accept so existing PostHog funnels don't break. |
| `src/app/(game)/help.tsx` | rewrite the raising section |
| `scripts/sim-core.ts` | bots get a policy: `balanced` takes the best stake-adjusted offer once runway < 10; `aggressive` holds out for the least dilution until runway < 3; `grower` takes the biggest cash offer the moment one lands |
| `src/game/__tests__/funding.test.ts` | rewrite around offers (below) |

## Tests (vitest, `src/game/__tests__/`)

- Opening guarantee: a round opening deals ≥ 2 offers; seed always includes a family/angel offer.
- Lifeline: runway under the threshold with nothing live always yields an offer.
- Expiry drops offers; `MAX_OPEN_OFFERS` is respected; no duplicate investors on the table.
- Accept: cash, equity, stage, cooldown, offers cleared, string applied, clean-terms consumed, CFO discount applied at accept.
- Grandma: 0% dilution leaves `founderEquity` unchanged but still advances stage.
- Decline removes only that offer. Accepting a stale or unknown id is a no-op.
- Determinism: same seed + same actions → same offers.
- `grep -r "react" src/game/` is still empty.

## Balance check (`pnpm sim`)

- Compare the bots' bankruptcy rate, IPO rate and median founder stake against current `main` across ~200 seeds.
- Specifically check that **always taking Grandma for seed** isn't the dominant line. Taking her money spends your seed round on ~$40k. If it wins anyway, shrink the amount or make it not advance the stage (see question 2).
- Check that Reckoning still feels starved (fewer offers, worse terms) and Boom feels flush.

## Rollout

Ships as an OTA (pure JS, no native change). Bump `UPDATE_VERSION`. Per AGENTS.md, ask before running `eas update`.

## Open questions for you

1. **Live saves.** Players mid-run will load a save without `fundingOffers`. Recommendation: treat missing as `[]`. If their round is already open, the next tick fires the opening guarantee and they see offers right away. No migration code, no wipe. OK?
2. **Does a 0%-equity offer (Grandma) close the round?** Recommendation: yes. It's one of the seed options, so taking it uses up Seed and moves you to Seed stage, and the sim checks it isn't dominant. Alternative: family money is a side top-up that doesn't use up the round.
3. **Passing on an investor.** v1 has no penalty. Want a twist instead, like a fund you pass on never comes back for later rounds?
4. **Roster.** Are you happy with the names above, or do you want specific firms added or dropped?
