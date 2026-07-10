/**
 * Manual screen tracking for expo-router. Sends a PostHog `$screen` event
 * whenever the active route changes, keyed by pathname (e.g. `/hq`, `/team`,
 * `/settings`, `/onboarding`). We do this explicitly rather than relying on
 * react-navigation autocapture internals, which are brittle under expo-router's
 * nested Stack → Drawer → Tabs. Call once from the root layout, inside the
 * PostHogProvider.
 */

import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { posthog } from './posthog';

export function useScreenTracking(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    posthog.screen(pathname);
  }, [pathname]);
}
