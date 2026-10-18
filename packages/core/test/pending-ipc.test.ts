// SPDX-License-Identifier: Apache-2.0
// US-053 integration: a relayed permission request appears in the pending decisions, is decided over IPC (incl. "always
// allow"), and events notify the UI.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

// Full runs with real Git worktrees: several seconds each on Windows, more under a parallel suite.
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

async function boot() {
  const appDataDir = mkdtempSync(join(tmpdir(), 'sf-pend-app-'));
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({
      script: () => [
        { type: 'tool', toolName: 'Write', input: { file_path: 'out.txt', content: 'hello\n' } },
        { type: 'result', text: 'Wrote out.txt.' },
      ],
    }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  return { client: await connectClient(wrap(port1)), appDataDir };
}

async function startStory(client: ContractClient) {
  const project = await client.command('projects.create', {
    name: 'Pend',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-pend-ws-')),
    folderName: 'pend',
    initGit: true,
  });
  writeFileSync(
    join(project.path, 'spec', '04_user_stories', 'US-001.md'),
    '---\nkind: story\nid: US-001\ntitle: Write a file\napproval: approved\nstatus: ready\n---\n',
  );
  await client.command('projects.openById', { projectId: project.id });
  await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
  return project;
}

describe('US-053 over IPC', () => {
  it('AC-1/AC-2: the relayed request is listed with story, run, tool, arguments and cwd; allowing it lets the run finish', async () => {
    const { client, appDataDir } = await boot();
    const requested: unknown[] = [];
    const finished: unknown[] = [];
    client.subscribe('permission.requested', (e) => requested.push(e));
    client.subscribe('run.finished', (e) => finished.push(e));
    const project = await startStory(client);

    const groups = await waitFor(async () => {
      const g = await client.query('pending.list', { projectId: project.id });
      return g.some((x) => x.items.some((i) => i.kind === 'permission')) ? g : undefined;
    });
    const item = groups[0]!.items[0]!;
    expect(groups[0]).toMatchObject({ storyId: 'US-001', title: 'Write a file' });
    expect(item).toMatchObject({
      kind: 'permission',
      permission: { toolName: 'Write', input: { file_path: 'out.txt' }, outsideWorkspace: false },
    });
    expect(await client.query('shell.state', {})).toMatchObject({ pendingDecisions: 1 });
    await waitFor(async () => (requested.length > 0 ? true : undefined));
    expect(requested[0]).toMatchObject({ projectId: project.id, storyId: 'US-001', toolName: 'Write' });

    const id = item.kind === 'permission' ? item.permission.id : '';
    await expect(client.command('permission.decide', { id, decision: 'allow', alwaysAllow: true })).resolves.toEqual({ ok: true });

    await waitFor(async () => (finished.length > 0 ? true : undefined));
    expect(finished[0]).toMatchObject({ projectId: project.id, storyId: 'US-001', outcome: 'completed' });
    // The allowed write happened in the story's worktree.
    expect(readFileSync(join(appDataDir, 'wt', project.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8), 'US-001', 'out.txt'), 'utf8')).toBe(
      'hello\n',
    );
    expect(await client.query('rules.effective', { projectId: project.id })).toEqual([
      expect.objectContaining({ effect: 'allow', toolName: 'Write', appliesTo: 'implementation', origin: 'project' }),
    ]);
    expect(await client.query('pending.list', { projectId: project.id })).toEqual([
      expect.objectContaining({ storyId: 'US-001', items: [{ kind: 'review', detail: 'Ready for your review' }] }),
    ]);
  });

  it('AC-1: denying with a message is reported to the agent; unknown requests are refused', async () => {
    const { client } = await boot();
    const project = await startStory(client);
    const groups = await waitFor(async () => {
      const g = await client.query('pending.list', { projectId: project.id });
      return g.length > 0 && g[0]!.items[0]!.kind === 'permission' ? g : undefined;
    });
    const item = groups[0]!.items[0]!;
    const id = item.kind === 'permission' ? item.permission.id : '';

    await expect(client.command('permission.decide', { id, decision: 'deny', message: 'Not this file' })).resolves.toEqual({ ok: true });
    await expect(client.command('permission.decide', { id, decision: 'allow' })).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/No pending permission request/),
    });
  });
});
