/**
 * The single shared PostHog client for the whole app. Instantiated once here
 * and both (a) handed to `<PostHogProvider client={posthog}>` in the root
 * layout — which powers the `usePostHog` hook and lifecycle autocapture — and
 * (b) imported directly by non-hook code (the game store, the `track` helper)
 * so we can `capture()` from anywhere without threading the hook through.
 *
 * Touch autocapture is left OFF: React Native touches arrive unlabeled and
 * noisy. Every meaningful action is captured explicitly instead (see
 * `events.ts`), and screens are tracked manually via `use-screen-tracking.ts`.
 */

import PostHog from 'posthog-react-native';

import { POSTHOG_API_KEY, POSTHOG_HOST } from './config';

export const posthog = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  // Auto-attach $app_version / $os / $device_type etc. to every event.
  enableSessionReplay: false,
});
