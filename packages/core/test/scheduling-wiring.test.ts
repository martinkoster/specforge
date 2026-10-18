// SPDX-License-Identifier: Apache-2.0
// US-042: board transitions are translated into scheduler events (BoardService → Scheduler).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SchedulerEvent } from '@specforge/application';
import { ExecutionStore, IndexRepository, ProjectRepository, openDatabase, type OpenDatabase } from '@specforge/sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { notifyScheduler } from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup() {
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-notify-')) });
  opened.push(db);
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: '/w', vcsMode: 'git', baseBranch: 'main' });
  const store = new ExecutionStore(db.sqlite);
  const index = new IndexRepository(db.sqlite);
  const events: SchedulerEvent[] = [];
  const scheduler = { post: async (event: SchedulerEvent) => void events.push(event) } as never;
  return { store, index, events, scheduler, db };
}

describe('US-042: board transitions → scheduler events', () => {
  it('maps authorisation, dequeue and approval', async () => {
    const { store, index, events, scheduler } = await setup();

    await notifyScheduler(scheduler, store, index, 'p1', 'US-001', 'startImplementation');
    await notifyScheduler(scheduler, store, index, 'p1', 'US-001', 'removeFromQueue');
    await notifyScheduler(scheduler, store, index, 'p1', 'US-001', 'approveImplementation');

    expect(events.map((e) => e.type)).toEqual(['StoryAuthorised', 'StoryDequeued', 'StoryApproved']);
  });

  it('corrections and retries reference the last run of the story; without a run they start fresh', async () => {
    const { store, index, events, scheduler } = await setup();
    await notifyScheduler(scheduler, store, index, 'p1', 'US-002', 'requestCorrections');
    const runId = store.createRun('p1', { storyId: 'US-002', kind: 'implement', startKind: 'implement', trigger: 't' });

    await notifyScheduler(scheduler, store, index, 'p1', 'US-002', 'requestCorrections');
    await notifyScheduler(scheduler, store, index, 'p1', 'US-002', 'retryRun');

    expect(events).toEqual([
      expect.objectContaining({ type: 'StoryAuthorised', storyId: 'US-002' }),
      expect.objectContaining({ type: 'CorrectionRequested', storyId: 'US-002', parentRunId: runId }),
      expect.objectContaining({ type: 'RetryRequested', storyId: 'US-002', parentRunId: runId }),
    ]);
  });

  it('discarding or rejecting clears the failure notice without a scheduler event', async () => {
    const { store, index, events, scheduler, db } = await setup();
    store.setStatusNotice('p1', 'US-003', 'No agent adapter is available.');

    await notifyScheduler(scheduler, store, index, 'p1', 'US-003', 'discardRun');
    await notifyScheduler(scheduler, store, index, 'p1', 'US-003', 'rejectImplementation');
    await notifyScheduler(scheduler, store, index, 'p1', 'US-003', 'moveToBacklog');

    expect(events).toEqual([]);
    expect(db.sqlite.prepare("select status_notice from story_state where story_id = 'US-003'").get()).toEqual({ status_notice: null });
  });
});

describe('US-043 AC-4: Re-check → scheduler', () => {
  it('maps recheckConflict to ConflictResolved for the story and clears the notice', async () => {
    const { store, index, events, scheduler } = await setup();
    await notifyScheduler(scheduler, store, index, 'p1', 'US-004', 'recheckConflict');
    expect(events).toEqual([{ type: 'ConflictResolved', projectId: 'p1', storyId: 'US-004' }]);
  });
});
