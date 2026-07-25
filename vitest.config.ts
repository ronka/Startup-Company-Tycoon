import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors tsconfig's `@/*` -> `./src/*` mapping, so pure modules under
    // src/state can import `@/lib/...` and `@/game/...` like the app does.
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The store transitively imports the analytics client; the real
      // posthog-react-native package needs React Native infra the node test
      // env lacks. Swap in a no-op stub for tests.
      'posthog-react-native': path.resolve(__dirname, './src/analytics/__tests__/posthog-stub.ts'),
    },
  },
  test: {
    // Engine tests are pure TypeScript — no React Native test infra needed.
    // src/state's non-React logic modules (e.g. week-budget.ts), src/lib's pure
    // helpers, and src/purchases' client interface get the same treatment.
    include: [
      'src/game/**/*.test.ts',
      'src/state/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/purchases/**/*.test.ts',
      // src/widgets/snapshot.ts is pure too — the native `expo-widgets` calls
      // are quarantined in src/widgets/sync.ts, which has no tests here.
      'src/widgets/**/*.test.ts',
    ],
    environment: 'node',
  },
});
