// SPDX-License-Identifier: Apache-2.0
// US-035 integration: epics list with coverage strip, create, merge, split, reorder, delete and approve all over IPC.
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
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

describe('US-035 over IPC', () => {
  it('AC-2..AC-4: coverage strip, epic operations and approving the epic structure', async () => {
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-epics-app-')),
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
    const project = await client.command('projects.create', {
      name: 'E',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-epics-ws-')),
      folderName: 'e',
      initGit: false,
    });
    const ws = project.path;
    writeFileSync(
      join(ws, 'spec', '02_requirements', 'functional_requirements.md'),
      '---\nkind: requirements\n---\n### FR-001: Login\n**Priority**: Must Have\n### FR-002: Profile\n**Priority**: Must Have\n### FR-003: Export\n**Priority**: Could Have\n',
    );
    mkdirSync(join(ws, 'spec', '04_user_stories', 'epics'), { recursive: true });
    writeFileSync(
      join(ws, 'spec', '04_user_stories', 'epics', 'EP-001-login.md'),
      '---\nkind: epic\nid: EP-001\ntitle: Login\napproval: draft\nrequirements: [FR-001]\n---\n## Goal\n',
    );
    const story = (id: string, epic: string) =>
      `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: draft\nstatus: backlog\nepic: ${epic}\n---\n`;
    writeFileSync(join(ws, 'spec', '04_user_stories', 'US-001.md'), story('US-001', 'EP-001'));
    writeFileSync(join(ws, 'spec', '04_user_stories', 'US-002.md'), story('US-002', 'EP-001'));
    await client.command('projects.openById', { projectId: project.id });

    let list = await client.query('epics.list', { projectId: project.id });
    expect(list.uncovered).toEqual(['FR-002']);
    expect(list.epics).toEqual([expect.objectContaining({ id: 'EP-001', stories: ['US-001', 'US-002'], requirements: ['FR-001'] })]);

    await expect(client.command('epics.create', { projectId: project.id, title: 'Profile' })).resolves.toEqual({
      id: 'EP-002',
      path: 'spec/04_user_stories/epics/EP-002-profile.md',
    });
    await expect(
      client.command('epics.split', { projectId: project.id, epicId: 'EP-001', storyIds: ['US-002'], title: 'Remember me' }),
    ).resolves.toMatchObject({ id: 'EP-003' });
    await client.command('epics.reorder', { projectId: project.id, epicIds: ['EP-003', 'EP-001', 'EP-002'] });
    list = await client.query('epics.list', { projectId: project.id });
    expect(list.epics.map((e) => [e.id, e.stories])).toEqual([
      ['EP-003', ['US-002']],
      ['EP-001', ['US-001']],
      ['EP-002', []],
    ]);

    await client.command('epics.merge', { projectId: project.id, sourceId: 'EP-003', targetId: 'EP-001' });
    expect(readFileSync(join(ws, 'spec', '04_user_stories', 'US-002.md'), 'utf8')).toContain('epic: EP-001');
    await client.command('epics.delete', { projectId: project.id, epicId: 'EP-001' });
    expect(readFileSync(join(ws, 'spec', '04_user_stories', 'US-001.md'), 'utf8')).not.toContain('epic:');
    expect(existsSync(join(ws, 'spec', '04_user_stories', 'epics', 'EP-001-login.md'))).toBe(false);

    // US-039: lanes with derived status; moving a story into another lane writes its epic.
    let board = await client.query('board.get', { projectId: project.id });
    expect(board.lanes?.map((l) => [l.epicId, l.title, l.status])).toEqual([
      ['EP-002', 'Profile', 'not_started'],
      [null, 'No epic', 'not_started'],
    ]);
    await client.command('stories.setEpic', { projectId: project.id, storyId: 'US-001', epicId: 'EP-002' });
    board = await client.query('board.get', { projectId: project.id });
    expect(board.columns.flatMap((c) => c.cards).find((c) => c.storyId === 'US-001')?.epicId).toBe('EP-002');
    expect(readFileSync(join(ws, 'spec', '04_user_stories', 'US-001.md'), 'utf8')).toContain('epic: EP-002');

    await expect(client.command('epics.approveAll', { projectId: project.id })).resolves.toEqual({ approved: ['EP-002'] });
    list = await client.query('epics.list', { projectId: project.id });
    expect(list.epics).toEqual([expect.objectContaining({ id: 'EP-002', approval: 'approved' })]);
    expect(list.uncovered).toEqual(['FR-001', 'FR-002']);
  });
});
