/**
 * The custom variables the RevenueCat-hosted paywall can interpolate
 * (`{{ custom.title }}` etc.), built from the run. Pure — no SDK import — so
 * vitest covers the fallback rules; `revenuecat.ts` converts the result with
 * the SDK's `CustomVariableValue` factories.
 *
 * Any variable that's missing or unusable is *omitted*, never sent empty:
 * RevenueCat then renders the default set in the paywall editor (the
 * suggested defaults are `PAYWALL_VARIABLE_DEFAULTS` below — documentation for
 * whoever sets up the paywall, not values this app sends).
 */

/** Exact keys, as defined (or to be defined) in the RevenueCat paywall editor. */
export const PAYWALL_VARIABLE_KEYS = ['companyName', 'week', 'title', 'teaser', 'choiceA', 'choiceB', 'stakes'] as const;
export type PaywallVariableKey = (typeof PAYWALL_VARIABLE_KEYS)[number];

export interface PaywallVariables {
  companyName?: string;
  /** Sent as a number. */
  week?: number;
  title?: string;
  teaser?: string;
  choiceA?: string;
  choiceB?: string;
  stakes?: string;
}

/** Suggested editor defaults, for the paywall setup (see the PR). Never sent by the app. */
export const PAYWALL_VARIABLE_DEFAULTS: Required<PaywallVariables> = {
  companyName: 'your company',
  week: 0,
  title: 'A decision',
  teaser: 'Next week a real decision lands on your desk',
  choiceA: 'One path',
  choiceB: 'The other',
  stakes: 'Cash, morale, or market share are on the line',
};

/** The slice of a pinned card the paywall needs — `CliffhangerTeaser` satisfies it. */
export interface PaywallCardInput {
  title: string;
  teaser: string;
  choiceA: string;
  choiceB: string | null;
  stakes: string;
}

export interface PaywallVariablesInput {
  companyName?: string | null;
  week?: number | null;
  /** The pinned card; only used for the cliffhanger trigger. */
  card?: PaywallCardInput | null;
}

/** Long enough for any real title or teaser; short enough that a broken value can't flood the paywall layout. */
export const MAX_VARIABLE_LENGTH = 140;

/** The trigger whose paywall talks about the pinned card. Matches `BuyWeeksTrigger`'s `'cliffhanger'`. */
const CLIFFHANGER_TRIGGER = 'cliffhanger';

function clean(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_VARIABLE_LENGTH ? `${trimmed.slice(0, MAX_VARIABLE_LENGTH - 1).trimEnd()}…` : trimmed;
}

/**
 * Variables for a paywall opened from `trigger`. Every trigger gets the
 * company and week (harmless if the paywall ignores them); only the
 * cliffhanger trigger gets the card fields, and only when a card is pinned.
 */
export function paywallVariablesFor(input: PaywallVariablesInput, trigger: string): PaywallVariables {
  const vars: PaywallVariables = {};
  const companyName = clean(input.companyName);
  if (companyName) vars.companyName = companyName;
  if (typeof input.week === 'number' && Number.isFinite(input.week) && input.week >= 0) {
    vars.week = Math.floor(input.week);
  }
  const card = trigger === CLIFFHANGER_TRIGGER ? input.card : null;
  if (card) {
    const fields: [Exclude<PaywallVariableKey, 'companyName' | 'week'>, string | null | undefined][] = [
      ['title', card.title],
      ['teaser', card.teaser],
      ['choiceA', card.choiceA],
      ['choiceB', card.choiceB],
      ['stakes', card.stakes],
    ];
    for (const [key, value] of fields) {
      const cleaned = clean(value);
      if (cleaned) vars[key] = cleaned;
    }
  }
  return vars;
}

/** The SDK's `CustomVariableValue` factory surface, injected so this stays SDK-free. */
export interface CustomVariableFactory<V> {
  string: (value: string) => V;
  number: (value: number) => V;
}

/**
 * Converts plain variables into the SDK's `customVariables` map. Returns
 * undefined when there's nothing to send. May throw if the factory does (an
 * SDK without custom-variable support) — the caller catches that and presents
 * the paywall without variables.
 */
export function toCustomVariables<V>(vars: PaywallVariables, factory: CustomVariableFactory<V>): Record<string, V> | undefined {
  const out: Record<string, V> = {};
  for (const key of PAYWALL_VARIABLE_KEYS) {
    const value = vars[key];
    if (typeof value === 'number') out[key] = factory.number(value);
    else if (typeof value === 'string') out[key] = factory.string(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
