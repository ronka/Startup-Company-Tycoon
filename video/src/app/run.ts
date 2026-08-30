/**
 * The run every scene reads from.
 *
 * `run.json` is not mocked data: it was produced by driving the shipped game
 * engine (`src/game/engine.ts`) week by week with a scripted founder policy and
 * dumping a snapshot per week. That's what keeps HQ, Team and Market showing
 * one continuous session — cut them together and the HUD stays consistent,
 * because every number came out of the same simulation.
 *
 * `stateAt()` reads the run at a *fractional* week so a scene can race the
 * clock from week 12 to week 60 and have every number count smoothly instead
 * of stepping.
 */

import runData from "../data/run.json";

export interface Candidate {
  id: string;
  name: string;
  personality: string;
  exEmployer: string;
  tier: string;
  salary: number;
  perk: { label: string };
}

export interface NewsEntry {
  week: number;
  title: string;
  flavor: string;
  choiceLabel?: string;
  kind?: "digest" | "era" | "trend";
}

export interface WeekSnapshot {
  week: number;
  cash: number;
  runway: number | null;
  customers: number;
  marketCustomers: number;
  marketShare: number;
  valuation: number;
  revenue: number;
  burn: number;
  morale: number;
  hype: number;
  productQuality: number;
  headcount: { devs: number; sales: number; support: number };
  stage: string;
  era: string;
  focus: string;
  founderEquity: number;
  roundsRaised: number;
  moraleLeverActive: boolean;
  trend: { id: string; phase: string; weeksInPhase: number };
  rivals: { name: string; productQuality: number; marketShare: number; focus: string }[];
  cLevels: { cto: Candidate | null; cmo: Candidate | null; cfo: Candidate | null };
  news: NewsEntry[];
  gameOver: string | null;
}

export interface Decision {
  week: number;
  era: string;
  title: string;
  flavor: string;
  choices: { label: string; consequence: string; endsRun: boolean }[];
  /** Which choice the run actually took. */
  picked: number;
}

/** The decision card drawn on `week`, if there was one. */
export function decisionAt(week: number): Decision | undefined {
  return RUN.decisions.find((decision) => decision.week === week);
}

export const RUN = runData as unknown as {
  weeks: WeekSnapshot[];
  decisions: Decision[];
  hires: { week: number; role: string; name: string; exEmployer: string; perk: string; salary: number }[];
};

export const COMPANY = { name: "Nimbus", logo: "🚀" };

/** Every week the run recorded, oldest first. */
export const WEEKS = RUN.weeks;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * The run at fractional week `w`. Numbers are interpolated between the two
 * bracketing weeks (so counters tick smoothly); anything categorical — stage,
 * era, the news log, who's hired — snaps from the week actually reached, since
 * there is no meaningful halfway between "Seed" and "Series A".
 */
export function stateAt(w: number): WeekSnapshot {
  const clamped = Math.max(0, Math.min(WEEKS.length - 1, w));
  const lo = WEEKS[Math.floor(clamped)];
  const hi = WEEKS[Math.min(WEEKS.length - 1, Math.ceil(clamped))];
  const t = clamped - Math.floor(clamped);

  return {
    ...lo,
    week: lo.week,
    cash: lerp(lo.cash, hi.cash, t),
    runway: lo.runway === null || hi.runway === null ? lo.runway : lerp(lo.runway, hi.runway, t),
    customers: lerp(lo.customers, hi.customers, t),
    marketCustomers: lerp(lo.marketCustomers, hi.marketCustomers, t),
    marketShare: lerp(lo.marketShare, hi.marketShare, t),
    valuation: lerp(lo.valuation, hi.valuation, t),
    revenue: lerp(lo.revenue, hi.revenue, t),
    burn: lerp(lo.burn, hi.burn, t),
    morale: lerp(lo.morale, hi.morale, t),
    hype: lerp(lo.hype, hi.hype, t),
    rivals: lo.rivals.map((rival, i) => ({
      ...rival,
      marketShare: lerp(rival.marketShare, hi.rivals[i]?.marketShare ?? rival.marketShare, t),
      productQuality: lerp(rival.productQuality, hi.rivals[i]?.productQuality ?? rival.productQuality, t),
    })),
  };
}

/**
 * The valuation series HQ's sparkline draws, exactly as the app builds it:
 * one entry appended per tick, capped at `VALUATION_HISTORY_CAP` weeks.
 */
export function valuationHistoryAt(w: number): number[] {
  const upTo = Math.max(0, Math.min(WEEKS.length - 1, Math.floor(w)));
  return WEEKS.slice(1, upTo + 1)
    .map((week) => week.valuation)
    .slice(-104);
}

/** Week-over-week valuation move, the delta chip beside HQ's hero number. */
export function valuationChangeAt(w: number): number | null {
  const i = Math.max(0, Math.min(WEEKS.length - 1, Math.floor(w)));
  const previous = WEEKS[Math.max(0, i - 1)];
  if (!previous || previous.valuation <= 0) return null;
  return ((WEEKS[i].valuation - previous.valuation) / previous.valuation) * 100;
}

/** Hype is a 0.5–2.5 multiplier internally; ×40 reads as a familiar 20–100 score (HQ). */
export const HYPE_SCORE_SCALE = 40;
