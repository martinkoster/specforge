// SPDX-License-Identifier: Apache-2.0
// Electron end-to-end tests: separate and sequential, so builds and app launches don't starve the parallel unit suite.
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases(import.meta.dirname) },
  test: {
    include: ['packages/**/test/**/*.e2e.test.ts'],
    globalSetup: ['packages/main/test/e2e-global-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    testTimeout: 120_000,
    // Closing the app stops the core (runs, scheduler, merge timer); under load this can exceed the default 10 s.
    hookTimeout: 30_000,
  },
});
