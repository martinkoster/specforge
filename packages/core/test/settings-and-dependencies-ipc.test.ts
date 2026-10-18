// SPDX-License-Identifier: Apache-2.0
// US-014 AC-3 (effective rules with origin, disable a global rule) and US-040 AC-1 (edit dependencies) over IPC.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { StoryDependencyService, WorkspaceIndexer } from '@specforge/application';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { IndexRepository, PermissionRuleRepository, ProjectRepository, openDatabase } from '@specforge/sqlite';
import { WorkspaceFiles } from '@specforge/workspace-fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createDependencyHandlers, createRuleHandlers } from '../src/index.js';

const open: Array<{ close(): void }> = [];
afterEach(() => {
  for (const o of open.splice(0)) o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

const story = (id: string) => `---\nkind: story\nid: ${id}\ntitle: Story ${id}\napproval: approved\nstatus: backlog\n---\nBody\n`;

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sf-ipc-ws-'));
  mkdirSync(join(root, 'spec', '04_user_stories'), { recursive: true });
  for (const id of ['US-001', 'US-002', 'US-003']) writeFileSync(join(root, 'spec', '04_user_stories', `${id}.md`), story(id));
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-ipc-db-')) });
  open.push(db);
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: root, vcsMode: 'git', baseBranch: 'main' });
  const files = new WorkspaceFiles(root);
  const index = new IndexRepository(db.sqlite);
  const indexer = new WorkspaceIndexer(files, index);
  await indexer.indexAll('p1');
  const rules = new PermissionRuleRepository(db.sqlite);
  const { port1, port2 } = new MessageChannel();
  serveContract(wrap(port2), {
    ...createRuleHandlers({ rules }),
    ...createDependencyHandlers({ service: new StoryDependencyService(files, index, indexer), index }),
  });
  const read = (id: string) => readFileSync(join(root, 'spec', '04_user_stories', `${id}.md`), 'utf8');
  return { client: await connectClient(wrap(port1)), rules, read };
}

describe('US-014 AC-3: effective rules with origin over IPC', () => {
  it('lists effective rules with origin and lets a project disable a global rule', async () => {
    const { client, rules } = await setup();
    const global = rules.create({ scope: 'global', effect: 'allow', toolName: 'Read', appliesTo: 'all', createdFrom: 'setup' });
    rules.create({
      scope: 'project',
      projectId: 'p1',
      effect: 'deny',
      toolName: 'Bash',
      pattern: 'npm publish',
      appliesTo: 'implementation',
      createdFrom: 'settings',
    });

    expect(await client.query('rules.effective', { projectId: 'p1' })).toEqual([
      { id: global.id, effect: 'allow', toolName: 'Read', pattern: null, appliesTo: 'all', origin: 'global', disabled: false },
      {
        id: expect.any(String),
        effect: 'deny',
        toolName: 'Bash',
        pattern: 'npm publish',
        appliesTo: 'implementation',
        origin: 'project',
        disabled: false,
      },
    ]);

    await client.command('rules.setGlobalDisabled', { projectId: 'p1', ruleId: global.id, disabled: true });

    expect((await client.query('rules.effective', { projectId: 'p1' }))[0]).toMatchObject({ origin: 'global', disabled: true });
  });
});

describe('US-040 AC-1: edit story dependencies over IPC', () => {
  it('lists, adds and removes dependencies; the front-matter is updated', async () => {
    const { client, read } = await setup();

    await expect(
      client.command('stories.addDependency', {
        projectId: 'p1',
        from: 'US-002',
        to: 'US-001',
        type: 'blocking',
        rationale: 'Needs login',
      }),
    ).resolves.toEqual({ ok: true });
    expect(read('US-002')).toContain('depends_on:\n  - id: US-001\n    rationale: Needs login');
    expect(await client.query('stories.dependencies', { projectId: 'p1', storyId: 'US-002' })).toEqual({
      dependencies: [{ to: 'US-001', type: 'blocking' }],
      storyIds: ['US-001', 'US-002', 'US-003'],
    });

    await expect(
      client.command('stories.addDependency', { projectId: 'p1', from: 'US-001', to: 'US-002', type: 'blocking' }),
    ).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/cycle/i),
    });

    await client.command('stories.removeDependency', { projectId: 'p1', from: 'US-002', to: 'US-001', type: 'blocking' });
    expect(read('US-002')).not.toContain('depends_on');
  });
});
