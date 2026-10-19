// SPDX-License-Identifier: Apache-2.0
// US-012 integration: setup over IPC with the MockAdapter as agent, secrets in the secret store, state across restarts.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import type { SecretStore } from '@specforge/application';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore } from '../src/index.js';

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

const values = new Map<string, string>();
const secrets: SecretStore = {
  set: async (k, v) => void values.set(k, v),
  get: async (k) => values.get(k),
  delete: async (k) => void values.delete(k),
};

async function boot(appDataDir: string, agentAdapter?: MockAdapter) {
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    secrets,
    ...(agentAdapter ? { agentAdapter } : {}),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return connectClient(wrap(port1));
}

describe('US-012 over IPC', () => {
  it('AC-1..AC-3: first start is not set up; provider, connection test, rules and finish are recorded and survive a restart', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-setup-'));
    const adapter = new MockAdapter({
      script: (request) =>
        request.config.env?.ANTHROPIC_API_KEY === 'sk-good'
          ? [{ type: 'result', text: 'OK' }]
          : [{ type: 'fail', reason: 'Invalid API key' }],
    });
    const client = await boot(appData, adapter);

    const first = await client.query('setup.state', {});
    expect(first.setupState).toBe('not_started');
    expect(first.steps.map((s) => s.id)).toEqual(['runtime', 'provider', 'git', 'rules', 'defaults', 'summary']);

    await client.command('setup.saveProvider', { provider: { kind: 'anthropic_api_key', apiKey: 'sk-bad' } });
    await expect(client.command('setup.testConnection', {})).resolves.toEqual({ ok: false, error: 'Invalid API key' });
    await client.command('setup.saveProvider', { provider: { kind: 'anthropic_api_key', apiKey: 'sk-good' } });
    await expect(client.command('setup.testConnection', {})).resolves.toEqual({ ok: true });
    expect(values.get('provider/ANTHROPIC_API_KEY')).toBe('sk-good');

    const suggestions = await client.query('setup.ruleSuggestions', {});
    expect(suggestions.every((s) => !s.enabled)).toBe(true);
    await expect(client.command('setup.enableRules', { keys: ['read-search', 'command:npm test'] })).resolves.toEqual({ created: 5 });
    expect((await client.query('setup.ruleSuggestions', {})).filter((s) => s.enabled).map((s) => s.key)).toEqual([
      'read-search',
      'command:npm test',
    ]);

    const state = await client.query('setup.state', {});
    expect(state.steps.find((s) => s.id === 'provider')).toMatchObject({ status: 'ok' });
    expect(state.steps.find((s) => s.id === 'rules')).toMatchObject({ status: 'ok' });
    await client.command('setup.complete', {});

    const restarted = await boot(appData);
    expect((await restarted.query('setup.state', {})).setupState).toBe('complete');
  });

  it('AC-4: skipping the setup records "incomplete"; without an agent adapter the connection test explains why it cannot run', async () => {
    const client = await boot(mkdtempSync(join(tmpdir(), 'sf-setup-')));
    await client.command('setup.saveProvider', { provider: { kind: 'bedrock', region: 'eu-central-1' } });

    await expect(client.command('setup.testConnection', {})).resolves.toEqual({
      ok: false,
      error: expect.stringMatching(/No agent adapter/),
    });
    await client.command('setup.skipStep', { step: 'runtime' });
    await client.command('setup.skip', {});

    const state = await client.query('setup.state', {});
    expect(state.setupState).toBe('incomplete');
    expect(state.steps.find((s) => s.id === 'runtime')).toMatchObject({ status: 'skipped' });
  });
});
