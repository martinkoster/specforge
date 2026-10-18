// SPDX-License-Identifier: Apache-2.0
// US-017: project registry over IPC with SQLite, the workspace index and real folders.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { IndexRepository, ProjectRepository, openDatabase } from '@specforge/sqlite';
import { ProjectFolderProbe } from '@specforge/workspace-fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectHandlers } from '../src/index.js';

const open: Array<{ close(): void }> = [];
afterEach(() => {
  for (const o of open.splice(0)) o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sf-proj-'));
  mkdirSync(join(dir, '.specforge'));
  writeFileSync(join(dir, '.specforge', 'project.yaml'), 'id: P1\n');
  return dir;
}

async function setup(activeRuns: Record<string, number> = {}) {
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-reg-')) });
  open.push(db);
  const projects = new ProjectRepository(db.db);
  const index = new IndexRepository(db.sqlite);
  const path = workspace();
  await projects.create({ id: 'P1', name: 'Tasks', workspacePath: path, vcsMode: 'git', baseBranch: 'main' });
  await projects.touch('P1', '2026-10-14T09:00:00.000Z');
  index.save('P1', 'spec/01_intent/intent.md', 'h1', { kind: 'intent', approval: 'approved', elements: [], links: [], dependencies: [] });
  index.save('P1', 'spec/02_requirements/functional_requirements.md', 'h2', {
    kind: 'requirements',
    approval: 'draft',
    elements: [],
    links: [],
    dependencies: [],
  });
  const { port1, port2 } = new MessageChannel();
  serveContract(
    wrap(port2),
    createProjectHandlers({ projects, index, folders: new ProjectFolderProbe(), activeRuns: async (id) => activeRuns[id] ?? 0 }),
  );
  return { client: await connectClient(wrap(port1)), projects, path };
}

describe('US-017: project registry over IPC', () => {
  it('AC-1: lists recent projects with path, last opened and phase', async () => {
    const { client, path } = await setup();

    await expect(client.query('projects.recent', {})).resolves.toEqual([
      {
        id: 'P1',
        name: 'Tasks',
        path,
        lastOpenedAt: '2026-10-14T09:00:00.000Z',
        phase: { phase: 'requirements', state: 'awaiting_approval' },
        phaseLabel: 'Requirements · awaiting approval',
        missing: false,
      },
    ]);
  });

  it('AC-2: renames and removes projects; removal is blocked while runs are active', async () => {
    const busy = await setup({ P1: 1 });
    await busy.client.command('projects.rename', { projectId: 'P1', name: 'Tasks v2' });
    expect((await busy.projects.get('P1'))?.name).toBe('Tasks v2');
    await expect(busy.client.command('projects.remove', { projectId: 'P1' })).rejects.toMatchObject({ code: 'RUNS_ACTIVE' });

    const idle = await setup();
    await idle.client.command('projects.remove', { projectId: 'P1' });
    expect(await idle.projects.get('P1')).toBeUndefined();
  });

  it('AC-3: a missing folder is flagged and can be located', async () => {
    const { client, path, projects } = await setup();
    rmSync(path, { recursive: true, force: true });

    expect((await client.query('projects.recent', {}))[0]).toMatchObject({ missing: true, phase: null });

    const moved = workspace();
    await client.command('projects.locate', { projectId: 'P1', path: moved });
    expect((await projects.get('P1'))?.workspacePath).toBe(moved);
    await expect(client.command('projects.locate', { projectId: 'P1', path: tmpdir() })).rejects.toMatchObject({ code: 'NOT_A_PROJECT' });
  });
});
