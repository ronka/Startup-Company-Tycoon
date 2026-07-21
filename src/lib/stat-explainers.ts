/** One-sentence "what feeds it, what it feeds" explainers, shown on tap via `StatTile`'s `explainer` prop. */
export const STAT_EXPLAINERS = {
  weeklyBurn: 'Payroll and fixed costs, trimmed by a CFO burn-cut perk and reshaped by your focus — feeds runway.',
  revenue: 'Customers × ARPC × your focus’s revenue multiplier — feeds valuation and runway.',
  valuation: "Revenue capitalized at the era's industry multiple and boosted by hype — feeds your stake and IPO eligibility.",
  runway: 'Cash ÷ (burn − revenue) — weeks left before insolvency; feeds how urgently you need to raise.',
  hype: 'Buzz around the company, moved by marketing, trends and events — feeds new customers and valuation.',
  customers: 'Everyone paying you today — gained from leads, lost to weak quality or stretched support; feeds revenue.',
} as const;
