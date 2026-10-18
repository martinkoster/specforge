// SPDX-License-Identifier: Apache-2.0
// Core system handlers on the IPC contract: connectivity, test-mode crash, shell state (US-005, US-022).
import { CONTRACT_VERSION, type ContractHandlers } from '@specforge/ipc-contract';

export interface SystemContext {
  pid: number;
  platform: string;
  /** Crash on request (end-to-end tests of core restarts; SPECFORGE_TEST=1 only). */
  allowCrash: boolean;
  exit(code: number): void;
}

export function createSystemHandlers(ctx: SystemContext): ContractHandlers {
  return {
    'system.ping': async ({ nonce }) => ({ nonce, pid: ctx.pid }),
    'system.info': async () => ({ contractVersion: CONTRACT_VERSION, platform: ctx.platform }),
    'system.crash': async () => {
      if (!ctx.allowCrash) return { accepted: false };
      // Exit after the response has been sent.
      setTimeout(() => ctx.exit(1), 20);
      return { accepted: true };
    },
    'shell.state': async () => ({
      projects: [],
      currentProjectId: null,
      vcs: null,
      runs: { running: 0, queued: 0 },
      pendingDecisions: 0,
      storyCount: 0,
    }),
  };
}
