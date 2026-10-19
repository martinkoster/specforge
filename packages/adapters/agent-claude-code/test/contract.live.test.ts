// SPDX-License-Identifier: Apache-2.0
// US-045 AC-4: the shared AgentAdapter contract suite against the real Claude Code (opt-in, costs tokens).
// Run with SPECFORGE_LIVE_CLAUDE=1; optional SPECFORGE_CLAUDE_PATH (else detected), SPECFORGE_LIVE_MODEL and
// ANTHROPIC_API_KEY (passed into the agent environment like a configured provider).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeAgentAdapterContract, type ContractScenario } from '@specforge/agent-adapter-contract';
import type { RunRequest } from '@specforge/application';
import { killTree, listDescendants } from '@specforge/process';
import { beforeAll, describe, it } from 'vitest';
import { ClaudeCodeAdapter } from '../src/adapter.js';
import { detectClaudeCode, systemEnvironment } from '../src/runtime.js';

const LIVE = process.env.SPECFORGE_LIVE_CLAUDE === '1';

const PROMPTS: Record<ContractScenario, string> = {
  echo: 'Reply with exactly the single word PONG and nothing else.',
  permission: 'Create a file named contract.txt containing exactly: ok. Use your file writing tool. Then reply with done.',
  long: 'Run this exact command with your shell tool (Bash or PowerShell, whichever is available) in the foreground and wait for it to finish: node -e "setTimeout(() => {}, 180000)"',
  remember: 'Remember the code word ZEBRA-42. Reply only with OK.',
  recall: 'What was the code word I asked you to remember? Reply with the code word only.',
};

let executable: string | undefined = process.env.SPECFORGE_CLAUDE_PATH;

if (LIVE) {
  beforeAll(async () => {
    if (executable) return;
    const found = await detectClaudeCode(systemEnvironment());
    if (!found.found) throw new Error(`Claude Code not found (searched ${found.searched.join(', ')}); set SPECFORGE_CLAUDE_PATH.`);
    executable = found.path;
  });

  describeAgentAdapterContract({
    name: 'ClaudeCodeAdapter (live)',
    create: () =>
      new ClaudeCodeAdapter({
        executable: () => executable,
        processTree: { descendants: async (pid) => (await listDescendants(pid)).map((p) => p.pid), kill: (pid) => killTree(pid) },
      }),
    request: (scenario, overrides): RunRequest => ({
      runId: `live-${scenario}-${Date.now()}`,
      kind: 'implement',
      cwd: mkdtempSync(join(tmpdir(), 'sf-claude-live-')),
      prompt: PROMPTS[scenario],
      config: {
        maxTurns: 6,
        ...(process.env.SPECFORGE_LIVE_MODEL ? { model: process.env.SPECFORGE_LIVE_MODEL } : {}),
        ...(process.env.ANTHROPIC_API_KEY ? { env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } } : {}),
      },
      ...overrides,
    }),
    timeoutMs: 180_000,
  });
} else {
  describe('US-045 AC-4: live contract suite', () => {
    it.skip('runs only with SPECFORGE_LIVE_CLAUDE=1 (real Claude Code, costs tokens)', () => undefined);
  });
}
