import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Engine tests are pure TypeScript — no React Native test infra needed.
    include: ['src/game/**/*.test.ts'],
    environment: 'node',
  },
});
