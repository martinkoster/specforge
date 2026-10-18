// SPDX-License-Identifier: Apache-2.0
// US-040 AC-1: add/remove dependencies through the StoryDependencyService; the story front-matter is updated.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoryDependencyService, WorkspaceIndexer } from '@specforge/application';
import { IndexRepository, ProjectRepository, openDatabase, type OpenDatabase } from '@specforge/sqlite';
import { WorkspaceFiles } from '@specforge/workspace-fs';
import { afterEach, describe, expect, it } from 'vitest';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const story = (id: string, extra = '') =>
  [
    '---',
    'kind: story',
    `id: ${id}`,
    `title: Story ${id}`,
    'approval: approved',
    'status: backlog',
    '# keep this comment',
    extra,
    '---',
    '## Description',
    `Body of ${id}.`,
    '',
  ]
    .filter((l) => l !== '')
    .join('\n') + '\n';

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sf-dep-ws-'));
  mkdirSync(join(root, 'spec', '04_user_stories'), { recursive: true });
  for (const id of ['US-001', 'US-002', 'US-003']) writeFileSync(join(root, 'spec', '04_user_stories', `${id}.md`), story(id));
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-dep-db-')) });
  opened.push(db);
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: root, vcsMode: 'git', baseBranch: 'main' });
  const files = new WorkspaceFiles(root);
  const index = new IndexRepository(db.sqlite);
  const indexer = new WorkspaceIndexer(files, index);
  await indexer.indexAll('p1');
  const service = new StoryDependencyService(files, index, indexer);
  const read = (id: string) => readFileSync(join(root, 'spec', '04_user_stories', `${id}.md`), 'utf8');
  return { service, index, read };
}

describe('US-040 AC-1: add and remove dependencies, front-matter updated', () => {
  it('adds a blocking dependency with rationale and a related dependency', async () => {
    const { service, index, read } = await setup();

    await expect(
      service.add('p1', { from: 'US-002', to: 'US-001', type: 'blocking', rationale: 'Needs the login endpoint' }),
    ).resolves.toEqual({ ok: true });
    await expect(service.add('p1', { from: 'US-002', to: 'US-003', type: 'related' })).resolves.toEqual({ ok: true });

    const content = read('US-002');
    expect(content).toContain('depends_on:\n  - id: US-001\n    rationale: Needs the login endpoint');
    expect(content).toContain('related_to:\n  - US-003');
    expect(content).toContain('# keep this comment');
    expect(content).toContain('## Description\nBody of US-002.');
    expect(index.dependencies('p1')).toEqual(
      expect.arrayContaining([
        { from: 'US-002', to: 'US-001', type: 'blocking' },
        { from: 'US-002', to: 'US-003', type: 'related' },
      ]),
    );
  });

  it('adds a blocking dependency without rationale as a plain id', async () => {
    const { service, read } = await setup();

    await service.add('p1', { from: 'US-003', to: 'US-002', type: 'blocking' });

    expect(read('US-003')).toContain('depends_on:\n  - US-002');
  });

  it('removes dependencies again', async () => {
    const { service, index, read } = await setup();
    await service.add('p1', { from: 'US-002', to: 'US-001', type: 'blocking', rationale: 'x' });
    await service.add('p1', { from: 'US-002', to: 'US-003', type: 'related' });

    await expect(service.remove('p1', { from: 'US-002', to: 'US-001', type: 'blocking' })).resolves.toEqual({ ok: true });
    await service.remove('p1', { from: 'US-002', to: 'US-003', type: 'related' });

    expect(read('US-002')).not.toMatch(/depends_on|related_to/);
    expect(index.dependencies('p1')).toEqual([]);
  });

  it('refuses invalid dependencies without touching the file', async () => {
    const { service, read } = await setup();
    await service.add('p1', { from: 'US-002', to: 'US-001', type: 'blocking' });
    const before = read('US-001');

    await expect(service.add('p1', { from: 'US-001', to: 'US-002', type: 'blocking' })).resolves.toEqual({
      ok: false,
      reason: 'Dependency cycle: US-001 → US-002 → US-001.',
    });
    await expect(service.add('p1', { from: 'US-001', to: 'US-099', type: 'blocking' })).resolves.toEqual({
      ok: false,
      reason: 'Unknown story US-099.',
    });
    expect(read('US-001')).toBe(before);
  });

  it('reports removing a dependency that does not exist', async () => {
    const { service } = await setup();

    await expect(service.remove('p1', { from: 'US-002', to: 'US-001', type: 'blocking' })).resolves.toEqual({
      ok: false,
      reason: 'US-002 does not depend on US-001.',
    });
  });
});
