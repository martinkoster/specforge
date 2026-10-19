// SPDX-License-Identifier: Apache-2.0
// US-056 integration: in non-git mode writing spec runs and implementation runs exclude each other; implementation runs
// in worktrees cannot change spec/** and worktrees are never indexed.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { RunRequest } from '@specforge/application';
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

const STORY = '---\nkind: story\nid: US-001\ntitle: Story\napproval: approved\nstatus: ready\n---\n# US-001\n';

async function boot(initGit: boolean, script: (request: RunRequest) => MockStep[]) {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-excl-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({ script }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  const client: ContractClient = await connectClient(wrap(port1));
  client.subscribe(
    'permission.requested',
    (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
  );
  const project = await client.command('projects.create', {
    name: 'Excl',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-excl-ws-')),
    folderName: 'excl',
    initGit,
  });
  writeFileSync(join(project.path, 'spec', '04_user_stories', 'US-001.md'), STORY);
  await client.command('projects.openById', { projectId: project.id });
  return { client, projectId: project.id, workspace: project.path };
}

const card = async (client: ContractClient, projectId: string) =>
  (await client.query('board.get', { projectId })).columns.flatMap((c) => c.cards).find((c) => c.storyId === 'US-001')!;

describe('US-056 over IPC', () => {
  it('AC-1 (non-git): an implementation run waits for the workspace while a spec run writes, then starts', async () => {
    const { client, projectId } = await boot(false, (request) =>
      request.kind === 'generate'
        ? [
            { type: 'delay', ms: 2_000 },
            { type: 'result', text: 'Generated.' },
          ]
        : [{ type: 'result', text: 'Implemented.' }],
    );
    const spec = (await client.command('specs.generate', { projectId, target: 'requirements', instruction: 'Go' })) as { runId: string };

    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });

    expect(await card(client, projectId)).toMatchObject({ status: 'in_progress', subState: 'queued', queueReason: 'workspace' });
    expect((await client.query('runs.list', { projectId })).filter((r) => r.kind === 'implement')).toEqual([]);

    await waitFor(async () => ((await client.query('specs.review', { runId: spec.runId }))?.state === 'open' ? true : undefined));
    const impl = await waitFor(async () => (await client.query('runs.list', { projectId })).find((r) => r.kind === 'implement'));
    expect(impl.startTrigger).toBeTruthy();
    await waitFor(async () => ((await card(client, projectId)).status === 'review' ? true : undefined));
  });

  it('AC-2 (non-git): a spec run cannot start while an implementation run is active', async () => {
    const { client, projectId } = await boot(false, () => [{ type: 'hang' }]);
    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await waitFor(async () => (await client.query('runs.list', { projectId })).find((r) => r.status === 'running'));

    await expect(client.command('specs.generate', { projectId, target: 'requirements', instruction: 'Go' })).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/implementation run is changing the shared workspace/),
    });
  });

  it('AC-3 (git): an implementation run in its worktree cannot edit spec/**; the worktree is not indexed', async () => {
    const { client, projectId, workspace } = await boot(true, () => [
      {
        type: 'tool',
        toolName: 'Write',
        input: { file_path: 'spec/04_user_stories/US-002.md', content: STORY.replaceAll('US-001', 'US-002') },
      },
      { type: 'tool', toolName: 'Write', input: { file_path: 'src/app.ts', content: 'export {};\n' } },
      { type: 'result', text: 'Done.' },
    ]);
    const before = await client.query('artifacts.list', { projectId });

    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    const run = await waitFor(async () => (await client.query('runs.list', { projectId })).find((r) => r.status.startsWith('completed')));

    const results = (await client.query('runs.events', { runId: run.id })).filter((e) => e.type === 'tool_result');
    expect(results.map((e) => (e.payload as { isError: boolean }).isError)).toEqual([true, false]);
    const result = await client.query('runs.result', { runId: run.id });
    expect(result?.computedFiles.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(await client.query('artifacts.list', { projectId })).toEqual(before);
    expect(existsSync(join(workspace, 'spec', '04_user_stories', 'US-002.md'))).toBe(false);
  });
});
