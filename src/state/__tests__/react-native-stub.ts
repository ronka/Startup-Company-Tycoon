/**
 * Just enough of `react-native` for the store to load under node: it listens
 * for the app returning to the foreground to credit regenerated weeks. Nothing
 * in the test env ever changes app state, so the listener is inert.
 */
export const AppState = {
  addEventListener: () => ({ remove: () => {} }),
};
