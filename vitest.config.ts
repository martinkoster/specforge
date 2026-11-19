// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases(import.meta.dirname) },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/**/test/**/*.test.{ts,tsx}', 'tooling/test/**/*.test.ts'],
    // Timing assertions and Electron end-to-end tests run separately and sequentially:
    // `pnpm test:perf` (vitest.perf.config.ts), `pnpm test:e2e` (vitest.e2e.config.ts); the packaged-app smoke test
    // runs after `pnpm package` (`pnpm test:packaged`, vitest.packaged.config.ts).
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.perf.test.{ts,tsx}', '**/*.e2e.test.ts', '**/*.smoke.test.ts'],
    testTimeout: 30_000,
    // Integration tests spawn git, PowerShell and agent processes; one worker per core oversubscribes the machine.
    maxWorkers: '30%',
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.{ts,tsx}', 'tooling/src/**/*.ts'],
      // CLI wrappers, the contract suite and process entry points (verified by e2e tests, not instrumented) are excluded.
      exclude: [
        '**/src/cli/**',
        'packages/agent-adapter-contract/src/**',
        'packages/main/src/main.ts',
        'packages/main/src/preload.cts',
        'packages/core/src/main.ts',
        'packages/ui/src/main.tsx',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 75,
        'packages/domain/src/**': { lines: 90, statements: 90, functions: 90, branches: 90 },
      },
    },
  },
});
