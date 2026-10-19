// SPDX-License-Identifier: Apache-2.0
// US-054 integration: execution view data over IPC (overview, paged events, full-text search).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
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

describe('US-054 over IPC', () => {
  it('lists the run with its story title, pages its events and searches its log', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-view-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      agentAdapter: new MockAdapter({
        script: () => [
          { type: 'output', text: 'Installing dependencies' },
          { type: 'output', text: 'Running the test suite' },
          { type: 'result', text: 'Done.\n```specforge-result\n{"outcome":"success","summary":"Login implemented."}\n```\n' },
        ],
      }),
    });
    open.push(core);
    const { port1, port2 } = new MessageChannel();
    serveContract(wrap(port2), core.handlers);
    const client = await connectClient(wrap(port1));

    const project = await client.command('projects.create', {
      name: 'View',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-view-ws-')),
      folderName: 'view',
      initGit: true,
    });
    writeFileSync(
      join(project.path, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: Login\napproval: approved\nstatus: ready\n---\n',
    );
    await client.command('projects.openById', { projectId: project.id });
    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });

    const [run] = await waitFor(async () => {
      const rows = await client.query('runs.overview', { projectId: project.id });
      return rows[0]?.status === 'completed' ? rows : undefined;
    });
    expect(run).toMatchObject({ storyId: 'US-001', title: 'Login', kind: 'implement', status: 'completed', pendingPrompts: 0 });

    const all = await client.query('runs.events', { runId: run!.runId! });
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(await client.query('runs.events', { runId: run!.runId!, limit: 1 })).toEqual([all[0]]);

    const output = all.filter((e) => e.type === 'output');
    const install = output.find((e) => (e.payload as { text: string }).text.startsWith('Installing'))!;
    expect(await client.query('runs.search', { runId: run!.runId!, query: 'install*' })).toEqual({
      seqs: [install.seq],
      total: all.length,
    });
    expect(await client.query('runs.search', { runId: run!.runId!, query: '  ' })).toEqual({ seqs: [], total: all.length });
  });
});
