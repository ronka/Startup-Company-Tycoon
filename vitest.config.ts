import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors tsconfig's `@/*` -> `./src/*` mapping, so pure modules under
    // src/state can import `@/lib/...` and `@/game/...` like the app does.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Engine tests are pure TypeScript — no React Native test infra needed.
    // src/state's non-React logic modules (e.g. week-budget.ts) get the same treatment.
    include: ['src/game/**/*.test.ts', 'src/state/**/*.test.ts'],
    environment: 'node',
  },
});
