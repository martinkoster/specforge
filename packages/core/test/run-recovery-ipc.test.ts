// SPDX-License-Identifier: Apache-2.0
// US-055 integration: retry (fresh / reuse branch), resume (session) and discard (worktree cleanup) of stopped runs.
import { execFileSync } from 'node:child_process';
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

async function boot(script: (request: RunRequest, n: number) => MockStep[]) {
  let n = 0;
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-recover-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({ script: (request) => script(request, ++n) }),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  const client: ContractClient = await connectClient(wrap(port1));
  const project = await client.command('projects.create', {
    name: 'Rec',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-recover-ws-')),
    folderName: 'rec',
    initGit: true,
  });
  writeFileSync(
    join(project.path, 'spec', '04_user_stories', 'US-001.md'),
    '---\nkind: story\nid: US-001\ntitle: Login\napproval: approved\nstatus: ready\n---\n',
  );
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-am', 'story', '--allow-empty'], {
    cwd: project.path,
  });
  await client.command('projects.openById', { projectId: project.id });
  await client.command('board.move', { projectId: project.id, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
  return { client, projectId: project.id };
}

const card = async (client: ContractClient, projectId: string) =>
  (await client.query('board.get', { projectId })).columns.flatMap((c) => c.cards).find((c) => c.storyId === 'US-001')!;
const runs = (client: ContractClient, projectId: string) => client.query('runs.list', { projectId });
const RESULT: MockStep = { type: 'result', text: 'Done.\n```specforge-result\n{"outcome":"success","summary":"ok"}\n```\n' };

describe('US-055 over IPC', () => {
  it('AC-1/AC-2: a failed run offers retry; a fresh retry runs via the Scheduler on a new branch, the prior run stays in the history', async () => {
    const { client, projectId } = await boot((_r, n) => (n === 1 ? [{ type: 'fail', reason: 'Agent crashed' }] : [RESULT]));
    await vi.waitFor(async () => expect(await card(client, projectId)).toMatchObject({ subState: 'failed' }), { timeout: 30_000 });
    expect(await client.query('runs.recovery', { projectId, storyId: 'US-001' })).toMatchObject({
      resumable: true,
      gitMode: true,
      hasWorktree: true,
    });

    await expect(client.command('board.runAction', { projectId, storyId: 'US-001', action: 'retry', reuseBranch: false })).resolves.toEqual(
      { ok: true },
    );

    await vi.waitFor(async () => expect((await card(client, projectId)).status).toBe('review'), { timeout: 30_000 });
    const history = await runs(client, projectId);
    expect(history.map((r) => [r.status, r.startTrigger])).toEqual([
      ['completed', expect.stringMatching(/RetryRequested/)],
      ['failed', expect.stringMatching(/StoryAuthorised/)],
    ]);
  });

  it('AC-1/AC-2: resume continues the agent session in the same worktree', async () => {
    const seen: RunRequest[] = [];
    const { client, projectId } = await boot((request, n) => {
      seen.push(request);
      return n === 1
        ? [
            { type: 'remember', value: 'ZEBRA-42' },
            { type: 'fail', reason: 'Agent crashed' },
          ]
        : [{ type: 'recall' }, RESULT];
    });
    await vi.waitFor(async () => expect(await card(client, projectId)).toMatchObject({ subState: 'failed' }), { timeout: 30_000 });

    await expect(client.command('board.runAction', { projectId, storyId: 'US-001', action: 'resume' })).resolves.toEqual({ ok: true });

    await vi.waitFor(async () => expect((await card(client, projectId)).status).toBe('review'), { timeout: 30_000 });
    expect(seen[1]!.resumeSessionId).toBeTruthy();
    expect(seen[1]!.cwd).toBe(seen[0]!.cwd);
    const [resumed] = await runs(client, projectId);
    const output = (await client.query('runs.events', { runId: resumed!.id }))
      .filter((e) => e.type === 'output')
      .map((e) => (e.payload as { text: string }).text);
    expect(output.join('\n')).toContain('ZEBRA-42');
  });

  it('AC-3: discard returns the story to Ready and removes the worktree on request', async () => {
    const seen: RunRequest[] = [];
    const { client, projectId } = await boot((request) => {
      seen.push(request);
      return [{ type: 'fail', reason: 'Agent crashed' }];
    });
    await vi.waitFor(async () => expect(await card(client, projectId)).toMatchObject({ subState: 'failed' }), { timeout: 30_000 });
    expect(existsSync(seen[0]!.cwd)).toBe(true);

    await expect(
      client.command('board.runAction', { projectId, storyId: 'US-001', action: 'discard', removeWorktree: true }),
    ).resolves.toEqual({ ok: true });

    expect(await card(client, projectId)).toMatchObject({ status: 'ready', subState: 'none' });
    expect(existsSync(seen[0]!.cwd)).toBe(false);
    expect(await runs(client, projectId)).toHaveLength(1);
  });
});
