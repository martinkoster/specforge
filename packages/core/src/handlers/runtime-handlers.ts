// SPDX-License-Identifier: Apache-2.0
// IPC handlers for agent runtime detection and verification (US-010, FR-048).
import type { ContractHandlers } from '@specforge/ipc-contract';

type DetectResult = { found: true; path: string; version: string; source: string } | { found: false; searched: string[] };
type VerifyResult =
  | { ok: true; path: string; version: string }
  | { ok: false; error: 'not_found' | 'not_runnable' | 'not_claude_code' | 'too_old'; message: string };

export interface RuntimeStore {
  save(record: { adapterType: string; executablePath: string; detectedVersion: string | null; verified: boolean }): void;
}

export interface RuntimeHandlerDeps {
  detect(): Promise<DetectResult>;
  verify(path: string): Promise<VerifyResult>;
  repository: RuntimeStore;
  adapterType?: string;
}

export function createRuntimeHandlers(deps: RuntimeHandlerDeps): ContractHandlers {
  const adapterType = deps.adapterType ?? 'claude-code';
  return {
    'runtime.detect': async () => {
      const result = await deps.detect();
      if (!result.found) return { found: false, searched: result.searched };
      deps.repository.save({ adapterType, executablePath: result.path, detectedVersion: result.version, verified: true });
      return { found: true, path: result.path, version: result.version };
    },
    'runtime.verify': async ({ path }) => {
      const result = await deps.verify(path);
      if (result.ok) deps.repository.save({ adapterType, executablePath: result.path, detectedVersion: result.version, verified: true });
      return result;
    },
  };
}
