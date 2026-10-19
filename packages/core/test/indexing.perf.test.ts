// SPDX-License-Identifier: Apache-2.0
// Integration of WorkspaceIndexer (application) + WorkspaceFiles (workspace-fs) + IndexRepository (sqlite).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceIndexer } from '@specforge/application';
import { IndexRepository, ProjectRepository, openDatabase, type OpenDatabase } from '@specforge/sqlite';
import { WorkspaceFiles } from '@specforge/workspace-fs';
import { afterEach, describe, expect, it } from 'vitest';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function write(root: string, rel: string, content: string) {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const story = (n: number, deps: number[] = []) =>
  [
    '---',
    'kind: story',
    `id: US-${String(n).padStart(4, '0')}`,
    `title: Story ${n}`,
    'approval: approved',
    'status: backlog',
    'size: S',
    `epic: EP-${String((n % 10) + 1).padStart(3, '0')}`,
    `depends_on: [${deps.map((d) => `US-${String(d).padStart(4, '0')}`).join(', ')}]`,
    'requirements: [FR-001, FR-002]',
    '---',
    '## Description',
    `Story number ${n} implements UC-001.`,
  ].join('\n');

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sf-ws-'));
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-idx-db-')) });
  opened.push(db);
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: root, vcsMode: 'git', baseBranch: 'main' });
  const files = new WorkspaceFiles(root);
  const store = new IndexRepository(db.sqlite);
  const indexer = new WorkspaceIndexer(files, store);
  return { root, db, files, store, indexer };
}

const count = (db: OpenDatabase, table: string) => (db.sqlite.prepare(`select count(*) n from ${table}`).get() as { n: number }).n;

describe('US-020 AC-2 (performance): full index of 1,000 stories', () => {
  it('indexes 1,000 stories in under 2 seconds', async () => {
    const { root, db, indexer } = await setup();
    for (let n = 1; n <= 1000; n++) write(root, `spec/04_user_stories/US-${n}.md`, story(n, n > 1 ? [n - 1] : []));
    write(root, 'spec/02_requirements/functional_requirements.md', '---\nkind: requirements\n---\n### FR-001: A\n### FR-002: B\n');

    const t0 = performance.now();
    const result = await indexer.indexAll('p1');
    const ms = performance.now() - t0;

    expect(result).toEqual({ indexed: 1001, invalid: 0, removed: 0 });
    expect(count(db, 'story')).toBe(1000);
    expect(count(db, 'story_dependency')).toBe(999);
    expect(count(db, 'element')).toBe(1002);
    expect(ms).toBeLessThan(2000);
  }, 30_000);
});
