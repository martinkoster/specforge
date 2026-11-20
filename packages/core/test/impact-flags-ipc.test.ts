// SPDX-License-Identifier: Apache-2.0
// US-086 integration (AC-5): the acceptance examples of FR-017 and FR-071 through the real index and the core.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
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

function write(root: string, rel: string, content: string) {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const REQS = (text: string) =>
  `---\nkind: requirements\napproval: approved\n---\n### FR-003: Search\n${text}\n### FR-004: Filter\nUsers filter tasks.\n`;
const story = (id: string, status: string, extra: string, ac: string) =>
  `---\nkind: story\nid: ${id}\ntitle: ${id}\napproval: approved\nstatus: ${status}\n${extra}---\n## Description\nAs a user.\n## Acceptance criteria\n- [ ] ${ac}\n`;

async function boot(): Promise<{ client: ContractClient; ws: string }> {
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-impact-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), core.handlers);
  const client = await connectClient(wrap(port1));
  const ws = mkdtempSync(join(tmpdir(), 'sf-impact-ws-'));
  write(ws, '.specforge/project.yaml', 'id: imp-1\nname: Impact\nschemaVersion: 1\n');
  write(ws, 'spec/02_requirements/functional_requirements.md', REQS('Users search tasks.'));
  write(ws, 'spec/04_user_stories/US-001.md', story('US-001', 'backlog', 'requirements: [FR-003]\n', 'Search works'));
  write(ws, 'spec/04_user_stories/US-002.md', story('US-002', 'done', '', 'Lists work'));
  write(ws, 'spec/04_user_stories/US-005.md', story('US-005', 'review', 'depends_on: [US-002]\n', 'Details work'));
  await client.command('projects.open', { path: ws });
  return { client, ws };
}

async function save(client: ContractClient, path: string, content: string) {
  const current = await client.query('artifact.read', { projectId: 'imp-1', path });
  const result = await client.command('artifact.save', { projectId: 'imp-1', path, content, expectedHash: current.hash });
  expect(result).toMatchObject({ ok: true });
}

describe('US-086 over IPC', () => {
  it('FR-017: editing FR-003 flags the story linked to it; clearing removes the flag; unrelated elements stay unflagged', async () => {
    const { client } = await boot();
    expect(await client.query('impact.flags', { projectId: 'imp-1' })).toEqual([]);

    await save(client, 'spec/02_requirements/functional_requirements.md', REQS('Users search tasks by tag.'));

    expect(await client.query('impact.flags', { projectId: 'imp-1' })).toEqual([
      {
        elementId: 'US-001',
        sourceRef: 'FR-003',
        reason: 'FR-003 changed after it was approved.',
        flaggedAt: expect.any(String),
        path: 'spec/04_user_stories/US-001.md',
        orphaned: false,
      },
    ]);
    const dashboard = await client.query('dashboard.get', { projectId: 'imp-1' });
    expect(dashboard.artifacts.flatMap((g) => g.items).find((a) => a.path === 'spec/04_user_stories/US-001.md')?.impacted).toBe(true);

    const board = await client.query('board.get', { projectId: 'imp-1' });
    const card = board.columns.flatMap((c) => c.cards).find((c) => c.storyId === 'US-001');
    expect(card?.impact).toEqual({ sourceRef: 'FR-003', reason: 'FR-003 changed after it was approved.' });
    const trace = await client.query('trace.get', { projectId: 'imp-1', target: { kind: 'element', id: 'FR-003' } });
    expect(trace.downstream.find((n) => n.id === 'US-001')?.impact).toBe('FR-003 changed after it was approved.');
    const listed = (await client.query('artifacts.list', { projectId: 'imp-1' })).flatMap((g) => g.artifacts);
    expect(listed.find((a) => a.path === 'spec/04_user_stories/US-001.md')?.impacted).toBe(true);

    // The flag survives editing the flagged story itself.
    await save(client, 'spec/04_user_stories/US-001.md', story('US-001', 'backlog', 'requirements: [FR-003]\n', 'Search by tag works'));
    expect((await client.query('impact.flags', { projectId: 'imp-1' })).map((f) => f.elementId)).toEqual(['US-001']);

    await client.command('impact.clear', { projectId: 'imp-1', elementId: 'US-001' });
    expect(await client.query('impact.flags', { projectId: 'imp-1' })).toEqual([]);
  });

  it('FR-071: editing the acceptance criteria of US-002 flags US-005 (depends on US-002) with a reference to US-002', async () => {
    const { client } = await boot();

    await save(client, 'spec/04_user_stories/US-002.md', story('US-002', 'done', '', 'Lists work offline'));

    expect(await client.query('impact.flags', { projectId: 'imp-1' })).toEqual([
      expect.objectContaining({
        elementId: 'US-005',
        sourceRef: 'US-002',
        reason: 'The description or acceptance criteria of US-002 changed.',
      }),
    ]);
  });
});
