import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Los rate-limit tests hacen hasta 10 requests secuenciales
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Los pools de PG/Redis del modulo app viven entre tests; no aislar por archivo
    pool: 'threads',
    fileParallelism: false,
  },
});
