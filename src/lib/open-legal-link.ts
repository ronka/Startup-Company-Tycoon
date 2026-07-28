import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Linking } from 'react-native';

import { EVENTS, track } from '@/analytics/events';
import { PRIVACY_POLICY_URL, SUPPORT_URL, TERMS_OF_USE_URL } from '@/constants/links';

export type LegalLink = 'privacy' | 'support' | 'terms';

const URLS: Record<LegalLink, string> = {
  privacy: PRIVACY_POLICY_URL,
  support: SUPPORT_URL,
  terms: TERMS_OF_USE_URL,
};

export const LEGAL_LINK_LABELS: Record<LegalLink, string> = {
  privacy: 'Privacy Policy',
  support: 'Support',
  terms: 'Terms of Use',
};

/**
 * Opens a legal/support destination in the in-app browser, falling back to the
 * system browser if that fails.
 *
 * The fallback is the point: App Review taps every one of these, and a link
 * that silently does nothing reads as a broken privacy-policy link — which is
 * a Guideline 5.1.1(i) rejection, not a cosmetic bug. Never throws, for the
 * same reason `track` doesn't: a legal link must not be able to break the app.
 *
 * `source` records which surface the link was tapped from (settings, paywall),
 * since the paywall-adjacent links exist for a different reason than the
 * Settings rows do.
 */
export function openLegalLink(link: LegalLink, source: string): void {
  track(EVENTS.LEGAL_LINK_OPENED, { link, source });
  const url = URLS[link];
  openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC }).catch(() => {
    Linking.openURL(url).catch(() => {});
  });
}
