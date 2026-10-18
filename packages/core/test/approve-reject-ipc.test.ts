// SPDX-License-Identifier: Apache-2.0
// US-058 integration: approve (Done, merge instructions, dependents start) and reject (Ready, rejected branch / restore).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
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

const story = (id: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: ready\n${extra}---\n`;

async function boot(initGit: boolean) {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-approve-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: new MockAdapter({
      script: () => [
        { type: 'tool', toolName: 'Write', input: { file_path: 'src/app.ts', content: 'changed by the run\n' } },
        { type: 'result', text: 'Done.\n```specforge-result\n{"outcome":"success","summary":"ok"}\n```\n' },
      ],
    }),
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
    name: 'A',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-approve-ws-')),
    folderName: 'a',
    initGit,
  });
  writeFileSync(join(project.path, 'src.txt'), '');
  writeFileSync(join(project.path, 'spec', '04_user_stories', 'US-001.md'), story('US-001'));
  writeFileSync(join(project.path, 'spec', '04_user_stories', 'US-002.md'), story('US-002', 'depends_on: [US-001]\n'));
  await client.command('projects.openById', { projectId: project.id });
  return { client, projectId: project.id, workspace: project.path };
}

const cards = async (client: ContractClient, projectId: string) =>
  Object.fromEntries((await client.query('board.get', { projectId })).columns.flatMap((c) => c.cards).map((c) => [c.storyId, c]));

async function inReview(client: ContractClient, projectId: string, storyId: string) {
  await vi.waitFor(async () => expect((await cards(client, projectId))[storyId]?.status).toBe('review'), { timeout: 30_000 });
}

describe('US-058 over IPC', () => {
  it('AC-1/AC-3 (git): approve → Done with merge instructions; the queued dependent starts', async () => {
    const { client, projectId } = await boot(true);
    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await client.command('board.move', { projectId, storyId: 'US-002', to: 'in_progress', beforeStoryId: null });
    await inReview(client, projectId, 'US-001');
    expect((await cards(client, projectId))['US-002']).toMatchObject({ subState: 'queued', queueReason: 'dependency' });

    const approved = await client.command('review.approve', { projectId, storyId: 'US-001' });
    expect(approved).toEqual({
      ok: true,
      merge: { baseBranch: expect.any(String), order: [{ storyId: 'US-001', branch: 'specforge/US-001' }] },
    });
    expect((await cards(client, projectId))['US-001']).toMatchObject({ status: 'done' });
    await inReview(client, projectId, 'US-002');
  });

  it('AC-2 (git): reject with reason → Ready, the branch is marked rejected', async () => {
    const { client, projectId } = await boot(true);
    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await inReview(client, projectId, 'US-001');

    await expect(client.command('review.reject', { projectId, storyId: 'US-001', reason: 'Wrong approach' })).resolves.toEqual({
      ok: true,
    });

    expect((await cards(client, projectId))['US-001']).toMatchObject({ status: 'ready', statusNotice: 'Rejected: Wrong approach' });
    expect(await client.query('review.rejectedBranches', { projectId, storyId: 'US-001' })).toEqual(['specforge/US-001']);
  });

  it('AC-2 (non-git): reject can restore the files the run changed from the pre-run snapshot', async () => {
    const { client, projectId, workspace } = await boot(false);
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(join(workspace, 'src', 'app.ts'), 'original\n');
    await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
    await inReview(client, projectId, 'US-001');
    expect(readFileSync(join(workspace, 'src', 'app.ts'), 'utf8')).toBe('changed by the run\n');

    await expect(client.command('review.reject', { projectId, storyId: 'US-001', restoreSnapshot: true })).resolves.toEqual({ ok: true });

    expect(readFileSync(join(workspace, 'src', 'app.ts'), 'utf8')).toBe('original\n');
    expect(existsSync(join(workspace, 'src.txt'))).toBe(true);
    expect((await cards(client, projectId))['US-001']).toMatchObject({ status: 'ready' });
  });
});
