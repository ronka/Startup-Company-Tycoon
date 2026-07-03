/** One-sentence "what feeds it, what it feeds" explainers, shown on tap via `StatTile`'s `explainer` prop. */
export const STAT_EXPLAINERS = {
  weeklyBurn: 'Payroll and fixed costs, trimmed by a CFO burn-cut perk — feeds runway.',
  revenue: 'Product quality × market share × hype × sales effort — feeds valuation and runway.',
  valuation: "Revenue capitalized at the era's industry multiple and boosted by hype — feeds your stake and IPO eligibility.",
  runway: 'Cash ÷ (burn − revenue) — weeks left before insolvency; feeds how urgently you need to raise.',
} as const;
