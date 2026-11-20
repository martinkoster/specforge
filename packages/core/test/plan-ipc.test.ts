// SPDX-License-Identifier: Apache-2.0
// US-101..US-103 over IPC with the scripted agent: derived epic dependencies in lane headers (FR-097), Start epic with
// 3 runs and 1 queued (FR-098), implementation waves and critical path (FR-084).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';
import { createTestAgent } from '../src/test-agent.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

const story = (id: string, epic: string, status: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: Work on ${id}\napproval: approved\nstatus: ${status}\nsize: S\nepic: ${epic}\nrequirements: [FR-001]\n${extra}---\n## Acceptance criteria\n- [ ] Works.\n`;
const epic = (id: string, title: string) => `---\nkind: epic\nid: ${id}\ntitle: ${title}\napproval: approved\n---\n## Goal\n${title}.\n`;

async function boot(files: Record<string, string>): Promise<{ client: ContractClient; projectId: string }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-plan-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: createTestAgent(),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  const client = await connectClient(wrap(port1));
  client.subscribe(
    'permission.requested',
    (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
  );
  const project = await client.command('projects.create', {
    name: 'Plan',
    path: join(mkdtempSync(join(tmpdir(), 'sf-plan-ws-')), 'p'),
    initGit: true,
  });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(project.path, ...rel.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  await client.command('projects.openById', { projectId: project.id });
  return { client, projectId: project.id };
}

async function until<T>(fn: () => Promise<T | undefined>): Promise<T> {
  for (let i = 0; i < 1200; i++) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timeout');
}

const S = 'spec/04_user_stories';

describe('US-101/US-103 over IPC', () => {
  it('FR-097: EP-002 depends on EP-001 in the lane header; FR-084: waves and critical path', async () => {
    const { client, projectId } = await boot({
      [`${S}/epics/EP-001.md`]: epic('EP-001', 'Accounts'),
      [`${S}/epics/EP-002.md`]: epic('EP-002', 'Tasks'),
      [`${S}/US-003.md`]: story('US-003', 'EP-001', 'backlog'),
      [`${S}/US-012.md`]: story('US-012', 'EP-002', 'backlog', 'depends_on: [US-003]\n'),
      [`${S}/US-013.md`]: story('US-013', 'EP-002', 'backlog', 'depends_on: [US-012]\n'),
      [`${S}/US-020.md`]: story('US-020', 'EP-002', 'backlog'),
    });
    const board = await client.query('board.get', { projectId });
    expect(board.lanes?.find((l) => l.epicId === 'EP-002')?.dependsOn).toEqual(['EP-001']);
    const plan = await client.query('plan.get', { projectId });
    expect(plan.waves.map((w) => w.stories.map((s) => s.id))).toEqual([['US-003', 'US-020'], ['US-012'], ['US-013']]);
    expect(plan.criticalPath).toEqual(['US-003', 'US-012', 'US-013']);
    expect(plan.epicEdges).toEqual([{ from: 'EP-002', to: 'EP-001' }]);
  });
});

describe('US-102 over IPC', () => {
  it('FR-098: Start epic with 4 Ready stories (one depending on another) starts 3 runs and queues 1', async () => {
    const { client, projectId } = await boot({
      [`${S}/epics/EP-001.md`]: epic('EP-001', 'Accounts'),
      [`${S}/US-001.md`]: story('US-001', 'EP-001', 'ready'),
      [`${S}/US-002.md`]: story('US-002', 'EP-001', 'ready'),
      [`${S}/US-003.md`]: story('US-003', 'EP-001', 'ready'),
      [`${S}/US-004.md`]: story('US-004', 'EP-001', 'ready', 'depends_on: [US-001]\n'),
      [`${S}/US-005.md`]: story('US-005', 'EP-001', 'backlog'),
    });
    expect(await client.query('board.startEpicPreview', { projectId, epicId: 'EP-001' })).toEqual({
      start: ['US-001', 'US-002', 'US-003', 'US-004'],
      skipped: [{ storyId: 'US-005', status: 'backlog' }],
    });
    const result = await client.command('board.startEpic', { projectId, epicId: 'EP-001' });
    expect(result).toMatchObject({ started: ['US-001', 'US-002', 'US-003', 'US-004'], failed: [] });

    const runs = await until(async () => {
      const list = await client.query('runs.list', { projectId });
      return list.length >= 3 ? list : undefined;
    });
    expect(runs.map((r) => r.storyId).sort()).toEqual(['US-001', 'US-002', 'US-003']);
    const board = await client.query('board.get', { projectId });
    const us4 = board.columns.flatMap((c) => c.cards).find((c) => c.storyId === 'US-004')!;
    expect(us4).toMatchObject({ status: 'in_progress', subState: 'queued', queueReason: 'dependency' });
    // Let the runs finish before the core closes (worktrees are cleaned up on close).
    await until(async () => ((await client.query('runs.list', { projectId })).every((r) => r.status === 'completed') ? true : undefined));
  });
});
