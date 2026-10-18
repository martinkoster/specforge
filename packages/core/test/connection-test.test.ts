// SPDX-License-Identifier: Apache-2.0
// US-012 AC-2: the connection test is a tiny connection_test agent run (here against the MockAdapter).
import { MockAdapter } from '@specforge/agent-mock';
import { runConnectionTest } from '@specforge/application';
import { describe, expect, it } from 'vitest';

describe('US-012 AC-2: connection test run', () => {
  it('runs a tiny connection_test run with the provider environment; tools are denied', async () => {
    const asked: string[] = [];
    const adapter = new MockAdapter({
      script: (request) => {
        asked.push(`${request.kind}:${request.config.env?.ANTHROPIC_API_KEY}`);
        return [
          { type: 'tool', toolName: 'Bash', input: { command: 'ls' } },
          { type: 'result', text: 'OK' },
        ];
      },
    });

    await expect(runConnectionTest(adapter, { cwd: '.', env: { ANTHROPIC_API_KEY: 'k' } })).resolves.toEqual({ ok: true });
    expect(asked).toEqual(['connection_test:k']);
  });

  it('reports the adapter failure and times out a hanging run', async () => {
    await expect(
      runConnectionTest(new MockAdapter({ script: () => [{ type: 'fail', reason: 'Invalid API key' }] }), { cwd: '.', env: {} }),
    ).resolves.toEqual({
      ok: false,
      error: 'Invalid API key',
    });
    await expect(
      runConnectionTest(new MockAdapter({ script: () => [{ type: 'hang' }] }), { cwd: '.', env: {}, timeoutMs: 50 }),
    ).resolves.toEqual({
      ok: false,
      error: 'The connection test did not finish within 0 s.',
    });
  });
});
