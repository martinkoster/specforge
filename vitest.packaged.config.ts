// SPDX-License-Identifier: Apache-2.0
// Smoke test of the packaged app (US-009 AC-4): run after `pnpm package`, alone and sequentially.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.smoke.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
