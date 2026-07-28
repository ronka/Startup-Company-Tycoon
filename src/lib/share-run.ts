/**
 * Thin wrapper over the native share sheet. iOS-only app, so there's no web /
 * clipboard fallback and no new dependency — React Native's built-in `Share`
 * covers it. Normalizes the result into something worth putting in analytics.
 */

import { Share } from 'react-native';

export type ShareOutcome = 'shared' | 'dismissed' | 'failed';

/** Opens the share sheet with `message`. Never throws — failures come back as `'failed'`. */
export async function shareRunText(message: string): Promise<ShareOutcome> {
  try {
    const result = await Share.share({ message });
    return result.action === Share.sharedAction ? 'shared' : 'dismissed';
  } catch {
    return 'failed';
  }
}
