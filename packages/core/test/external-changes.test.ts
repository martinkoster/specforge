// SPDX-License-Identifier: Apache-2.0
// US-021: external edits are detected, re-indexed and reconciled with the story state machine.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExternalChangeReconciler, SelfWriteRegistry, WorkspaceIndexer, type ReconcileEvent } from '@specforge/application';
import { IndexRepository, ProjectRepository, openDatabase, type OpenDatabase } from '@specforge/sqlite';
import { WorkspaceFiles, watchWorkspace, type WorkspaceWatcher } from '@specforge/workspace-fs';
import { afterEach, describe, expect, it } from 'vitest';

const cleanup: Array<() => unknown> = [];
afterEach(async () => {
  // Reverse order: stop the watcher and finish running reconciliations before closing the database.
  for (const c of cleanup.splice(0).reverse()) await c();
});

const story = (status: string, approval = 'approved') =>
  ['---', 'kind: story', 'id: US-001', 'title: Story one', `approval: ${approval}`, `status: ${status}`, '---', 'Body.', ''].join('\n');

// macOS FSEvents report changes later than inotify / ReadDirectoryChangesW.
async function waitFor<T>(fn: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function setup(initial = story('backlog')) {
  const root = mkdtempSync(join(tmpdir(), 'sf-watch-'));
  mkdirSync(join(root, 'spec', '04_user_stories'), { recursive: true });
  writeFileSync(join(root, 'spec', '04_user_stories', 'US-001.md'), initial);
  const db: OpenDatabase = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-watch-db-')) });
  cleanup.push(() => db.close());
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: root, vcsMode: 'git', baseBranch: 'main' });
  const selfWrites = new SelfWriteRegistry();
  const files = new WorkspaceFiles(root, { onWrite: (path, hash) => selfWrites.register(path, hash) });
  const index = new IndexRepository(db.sqlite);
  const indexer = new WorkspaceIndexer(files, index);
  await indexer.indexAll('p1');
  const events: ReconcileEvent[] = [];
  const batches: string[][] = [];
  const reconciler = new ExternalChangeReconciler(files, indexer, index, selfWrites, (e) => events.push(e));
  const running = new Set<Promise<void>>();
  const watcher: WorkspaceWatcher = await watchWorkspace(root, { debounceMs: 200 }, (paths) => {
    batches.push(paths);
    const job = reconciler.handle('p1', paths).finally(() => running.delete(job));
    running.add(job);
  });
  cleanup.push(async () => {
    await watcher.close();
    await Promise.allSettled([...running]);
  });
  const path = join(root, 'spec', '04_user_stories', 'US-001.md');
  const status = () =>
    (db.sqlite.prepare('select board_status from story where story_id = ?').get('US-001') as { board_status: string }).board_status;
  return { root, path, files, index, events, batches, status, db };
}

describe('US-021 AC-1: debounced detection, re-indexing and ignored self-writes', () => {
  it('re-indexes an externally edited file after a debounced batch', async () => {
    const { path, events, batches, db } = await setup();

    for (let i = 0; i < 5; i++) writeFileSync(path, story('backlog').replace('Story one', `Story one v${i}`));

    await waitFor(() => (events.some((e) => e.type === 'reindexed') ? true : undefined));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(['spec/04_user_stories/US-001.md']);
    expect(db.sqlite.prepare('select title from story').get()).toEqual({ title: 'Story one v4' });
  });

  it('ignores changes SpecForge wrote itself (content hash)', async () => {
    const { files, events, batches } = await setup();
    const current = await files.read('spec/04_user_stories/US-001.md');

    await files.writeAtomic('spec/04_user_stories/US-001.md', story('backlog').replace('Story one', 'Edited in SpecForge'), {
      expectedHash: current!.hash,
    });

    await waitFor(() => (batches.length > 0 ? true : undefined));
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toEqual([{ type: 'self-write', path: 'spec/04_user_stories/US-001.md' }]);
  });
});

describe('US-021 AC-2: external status changes', () => {
  it('moves an approved story from Backlog to Ready within 2 seconds', async () => {
    const { path, events, status } = await setup();
    const t0 = Date.now();

    writeFileSync(path, story('ready'));

    await waitFor(() => (status() === 'ready' ? true : undefined), 2000);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(events).toContainEqual({ type: 'story-moved', storyId: 'US-001', from: 'backlog', to: 'ready' });
  });

  it('reverts and flags a status change that must be made on the board', async () => {
    const { path, events, status, db } = await setup(story('ready'));

    writeFileSync(path, story('done'));

    const rejected = await waitFor(() => events.find((e) => e.type === 'status-rejected'));
    expect(rejected).toEqual({
      type: 'status-rejected',
      storyId: 'US-001',
      from: 'ready',
      to: 'done',
      reason:
        'Moving a story from ready to done is not allowed by editing the file. Starting, reviewing and accepting work is done on the board.',
    });
    expect(status()).toBe('ready');
    await waitFor(() => (readFileSync(path, 'utf8').includes('status: ready') ? true : undefined));
    expect(db.sqlite.prepare('select status_notice from story_state where story_id = ?').get('US-001')).toEqual({
      status_notice: rejected.reason,
    });
  });

  it('rejects moving an unapproved story to Ready', async () => {
    const { path, events, status } = await setup(story('backlog', 'draft'));

    writeFileSync(path, story('ready', 'draft'));

    await waitFor(() => events.find((e) => e.type === 'status-rejected'));
    expect(status()).toBe('backlog');
  });
});

describe('US-039 AC-4: a story file created outside SpecForge', () => {
  it('is reported as added (its Done epic is reopened, FR-095)', async () => {
    const { root, events } = await setup();
    writeFileSync(join(root, 'spec', '04_user_stories', 'US-002.md'), story('backlog').replace('US-001', 'US-002'));
    expect(await waitFor(() => events.find((e) => e.type === 'story-added'))).toEqual({ type: 'story-added', storyId: 'US-002' });
  });
});
