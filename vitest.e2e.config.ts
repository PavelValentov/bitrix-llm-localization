import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    include: ['tests/e2e-mlx-translation.test.ts'],
    hookTimeout: 150_000,
    testTimeout: 60_000,
  },
});
