import * as Updates from 'expo-updates';

import appConfig from '../../app.json';

/** Incremented by `npm run update` before each OTA publish. */
export const UPDATE_VERSION = 17;

/** Human-readable identifier for the native app version plus OTA revision. */
export const APP_RELEASE = `${appConfig.expo.version}-${UPDATE_VERSION}`;

/** Release context attached to every event as PostHog super properties. */
export const ANALYTICS_RELEASE_PROPERTIES = {
  app_release: APP_RELEASE,
  ota_update_version: UPDATE_VERSION,
  expo_update_id: Updates.updateId,
} as const;
