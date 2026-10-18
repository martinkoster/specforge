// SPDX-License-Identifier: Apache-2.0
// US-049 integration: cancelling a run over IPC, the close dialog's data, and recovery after a crash (orphan cleanup).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { identify, isAlive, killTree, spawnTracked } from '@specforge/process';
import { ExecutionStore, openDatabase } from '@specforge/sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

// Full runs with real Git worktrees: several seconds each on Windows, more under a parallel suite.
vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
const pids: number[] = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
  for (const pid of pids.splice(0)) await killTree(pid).catch(() => undefined);
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

async function waitFor<T>(fn: () => Promise<T | undefined> | T | undefined, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function boot(appDataDir: string): Promise<{ client: ContractClient; close(): Promise<void> }> {
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({ script: () => [{ type: 'output', text: 'working…' }, { type: 'hang' }] }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { client: await connectClient(wrap(port1)), close: () => core.close() };
}

async function startStory(client: ContractClient) {
  const project = await client.command('projects.create', {
    name: 'Cancel',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-cancel-ws-')),
    folderName: 'cancel',
    initGit: true,
  });
  writeFileSync(
    join(project.path, 'spec', '04_user_stories', 'US-001.md'),
    '---\nkind: story\nid: US-001\ntitle: Long task\napproval: approved\nstatus: ready\n---\n',
  );
  await client.command('projects.openById', { projectId: project.id });
  await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
  const run = await waitFor(async () => (await client.query('runs.list', { projectId: project.id })).find((r) => r.status === 'running'));
  return { project, run };
}

describe('US-049 over IPC', () => {
  it('AC-1: cancelling a run stops it, marks it Cancelled, returns the story to Ready and frees the slot', async () => {
    const { client } = await boot(mkdtempSync(join(tmpdir(), 'sf-cancel-app-')));
    const { project, run } = await startStory(client);
    const started = Date.now();

    await expect(client.command('runs.cancel', { runId: run.id })).resolves.toEqual({ ok: true });

    expect(Date.now() - started).toBeLessThan(10_000);
    expect((await client.query('runs.list', { projectId: project.id }))[0]).toMatchObject({ id: run.id, status: 'cancelled' });
    const board = await client.query('board.get', { projectId: project.id });
    expect(board.columns.find((c) => c.status === 'ready')!.cards).toEqual([
      expect.objectContaining({ storyId: 'US-001', subState: 'none' }),
    ]);
    expect(await client.query('shell.state', {})).toMatchObject({ runs: { running: 0, queued: 0 } });
  });

  it('AC-2: lists the active runs for the close dialog; confirming interrupts them', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-cancel-app-'));
    const { client } = await boot(appData);
    const { project, run } = await startStory(client);

    expect(await client.query('runs.active', {})).toEqual([
      { runId: run.id, projectId: project.id, storyId: 'US-001', title: 'Long task' },
    ]);
    await client.command('runs.interruptAll', {});

    expect((await client.query('runs.list', { projectId: project.id }))[0]).toMatchObject({ status: 'interrupted' });
    expect(await client.query('runs.active', {})).toEqual([]);
  });

  it('AC-3: at startup non-terminal runs become Interrupted and a recorded orphan agent process is killed', async () => {
    const appData = mkdtempSync(join(tmpdir(), 'sf-cancel-app-'));
    const first = await boot(appData);
    const { project, run } = await startStory(first.client);
    await first.close();
    open.splice(0);

    // Simulate a crash: the run is still "running" in the database and its agent process is alive.
    const orphan = spawnTracked(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    pids.push(orphan.pid);
    const identity = await waitFor(() => identify(orphan.pid));
    const db = openDatabase({ dir: appData });
    const store = new ExecutionStore(db.sqlite);
    store.setRunStatus(run.id, 'running');
    store.recordProcess(run.id, identity);
    db.close();

    const second = await boot(appData);

    expect((await second.client.query('runs.list', { projectId: project.id }))[0]).toMatchObject({ id: run.id, status: 'interrupted' });
    const card = (await second.client.query('board.get', { projectId: project.id })).columns.flatMap((c) => c.cards)[0];
    expect(card).toMatchObject({ storyId: 'US-001', subState: 'interrupted', statusNotice: expect.stringMatching(/Interrupted/) });
    await waitFor(() => (!isAlive(orphan.pid) ? true : undefined), 15_000);
  });
});
