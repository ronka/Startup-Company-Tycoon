/**
 * Test-only stand-in for `posthog-react-native`. The real package pulls in
 * React Native / native modules that the pure-node vitest environment can't
 * transform, and the store's pure reducer path (exercised by
 * `game-store.test.ts`) never needs a real analytics client. Aliased in
 * `vitest.config.ts` so importing the store under test resolves to these no-ops.
 */

export default class PostHog {
  capture(): void {}
  screen(): Promise<void> {
    return Promise.resolve();
  }
  register(): Promise<void> {
    return Promise.resolve();
  }
  unregister(): Promise<void> {
    return Promise.resolve();
  }
  identify(): void {}
  group(): void {}
  reset(): void {}
  getDistinctId(): string {
    return 'test-distinct-id';
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

export const PostHogProvider = ({ children }: { children?: unknown }) => children;
export const usePostHog = () => new PostHog();
