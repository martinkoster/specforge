// SPDX-License-Identifier: Apache-2.0
// US-013 integration: capabilities over IPC, AI actions gated, active runs unaffected by capability loss.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import type { AgentAdapter } from '@specforge/application';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const STORY = (id: string) => `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: ready\n---\n`;

async function boot(agentAdapter: AgentAdapter | undefined) {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-caps-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    ...(agentAdapter ? { agentAdapter } : {}),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  const client: ContractClient = await connectClient(wrap(port1));
  const project = await client.command('projects.create', {
    name: 'Caps',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-caps-ws-')),
    folderName: 'caps',
    initGit: false,
  });
  for (const id of ['US-001', 'US-002']) writeFileSync(join(project.path, 'spec', '04_user_stories', `${id}.md`), STORY(id));
  await client.command('projects.openById', { projectId: project.id });
  return { client, projectId: project.id };
}

describe('US-013 over IPC', () => {
  it('AC-1/AC-2: without an agent adapter AI is disabled; generation and moves to In Progress are refused', async () => {
    const { client, projectId } = await boot(undefined);

    expect(await client.query('capabilities.get', {})).toMatchObject({
      agentAvailable: false,
      aiAvailable: false,
      missing: 'No agent runtime is available.',
    });
    await expect(client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null })).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/AI functions are disabled: No agent runtime is available/),
    });
    await expect(client.command('specs.generate', { projectId, target: 'requirements', instruction: 'Go' })).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/AI functions are disabled/),
    });
  });

  it('AC-4: losing a capability does not stop active runs; new AI actions are blocked at once', async () => {
    let available = true;
    const adapter = new MockAdapter({ script: () => [{ type: 'hang' }] });
    adapter.detect = async () => ({ found: available });
    const { client, projectId } = await boot(adapter);
    const changes: boolean[] = [];
    client.subscribe('capabilities.changed', (c) => changes.push(c.aiAvailable));
    expect(await client.query('capabilities.get', {})).toMatchObject({ aiAvailable: true, providerConfigured: false });

    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(async () => (await client.query('runs.list', { projectId })).find((r) => r.status === 'running'));

    available = false;
    expect(await client.command('capabilities.refresh', {})).toMatchObject({ aiAvailable: false });
    await waitFor(async () => (changes.length > 0 ? true : undefined));
    expect(changes).toEqual([false]);

    expect((await client.query('runs.list', { projectId })).find((r) => r.id === run.id)).toMatchObject({ status: 'running' });
    await expect(
      client.command('board.move', { projectId, storyId: 'US-002', to: 'in_progress', beforeStoryId: null }),
    ).resolves.toMatchObject({
      ok: false,
    });
  });
});
