/**
 * PostHog connection config. The project API key is a *public* client key
 * (safe to embed / commit) — it can only write events, never read data. Env
 * vars let a build point at a different project without a code change; the
 * defaults keep the app instrumented out of the box.
 */

/** PostHog project "startup-company-tycoon" (id 505800). */
export const POSTHOG_API_KEY =
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? 'phc_rcTNz7PrzGa8fupe5DFvHGWeMmadRjHt93WWuM2SFxgp';

export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
