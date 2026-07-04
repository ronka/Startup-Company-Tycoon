/** Per-role live contribution numbers for the Team tab — pure preview off pending headcount, current stocks. */

import {
  CUSTOMERS_PER_SUPPORT,
  FOCUS_PROFILES,
  QUALITY_GROWTH_RATE,
  conversionRateFor,
  devEffort,
  leadsFor,
  moraleFactor,
  trendFactorsFor,
} from '@/game/balance';
import type { GameState } from '@/game/types';

export interface TeamContributions {
  /** Devs: raw quality growth this week's dev effort would produce (before tech-debt decay). */
  devsQualityPerWeek: number;
  /** Sales: leads generated and the conversion rate they'd land at, at current quality. */
  salesLeadsPerWeek: number;
  salesConversionRate: number;
  /** Support: customers covered vs. total — the uncovered fraction churns much harder. */
  supportCovered: number;
  supportTotal: number;
}

export function teamContributionsFor(state: GameState): TeamContributions {
  const rivalAvgQuality =
    state.rivals.length > 0
      ? state.rivals.reduce((sum, r) => sum + r.productQuality, 0) / state.rivals.length
      : 0;
  const focusProfile = FOCUS_PROFILES[state.focus];
  const trendFactors = trendFactorsFor(state.focus, state.trend, state.era);

  const devsQualityPerWeek =
    devEffort(state.pendingHeadcount.devs) *
    QUALITY_GROWTH_RATE *
    moraleFactor(state.morale) *
    focusProfile.qualityGrowthMultiplier;

  const salesLeadsPerWeek = leadsFor(state.pendingHeadcount.sales, state.hype * trendFactors.demand);
  const salesConversionRate = conversionRateFor(state.productQuality, rivalAvgQuality);

  const supportCovered = Math.min(state.pendingHeadcount.support * CUSTOMERS_PER_SUPPORT, state.customers);

  return {
    devsQualityPerWeek,
    salesLeadsPerWeek,
    salesConversionRate,
    supportCovered,
    supportTotal: state.customers,
  };
}
