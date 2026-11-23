/**
 * The last pathname `useScreenTracking` reported, readable outside React.
 * Lives in its own module (no `expo-router` import) because the store reads
 * it for `session_backgrounded` and is unit-tested in plain Node.
 */

let currentRoute: string | null = null;

export function setCurrentRoute(pathname: string): void {
  currentRoute = pathname;
}

/** The screen the player was last on, e.g. `/hq`, or null before the first route lands. */
export function getCurrentRoute(): string | null {
  return currentRoute;
}
