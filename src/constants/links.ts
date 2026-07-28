/**
 * The player-facing legal and support destinations, in one place because App
 * Review checks each of them and App Store Connect stores its own copy of the
 * first two — if these ever drift from the metadata, that's a rejection.
 *
 * - Privacy policy: Guideline 5.1.1(i) requires the link in the App Store
 *   Connect metadata field *and* "within the app in an easily accessible
 *   manner". Settings is that place here.
 * - Support: Guideline 1.5 requires the app and its Support URL to include an
 *   easy way to contact the developer.
 * - Terms: linked beside every purchase surface so the terms behind a charge
 *   are one tap away.
 */

export const PRIVACY_POLICY_URL = 'https://www.ronka.dev/startup-tycoon/privacy';

export const SUPPORT_URL = 'https://www.ronka.dev/startup-tycoon/support';

/**
 * Apple's standard EULA. It governs this app because no custom licence
 * agreement is supplied in App Store Connect — so this is the correct terms
 * link, and swapping it for a hand-written one means uploading that agreement
 * to App Store Connect first.
 */
export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
