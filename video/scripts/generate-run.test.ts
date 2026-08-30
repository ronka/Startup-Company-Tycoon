/**
 * TEMPORARY generator (deleted after running): drives the real engine for a
 * scripted run and dumps a per-week snapshot to `video/src/data/run.json`, so
 * the marketing video's HUD/HQ/Team/Market numbers are one consistent session
 * rather than hand-authored mockups.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { acquisitionOfferValuationFor, weeklyStatsFor } from '../balance';
import type { EventEffects, EventStat, StatDelta } from '../events/types';
import { newGame, reduce } from '../engine';
import { isIpoEligible } from '../score';
import type { GameState, Role } from '../types';

const MAX_WEEKS = 160;

// Mirrors `decision-modal.tsx`'s consequence summary, so the card rendered in
// the video shows the same right-hand text the app does.
const STAT_LABEL: Record<EventStat, string> = {
  cash: 'cash',
  morale: 'morale',
  hype: 'hype',
  productQuality: 'product quality',
  marketShare: 'market share',
};

function formatDelta(delta: StatDelta): string {
  const sign = delta.amount >= 0 ? '+' : '';
  if (delta.stat === 'hype' || delta.stat === 'marketShare') {
    return `${sign}${Math.round(delta.amount * 100)}% ${STAT_LABEL[delta.stat]}`;
  }
  if (delta.stat === 'cash') {
    const abs = Math.abs(delta.amount);
    const money =
      abs >= 1_000_000
        ? `$${(abs / 1e6).toFixed(1)}M`
        : abs >= 10_000
          ? `$${Math.round(abs / 1e3)}K`
          : abs >= 1_000
            ? `$${(abs / 1e3).toFixed(1)}K`
            : `$${Math.round(abs)}`;
    return `${sign}${delta.amount < 0 ? '-' : ''}${money} cash`;
  }
  return `${sign}${delta.amount} ${STAT_LABEL[delta.stat]}`;
}

function summarizeEffects(effects: EventEffects, valuation: number): string {
  if (effects.acquisitionOffer) {
    const offer = acquisitionOfferValuationFor(valuation, effects.acquisitionOffer.valuationMultiplier);
    const money = offer >= 1_000_000 ? `$${(offer / 1e6).toFixed(1)}M` : `$${Math.round(offer / 1e3)}K`;
    return `Ends the run — acquired for ~${money}`;
  }
  const parts = (effects.deltas ?? []).map(formatDelta);
  if (effects.timedEffect) {
    const { stat, multiplier, weeksLeft } = effects.timedEffect;
    const pct = Math.round((multiplier - 1) * 100);
    parts.push(`${pct >= 0 ? '+' : ''}${pct}% ${STAT_LABEL[stat]} for ${weeksLeft}wk`);
  }
  return parts.length ? parts.join(', ') : 'No effect';
}

function snapshot(state: GameState) {
  const stats = weeklyStatsFor(state);
  return {
    week: state.week,
    cash: state.cash,
    runway: Number.isFinite(stats.runway) ? stats.runway : null,
    customers: state.customers,
    marketCustomers: state.marketCustomers,
    marketShare: state.marketShare,
    valuation: stats.valuation,
    revenue: stats.revenue,
    burn: stats.burn,
    morale: state.morale,
    hype: state.hype,
    productQuality: state.productQuality,
    headcount: { ...state.headcount },
    stage: state.stage,
    era: state.era,
    focus: state.focus,
    founderEquity: state.founderEquity,
    roundsRaised: state.roundsRaised,
    moraleLeverActive: state.moraleLeverActive,
    trend: { id: state.trend.id, phase: state.trend.phase, weeksInPhase: state.trend.weeksInPhase },
    rivals: state.rivals.map((r) => ({ ...r })),
    cLevels: {
      cto: state.cLevels.cto.hired,
      cmo: state.cLevels.cmo.hired,
      cfo: state.cLevels.cfo.hired,
    },
    news: state.newsLog.slice(0, 5).map((n) => ({ ...n })),
    gameOver: state.gameOver,
    finalScore: state.finalScore,
  };
}

function simulate(seed: number, floor = 26, headsPerWeek = 2, caps = { devs: 99, sales: 99 }, focus: any = 'core') {
  let state = newGame('Nimbus', seed, focus, '🚀');
  const weeks = [snapshot(state)];
  const decisions: {
    week: number;
    era: string;
    title: string;
    flavor: string;
    choices: { label: string; consequence: string; endsRun: boolean }[];
    picked: number;
  }[] = [];
  const hires: { week: number; role: string; name: string; exEmployer: string; perk: string; salary: number }[] = [];

  for (let i = 0; i < MAX_WEEKS; i += 1) {
    if (state.pendingEvent?.kind === 'decision') {
      const card = state.pendingEvent;
      const picked = 0;
      const cardValuation = weeklyStatsFor(state).valuation;
      decisions.push({
        week: state.week,
        era: card.era,
        title: card.title,
        flavor: card.flavor,
        choices: (card.choices ?? []).map((c) => ({
          label: c.label,
          consequence: summarizeEffects(c.effects, cardValuation),
          endsRun: c.effects.acquisitionOffer !== undefined,
        })),
        picked,
      });
      state = reduce(state, { type: 'ANSWER_EVENT', choiceIndex: picked });
      if (state.gameOver) break;
    }

    // Money first: raise before the runway gets scary, the way a founder does.
    if (weeklyStatsFor(state).runway < 18 && state.roundsRaised < 3) {
      state = reduce(state, { type: 'RAISE_ROUND' });
    }

    if (isIpoEligible(state.stage, state.ipoWindowOpen, state.weeksRevenueAboveIpoBar)) {
      state = reduce(state, { type: 'GO_PUBLIC' });
      weeks.push(snapshot(state));
      break;
    }

    // Perks are cheap next to attrition once morale slides.
    const wantLever = state.morale < 62 && state.cash > 250_000;
    if (wantLever !== state.moraleLeverActive) {
      state = reduce(state, { type: 'SET_MORALE_LEVER', active: wantLever });
    }

    for (const role of ['cto', 'cmo', 'cfo'] as const) {
      if (state.cLevels[role].hired || state.cash < 400_000 || state.week < 10) continue;
      state = reduce(state, { type: 'ROLL_CANDIDATES', role });
      const offer = state.cLevels[role].offer;
      const stats = weeklyStatsFor(state);
      const affordable = offer?.candidates
        .filter((c) => state.cash / Math.max(1, stats.burn + c.salary - stats.revenue) > 20)
        .sort((a, b) => b.salary - a.salary)[0];
      if (affordable) {
        state = reduce(state, { type: 'HIRE_CLEVEL', role, candidateId: affordable.id });
        hires.push({
          week: state.week,
          role,
          name: affordable.name,
          exEmployer: affordable.exEmployer,
          perk: affordable.perk.label,
          salary: affordable.salary,
        });
      }
      break;
    }

    // Hiring: support covers the base, sales drive the pipeline, devs keep the
    // quality edge that makes the pipeline convert. Two heads a week while
    // there's runway for them, so growth actually compounds.
    for (let n = 0; n < headsPerWeek; n += 1) {
      const h = state.pendingHeadcount;
      const stats = weeklyStatsFor(state);
      if (stats.runway < floor) break;
      const role: Role | null =
        h.support * 200 < state.customers
          ? 'support'
          : h.sales < Math.min(caps.sales, Math.max(2, h.devs))
            ? 'sales'
            : h.devs < caps.devs
              ? 'devs'
              : null;
      if (!role) break;
      state = reduce(state, { type: 'SET_PENDING_HIRES', role, delta: 1 });
    }

    state = reduce(state, { type: 'TICK' });
    weeks.push(snapshot(state));
    if (state.gameOver) break;
  }

  return { weeks, decisions, hires };
}

it('exports a scripted run for the marketing video', () => {
  const rows: string[] = [];
  let best: { key: string; run: ReturnType<typeof simulate>; peak: number } | null = null;
  for (const focus of ['core', 'ai', 'hardware', 'hype'] as const) {
    for (const cap of [2, 3, 4, 6, 8]) {
      for (let s = 1; s <= 8; s += 1) {
        const seed = s * 1013;
        const run = simulate(seed, 26, 2, { devs: cap, sales: cap }, focus);
        const last = run.weeks[run.weeks.length - 1];
        const peak = Math.max(...run.weeks.map((w) => w.valuation));
        const peakWeek = run.weeks.find((w) => w.valuation === peak)!.week;
        rows.push(
          `${focus} cap${cap} seed${seed} -> end wk${last.week} ${last.gameOver ?? 'alive'} peakVal ${Math.round(peak / 1000)}K @wk${peakWeek} endUsers ${Math.round(last.customers)} share ${(last.marketShare * 100).toFixed(1)}%`,
        );
        const survived = last.gameOver !== 'bankruptcy';
        const score = peak * (survived ? 2 : 1);
        if (!best || score > best.peak) best = { key: `${focus} cap${cap} seed${seed}`, run, peak: score };
      }
    }
  }
  writeFileSync('/tmp/sim-sweep.txt', `${rows.join('\n')}\nPICKED ${best!.key}\n`);
  const out = path.resolve(__dirname, '../../../video/src/data/run.json');
  writeFileSync(out, `${JSON.stringify(best!.run, null, 2)}\n`);
  expect(best!.run.weeks.length).toBeGreaterThan(10);
});
