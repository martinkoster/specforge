// SPDX-License-Identifier: Apache-2.0
// Integration of WorkspaceIndexer (application) + WorkspaceFiles (workspace-fs) + IndexRepository (sqlite).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceIndexer } from '@specforge/application';
import { IndexRepository, ProjectRepository, openDatabase, type OpenDatabase } from '@specforge/sqlite';
import { ContentConflictError, WorkspaceFiles, contentHash } from '@specforge/workspace-fs';
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

describe('US-020 AC-2: fast full index and invalid files keep their last valid state', () => {
  it('marks a broken file invalid with the error and keeps its previously indexed elements', async () => {
    const { root, db, indexer } = await setup();
    write(root, 'spec/04_user_stories/US-1.md', story(1));
    await indexer.indexAll('p1');

    write(root, 'spec/04_user_stories/US-1.md', '---\nkind: story\nid: US-0001\ntitle: [broken\n---\n');
    const result = await indexer.reindex('p1', 'spec/04_user_stories/US-1.md');

    expect(result).toEqual({ status: 'invalid', error: expect.stringMatching(/./) });
    const artifact = db.sqlite
      .prepare('select parse_state, parse_error from artifact where path = ?')
      .get('spec/04_user_stories/US-1.md') as {
      parse_state: string;
      parse_error: string;
    };
    expect(artifact.parse_state).toBe('invalid');
    expect(artifact.parse_error.length).toBeGreaterThan(0);
    expect(db.sqlite.prepare('select title from story where story_id = ?').get('US-0001')).toEqual({ title: 'Story 1' });
  });

  it('removes index entries of deleted files on a full index', async () => {
    const { root, db, files, indexer } = await setup();
    write(root, 'spec/04_user_stories/US-1.md', story(1));
    write(root, 'spec/04_user_stories/US-2.md', story(2, [1]));
    await indexer.indexAll('p1');

    await files.remove('spec/04_user_stories/US-2.md');
    const result = await indexer.indexAll('p1');

    expect(result).toEqual({ indexed: 1, invalid: 0, removed: 1 });
    expect(count(db, 'story')).toBe(1);
    expect(count(db, 'story_dependency')).toBe(0);
  });

  it('removes an artifact on reindex when its file was deleted', async () => {
    const { root, db, files, indexer } = await setup();
    write(root, 'spec/04_user_stories/US-1.md', story(1));
    await indexer.indexAll('p1');

    await files.remove('spec/04_user_stories/US-1.md');

    await expect(indexer.reindex('p1', 'spec/04_user_stories/US-1.md')).resolves.toEqual({ status: 'removed' });
    expect(count(db, 'story')).toBe(0);
    expect(count(db, 'artifact')).toBe(0);
  });

  it('stores trace links per artifact and replaces them on reindex', async () => {
    const { root, db, indexer } = await setup();
    write(root, 'spec/04_user_stories/US-1.md', story(1));
    await indexer.indexAll('p1');
    expect(count(db, 'trace_link')).toBeGreaterThan(0);

    write(root, 'spec/04_user_stories/US-1.md', '---\nkind: story\nid: US-0001\ntitle: Story 1\nstatus: backlog\n---\nNo references.\n');
    await indexer.reindex('p1', 'spec/04_user_stories/US-1.md');

    expect(count(db, 'trace_link')).toBe(0);
  });
});

describe('US-020 AC-3: atomic writes with optimistic concurrency', () => {
  it('writes atomically when the expected hash matches and leaves no temp files', async () => {
    const { root, files } = await setup();
    write(root, 'spec/01_intent/intent.md', 'v1');

    const hash = await files.writeAtomic('spec/01_intent/intent.md', 'v2', { expectedHash: contentHash('v1') });

    expect(readFileSync(join(root, 'spec', '01_intent', 'intent.md'), 'utf8')).toBe('v2');
    expect(hash).toBe(contentHash('v2'));
    expect(readdirSync(join(root, 'spec', '01_intent'))).toEqual(['intent.md']);
  });

  it('rejects a write when the file changed since it was read', async () => {
    const { root, files } = await setup();
    write(root, 'spec/01_intent/intent.md', 'changed externally');

    await expect(files.writeAtomic('spec/01_intent/intent.md', 'mine', { expectedHash: contentHash('original') })).rejects.toBeInstanceOf(
      ContentConflictError,
    );
    expect(readFileSync(join(root, 'spec', '01_intent', 'intent.md'), 'utf8')).toBe('changed externally');
  });

  it('creates new files when no file is expected', async () => {
    const { root, files } = await setup();

    await files.writeAtomic('spec/03_design/new.md', 'new', { expectedHash: null });

    expect(readFileSync(join(root, 'spec', '03_design', 'new.md'), 'utf8')).toBe('new');
    await expect(files.writeAtomic('spec/03_design/new.md', 'again', { expectedHash: null })).rejects.toBeInstanceOf(ContentConflictError);
  });

  it('refuses paths outside the workspace', async () => {
    const { files } = await setup();
    await expect(files.writeAtomic('../escape.md', 'x', { expectedHash: null })).rejects.toThrow(/outside the workspace/);
  });
});

describe('US-020 AC-4: only the main workspace is indexed', () => {
  it('ignores git worktrees, configured worktree roots and generated folders inside the workspace', async () => {
    const { root, db, indexer } = await setup();
    write(root, 'spec/04_user_stories/US-1.md', story(1));
    write(root, 'wt/US-0002/.git', 'gitdir: /repo/.git/worktrees/US-0002');
    write(root, 'wt/US-0002/spec/04_user_stories/US-1.md', story(1).replace('Story 1', 'Worktree copy'));
    write(root, 'spec/sub/.git', 'gitdir: elsewhere');
    write(root, 'spec/sub/x.md', story(9));
    write(root, 'node_modules/pkg/spec/y.md', story(8));

    await indexer.indexAll('p1');

    expect(count(db, 'story')).toBe(1);
    expect(db.sqlite.prepare('select title from story').get()).toEqual({ title: 'Story 1' });
    expect(existsSync(join(root, 'wt'))).toBe(true);
  });
});
