/**
 * Emits a `tab_viewed` event each time one of the four game tabs (HQ / Team /
 * Money / Market) gains focus — including when the player returns to an
 * already-mounted tab, which a mount-only effect would miss. A cleaner signal
 * for tab-engagement funnels than parsing `$screen` pathnames. Call at the top
 * of each tab screen, before any conditional return.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { EVENTS, track } from './events';

export function useTabView(tab: 'hq' | 'team' | 'money' | 'market'): void {
  useFocusEffect(
    useCallback(() => {
      track(EVENTS.TAB_VIEWED, { tab });
    }, [tab]),
  );
}
