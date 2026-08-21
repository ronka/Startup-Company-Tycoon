import type { ViewStyle } from 'react-native';

/**
 * No-op on web/vitest — `expo-apple-authentication` is a native module with
 * no web shim, so it's kept out of this file entirely (mirrors the
 * `src/account` / `src/purchases` platform split). `.native.tsx` overrides
 * this on iOS/Android; callers gate on `accountAvailable` anyway, so this
 * never renders where Sign in with Apple isn't real.
 */
export function AppleSignInButton(_props: { onPress: () => void; style?: ViewStyle }) {
  return null;
}
