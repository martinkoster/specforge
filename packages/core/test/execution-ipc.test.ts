// SPDX-License-Identifier: Apache-2.0
// US-048 integration: runs execute through the core with the MockAdapter — worktree (git) or in place (non-git),
// persisted events, story transitions.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { SecretStore } from '@specforge/application';
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

const values = new Map<string, string>();
const secrets: SecretStore = {
  set: async (k, v) => void values.set(k, v),
  get: async (k) => values.get(k),
  delete: async (k) => void values.delete(k),
};

async function boot(script: (prompt: string) => MockStep[]) {
  const appDataDir = mkdtempSync(join(tmpdir(), 'sf-exec-app-'));
  const core = await createCore({
    appDataDir,
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    secrets,
    agentAdapter: new MockAdapter({ script: (request) => script(request.prompt) }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  return { client: await connectClient(wrap(port1)), appDataDir };
}

const story = (id: string, status = 'ready') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: ${status}\n---\n## Description\nBuild ${id}.\n`;

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function createProject(client: ContractClient, initGit: boolean) {
  const project = await client.command('projects.create', {
    name: 'Exec',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-exec-ws-')),
    folderName: 'exec',
    initGit,
  });
  writeFileSync(join(project.path, 'spec', '04_user_stories', 'US-001.md'), story('US-001'));
  await client.command('projects.openById', { projectId: project.id });
  return project;
}

const runOf = async (client: ContractClient, projectId: string, status: string) =>
  (await client.query('runs.list', { projectId })).find((r) => r.status === status);

describe('US-048 over IPC with the MockAdapter', () => {
  it('AC-1/AC-2/AC-4 (git): the run executes in a worktree, events are persisted, the story moves to Review with its branch', async () => {
    const prompts: string[] = [];
    const { client, appDataDir } = await boot((prompt) => {
      prompts.push(prompt);
      return [
        { type: 'output', text: 'Implementing…' },
        { type: 'result', text: 'Implemented US-001.\n```specforge-result\n{"outcome":"success","summary":"Implemented."}\n```\n' },
      ];
    });
    const project = await createProject(client, true);

    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(() => runOf(client, project.id, 'completed'));

    expect(run).toMatchObject({ storyId: 'US-001', kind: 'implement', failureReason: null });
    expect(prompts[0]).toContain('Build US-001.');
    const events = await client.query('runs.events', { runId: run.id });
    expect(events.map((e) => e.type)).toEqual(['session', 'output', 'output']);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    const file = readFileSync(join(project.path, 'spec', '04_user_stories', 'US-001.md'), 'utf8');
    expect(file).toContain('status: review');
    expect(file).toContain('branch: specforge/US-001');
    expect(existsSync(join(appDataDir, 'wt', project.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8), 'US-001'))).toBe(true);
    const board = await client.query('board.get', { projectId: project.id });
    expect(board.columns.find((c) => c.status === 'review')!.cards).toEqual([
      expect.objectContaining({ storyId: 'US-001', subState: 'none' }),
    ]);
    expect(await client.query('shell.state', {})).toMatchObject({ runs: { running: 0, queued: 0 } });
  });

  it('AC-4: a failed run keeps the story In Progress (Failed) with the reason', async () => {
    const { client } = await boot(() => [{ type: 'fail', reason: 'The agent crashed.' }]);
    const project = await createProject(client, true);

    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(() => runOf(client, project.id, 'failed'));

    expect(run.failureReason).toBe('The agent crashed.');
    const card = (await client.query('board.get', { projectId: project.id })).columns.find((c) => c.status === 'in_progress')!.cards[0];
    expect(card).toMatchObject({ storyId: 'US-001', subState: 'failed', statusNotice: 'Failed: The agent crashed.' });
  });

  it('AC-1 (non-git): the run works in place after a snapshot', async () => {
    const { client, appDataDir } = await boot(() => [
      { type: 'result', text: 'ok\n```specforge-result\n{"outcome":"success","summary":"ok"}\n```\n' },
    ]);
    const project = await createProject(client, false);

    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await waitFor(() => runOf(client, project.id, 'completed'));

    expect(readFileSync(join(project.path, 'spec', '04_user_stories', 'US-001.md'), 'utf8')).toContain('status: review');
    // A snapshot of the workspace was taken before the run (ADR-011).
    expect(existsSync(join(appDataDir, 'snapshots', project.id))).toBe(true);
  });
});

describe('US-051 over IPC', () => {
  it('AC-1..AC-3: the parsed result, the computed changes and recommendations are available after the run', async () => {
    const { client } = await boot(() => [
      { type: 'tool', toolName: 'Write', input: { file_path: 'src/feature.ts', content: 'export const a = 1;\nexport const b = 2;\n' } },
      {
        type: 'result',
        text: 'Done.\n```specforge-result\n{"outcome":"success","summary":"Feature added.","tests":{"run":2,"passed":2,"failed":0},"recommendations":[{"type":"follow_up","text":"Document the feature"}]}\n```\n',
      },
    ]);
    // Edits inside the run's workspace are allowed without asking.
    await client.command('setup.enableRules', { keys: ['edit-in-workspace'] });
    const project = await createProject(client, true);

    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(() => runOf(client, project.id, 'completed'));

    expect(await client.query('runs.result', { runId: run.id })).toEqual({
      result: expect.objectContaining({ outcome: 'success', summary: 'Feature added.', tests: { run: 2, passed: 2, failed: 0 } }),
      unavailableReason: null,
      computedFiles: [{ path: 'src/feature.ts', change: 'A', additions: 2, deletions: 0 }],
    });
    expect(await client.query('pending.list', { projectId: project.id })).toEqual([
      expect.objectContaining({
        storyId: 'US-001',
        items: expect.arrayContaining([expect.objectContaining({ kind: 'recommendation', detail: 'Document the feature' })]),
      }),
    ]);
  });

  it('AC-2 (non-git): changes come from the snapshot diff', async () => {
    const { client } = await boot(() => [
      { type: 'tool', toolName: 'Write', input: { file_path: 'notes.txt', content: 'one\n' } },
      { type: 'result', text: 'No block.' },
    ]);
    await client.command('setup.enableRules', { keys: ['edit-in-workspace'] });
    const project = await createProject(client, false);

    await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(() => runOf(client, project.id, 'completed_no_result'));

    expect(await client.query('runs.result', { runId: run.id })).toEqual({
      result: null,
      unavailableReason: 'The agent did not report a structured result.',
      computedFiles: expect.arrayContaining([{ path: 'notes.txt', change: 'A', additions: 1, deletions: 0 }]),
    });
  });
});
