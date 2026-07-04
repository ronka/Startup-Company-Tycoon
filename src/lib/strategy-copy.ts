/** Presentation copy for the Company Focus system — labels, blurbs, and trend-alignment sentences. */

import type { Bottleneck } from '@/game/balance';
import { FOCUS_PROFILES } from '@/game/balance';
import type { FocusId, Trend, TrendId, TrendPhase } from '@/game/types';

export const FOCUS_LABEL: Record<FocusId, string> = {
  core: 'Core product',
  ai: 'AI',
  hardware: 'Hardware',
  hype: 'Hype',
};

export const FOCUS_BLURB: Record<FocusId, string> = {
  core: 'Heads down on the product itself — quality first, steadier churn.',
  ai: 'The roadmap bends toward AI — rides the AI wave, quality growth slows.',
  hardware: 'Physical product, physical costs — highest revenue per customer, highest burn.',
  hype: 'Marketing over substance — chases whatever trend is hot, at half strength.',
};

export const TREND_LABEL: Record<TrendId, string> = {
  ai: 'AI',
  hardware: 'Hardware',
  crypto: 'Crypto',
};

export const TREND_PHASE_LABEL: Record<TrendPhase, string> = {
  quiet: 'Quiet',
  rising: 'Rising',
  peak: 'Peak',
  crash: 'Crash',
};

export const BOTTLENECK_LABEL: Record<Bottleneck, string> = {
  quality: 'Quality lagging the market',
  leads: 'Not enough leads',
  support: 'Support stretched thin',
  demand: 'Demand exhausted',
};

/** One-sentence description of how `focus` relates to the live trend wave — mirrors `trendFactorsFor`'s alignment logic. */
export function trendAlignmentFor(focus: FocusId, trend: Trend): string {
  const trendTag = FOCUS_PROFILES[focus].trendTag;
  if (trendTag === trend.id) {
    return trend.phase === 'crash'
      ? `Fully aligned with the ${trend.id} wave — taking the crash hard.`
      : `Fully aligned with the ${trend.id} wave (${trend.phase}).`;
  }
  if (focus === 'hype') {
    return trend.phase === 'quiet'
      ? 'No trend live to chase right now.'
      : `Riding the ${trend.id} wave at half strength (${trend.phase}).`;
  }
  if (focus === 'core' && trend.phase === 'crash') {
    return `Flight-to-quality: benefiting from the ${trend.id} crash.`;
  }
  return trend.phase === 'quiet' ? 'No trend live right now.' : `Not aligned with the ${trend.id} wave (${trend.phase}).`;
}
