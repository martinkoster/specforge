// SPDX-License-Identifier: Apache-2.0
// Performance tests (NFR targets): one file at a time, so timing assertions are not distorted by parallel load.
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases(import.meta.dirname) },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/**/test/**/*.perf.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    testTimeout: 300_000,
  },
});
