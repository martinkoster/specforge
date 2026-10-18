// SPDX-License-Identifier: Apache-2.0
// Execution store (data_model.md §2.3): runs, queue entries and the immutable permission log.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ExecutionStore,
  IndexRepository,
  PermissionRequestRepository,
  ProjectRepository,
  openDatabase,
  type OpenDatabase,
} from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup(dir = mkdtempSync(join(tmpdir(), 'sf-exec-'))) {
  const db = openDatabase({ dir });
  opened.push(db);
  const projects = new ProjectRepository(db.db);
  if (!(await projects.get('p1')))
    await projects.create({ id: 'p1', name: 'P', workspacePath: `${dir}/ws`, vcsMode: 'git', baseBranch: 'main' });
  return { db, dir, store: new ExecutionStore(db.sqlite), permissions: new PermissionRequestRepository(db.sqlite) };
}

const record = (id: string, runId: string) => ({
  id,
  runId,
  toolName: 'Bash',
  input: { command: 'npm test' },
  cwd: '/wt',
  outsideWorkspace: false,
  requestedAt: '2026-10-15T12:00:00.000Z',
  decision: null,
  decidedBy: null,
  decidedAt: null,
  message: null,
});

describe('US-052 AC-3: permission requests are stored immutably', () => {
  it('stores request and decision; a decided request cannot be changed', async () => {
    const { store, permissions, db } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 'test' });
    permissions.insert(record('q1', runId));

    permissions.decide('q1', { decision: 'allow', decidedBy: 'user', decidedAt: '2026-10-15T12:01:00.000Z', message: null });

    expect(permissions.forRun(runId)).toEqual([
      { ...record('q1', runId), decision: 'allow', decidedBy: 'user', decidedAt: '2026-10-15T12:01:00.000Z' },
    ]);
    expect(() => permissions.decide('q1', { decision: 'deny', decidedBy: 'user', decidedAt: 'x', message: 'changed my mind' })).toThrow(
      /immutable/,
    );
    expect(() => db.sqlite.prepare("update permission_request set tool_name = 'Edit' where id = 'q1'").run()).toThrow(/immutable/);
  });

  it('lists undecided requests (e.g. after a crash) so they can be denied at startup', async () => {
    const { store, permissions } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 'test' });
    permissions.insert(record('q1', runId));
    permissions.insert(record('q2', runId));
    permissions.decide('q2', { decision: 'deny', decidedBy: 'default_deny', decidedAt: 'x', message: null });

    expect(permissions.undecided().map((r) => r.id)).toEqual(['q1']);
  });
});

describe('US-042: queue entries and runs', () => {
  it('keeps the FIFO queue with priorities, reasons and waiting-for lists across restarts (AC-5)', async () => {
    const first = await setup();
    first.store.enqueue('p1', { storyId: 'US-002', queuedAt: '2026-10-15T10:00:00.000Z', priority: 1, startKind: 'implement' });
    first.store.enqueue('p1', {
      storyId: 'US-003',
      queuedAt: '2026-10-15T11:00:00.000Z',
      priority: 0,
      startKind: 'correct',
      parentRunId: 'r0',
    });
    first.store.setWaiting('p1', 'US-002', 'dependency', ['US-001']);
    first.db.close();
    opened.splice(0);

    const second = await setup(first.dir);

    expect(second.store.queue('p1')).toEqual([
      {
        storyId: 'US-003',
        queuedAt: '2026-10-15T11:00:00.000Z',
        priority: 0,
        startKind: 'correct',
        parentRunId: 'r0',
        reason: null,
        waitingFor: [],
      },
      {
        storyId: 'US-002',
        queuedAt: '2026-10-15T10:00:00.000Z',
        priority: 1,
        startKind: 'implement',
        reason: 'dependency',
        waitingFor: ['US-001'],
      },
    ]);
    expect(second.store.projectsWithQueue()).toEqual(['p1']);
    second.store.dequeue('p1', 'US-003');
    expect(second.store.queue('p1').map((e) => e.storyId)).toEqual(['US-002']);
  });

  it('counts active implementation runs only (spec/chat runs do not take a slot) and tracks run status', async () => {
    const { store } = await setup();
    const impl = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 'StoryAuthorised US-001' });
    store.createRun('p1', { storyId: null, kind: 'generate', startKind: null, trigger: 'user' });

    expect(store.activeImplementationRuns('p1')).toBe(1);
    expect(store.hasActiveRun('p1', 'US-001')).toBe(true);
    expect(store.run(impl)).toMatchObject({
      id: impl,
      status: 'preparing',
      startTrigger: 'StoryAuthorised US-001',
      storyId: 'US-001',
      kind: 'implement',
    });

    store.setRunStatus(impl, 'awaiting_approval');
    expect(store.activeImplementationRuns('p1')).toBe(1);
    store.setRunStatus(impl, 'failed');
    expect(store.activeImplementationRuns('p1')).toBe(0);
    expect(store.hasActiveRun('p1', 'US-001')).toBe(false);
    expect(store.run(impl)?.endedAt).toEqual(expect.any(String));
  });

  it('records the story execution sub-state for the board', async () => {
    const { store, db } = await setup();
    store.setSubState('p1', 'US-001', 'queued');
    store.setSubState('p1', 'US-001', 'preparing');
    expect(db.sqlite.prepare("select exec_substate from story_state where story_id = 'US-001'").get()).toEqual({
      exec_substate: 'preparing',
    });
  });

  it('runs a function in one transaction (rolled back on error)', async () => {
    const { store } = await setup();
    expect(() =>
      store.transaction(() => {
        store.enqueue('p1', { storyId: 'US-009', queuedAt: 'x', priority: 1, startKind: 'implement' });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.queue('p1')).toEqual([]);
  });
});

describe('US-048: run events and execution spaces', () => {
  it('appends event batches in one transaction and reads them in order', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.markStarted(runId, '2026-10-15T12:00:00.000Z');
    store.setSessionId(runId, 'session-1');

    store.appendEvents(runId, [
      { seq: 1, ts: 't1', type: 'session', payload: { type: 'session', sessionId: 'session-1' } },
      { seq: 2, ts: 't2', type: 'output', payload: { type: 'output', text: 'hello' } },
    ]);
    store.appendEvents(runId, [{ seq: 3, ts: 't3', type: 'output', payload: { type: 'output', text: 'world' } }]);

    expect(store.runEvents(runId).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(store.runEvents(runId, 2)).toEqual([{ seq: 3, ts: 't3', type: 'output', payload: { type: 'output', text: 'world' } }]);
    expect(store.run(runId)).toMatchObject({ startedAt: '2026-10-15T12:00:00.000Z', agentSessionId: 'session-1', lastEventSeq: 3 });
  });

  it('requeues a blocked (conflict) story with the conflicting files', async () => {
    const { store } = await setup();
    store.requeueConflict('p1', 'US-002', { queuedAt: 't1', startKind: 'implement' }, ['src/a.ts', 'src/b.ts']);
    expect(store.queue('p1')).toEqual([
      { storyId: 'US-002', queuedAt: 't1', priority: 1, startKind: 'implement', reason: 'conflict', waitingFor: ['src/a.ts', 'src/b.ts'] },
    ]);
  });

  it('records the execution space of a run', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.saveExecutionSpace(runId, {
      mode: 'worktree',
      branch: 'specforge/US-001',
      worktreePath: '/wt/US-001',
      baseRef: 'abc',
      stackedOn: ['specforge/US-000'],
    });
    expect(store.executionSpace(runId)).toEqual({
      mode: 'worktree',
      branch: 'specforge/US-001',
      worktreePath: '/wt/US-001',
      baseRef: 'abc',
      stackedOn: ['specforge/US-000'],
      snapshotId: null,
    });
  });
});

describe('US-051: run results, touched files and recommendations', () => {
  it('stores the parsed result with computed files, open recommendations and touched files', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });

    store.saveResult(runId, {
      result: {
        outcome: 'success',
        summary: 'Login added.',
        tests: { run: 3, passed: 2, failed: 1 },
        coverage: 88,
        changedFiles: ['src/a.ts'],
        openIssues: ['x'],
        recommendations: [{ type: 'follow_up', text: 'Add rate limiting' }],
      },
      unavailableReason: null,
      computedFiles: [{ path: 'src/a.ts', change: 'A', additions: 4, deletions: 0 }],
      rawResult: 'Done.',
    });
    store.recordTouches('p1', 'US-001', runId, ['src/a.ts', 'src/b.ts']);
    store.recordTouches('p1', 'US-001', runId, ['src/a.ts']);

    expect(store.runResult(runId)).toEqual({
      result: {
        outcome: 'success',
        summary: 'Login added.',
        tests: { run: 3, passed: 2, failed: 1 },
        coverage: 88,
        changedFiles: ['src/a.ts'],
        openIssues: ['x'],
        recommendations: [{ type: 'follow_up', text: 'Add rate limiting' }],
      },
      unavailableReason: null,
      computedFiles: [{ path: 'src/a.ts', change: 'A', additions: 4, deletions: 0 }],
    });
    expect(store.touchedFiles('p1', 'US-001')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(store.openRecommendations('p1')).toEqual([{ id: expect.any(String), storyId: 'US-001', runId, text: 'Add rate limiting' }]);
  });

  it('records "result unavailable"', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.saveResult(runId, { result: null, unavailableReason: 'No block.', computedFiles: [], rawResult: null });
    expect(store.runResult(runId)).toEqual({ result: null, unavailableReason: 'No block.', computedFiles: [] });
    expect(store.runResult('nope')).toBeUndefined();
  });
});

describe('US-054: run overview, paged events and full-text search', () => {
  it('pages events and finds output text with FTS5', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.appendEvents(runId, [
      { seq: 1, ts: 't', type: 'output', payload: { type: 'output', text: 'Installing dependencies' } },
      {
        seq: 2,
        ts: 't',
        type: 'tool_use',
        payload: { type: 'tool_use', toolUseId: 'u1', toolName: 'Bash', input: { command: 'npm test' } },
      },
      { seq: 3, ts: 't', type: 'output', payload: { type: 'output', text: 'All tests passed' } },
      { seq: 4, ts: 't', type: 'error', payload: { type: 'error', message: 'Timeout while installing' } },
    ]);

    expect(store.runEvents(runId, 1, 2).map((e) => e.seq)).toEqual([2, 3]);
    expect(store.eventCount(runId)).toBe(4);
    expect(store.searchEvents(runId, 'install*')).toEqual([1, 4]);
    expect(store.searchEvents(runId, 'npm')).toEqual([2]);
    expect(store.searchEvents(runId, '"tests passed"')).toEqual([3]);
    expect(store.searchEvents(runId, 'nothing')).toEqual([]);
    // Unbalanced quotes from the search box do not break the query.
    expect(store.searchEvents(runId, 'tests "passed')).toEqual([3]);
  });

  it('lists runs and queued stories, running first, with touched files', async () => {
    const { store } = await setup();
    const done = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.setRunStatus(done, 'completed');
    store.recordTouches('p1', 'US-001', done, ['a.ts', 'b.ts']);
    const running = store.createRun('p1', { storyId: 'US-002', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.setRunStatus(running, 'running');
    store.markStarted(running, '2026-10-16T10:00:00.000Z');
    store.enqueue('p1', { storyId: 'US-003', queuedAt: '2026-10-16T09:00:00.000Z', priority: 1, startKind: 'implement' });

    expect(store.runsOverview('p1')).toEqual([
      expect.objectContaining({
        runId: running,
        storyId: 'US-002',
        status: 'running',
        startedAt: '2026-10-16T10:00:00.000Z',
        touchedFiles: 0,
      }),
      expect.objectContaining({ runId: null, storyId: 'US-003', status: 'queued', startedAt: null }),
      expect.objectContaining({ runId: done, storyId: 'US-001', status: 'completed', touchedFiles: 2 }),
    ]);
  });

  it('AC-1: counts the undecided permission prompts of an active run', async () => {
    const { store, permissions: perms } = await setup();
    const runId = store.createRun('p1', { storyId: 'US-002', kind: 'implement', startKind: 'implement', trigger: 'test' });
    store.setRunStatus(runId, 'awaiting_approval');
    perms.insert({
      id: 'pr-1',
      runId,
      toolName: 'Bash',
      input: { command: 'ls' },
      cwd: '/w',
      outsideWorkspace: false,
      requestedAt: '2026-10-16T10:00:00.000Z',
      decision: null,
      decidedBy: null,
      decidedAt: null,
      message: null,
    });
    perms.insert({
      id: 'pr-2',
      runId,
      toolName: 'Bash',
      input: { command: 'pwd' },
      cwd: '/w',
      outsideWorkspace: false,
      requestedAt: '2026-10-16T10:00:01.000Z',
      decision: null,
      decidedBy: null,
      decidedAt: null,
      message: null,
    });
    perms.decide('pr-2', { decision: 'allow', decidedBy: 'user', decidedAt: '2026-10-16T10:00:02.000Z', message: null });

    expect(store.runsOverview('p1')).toEqual([expect.objectContaining({ runId, status: 'awaiting_approval', pendingPrompts: 1 })]);
  });
});

describe('US-027: specification review records', () => {
  it('saves, updates and finds the open review of a target folder', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', {
      storyId: null,
      kind: 'generate',
      startKind: null,
      trigger: 'SpecGeneration spec/02_requirements',
    });
    const review = {
      runId,
      projectId: 'p1',
      target: 'spec/02_requirements',
      kind: 'generate' as const,
      instruction: 'Generate',
      snapshotId: 'snap-1',
      parentRunId: null,
      state: 'running' as const,
      files: [],
      issues: [],
      reason: null,
      createdAt: '2026-10-16T10:00:00.000Z',
    };
    store.saveSpecReview(review);
    expect(store.openSpecReview('p1', 'spec/02_requirements')).toEqual(review);

    const open = {
      ...review,
      state: 'open' as const,
      files: [{ path: 'spec/02_requirements/fr.md', change: 'A' as const, patch: '+x' }],
      issues: [
        { path: 'spec/02_requirements/fr.md', kind: 'broken_link' as const, message: 'FR-001 references FR-9, which does not exist.' },
      ],
    };
    store.saveSpecReview(open);
    expect(store.specReview(runId)).toEqual(open);
    expect(store.openSpecReview('p1', 'spec/03_design')).toBeUndefined();

    store.saveSpecReview({ ...open, state: 'kept' });
    expect(store.openSpecReview('p1', 'spec/02_requirements')).toBeUndefined();
    expect(store.specReview('nope')).toBeUndefined();
  });
});

describe('US-024: merged story branches', () => {
  const story = (id: string, status: 'done' | 'review', branch: string | null) => ({
    kind: 'story',
    approval: 'approved' as const,
    elements: [{ id, type: 'story', title: id, anchor: null }],
    links: [],
    dependencies: [],
    story: { id, title: id, status, approval: 'approved' as const, size: null, epicId: null, featureId: null, branch, reworks: [] },
  });

  it('lists Done stories with an unmerged branch; marking one merged records merged_at and removes its overlap records', async () => {
    const { db, store } = await setup();
    const index = new IndexRepository(db.sqlite);
    index.save('p1', 'spec/04_user_stories/US-001.md', 'h1', story('US-001', 'done', 'specforge/US-001'));
    index.save('p1', 'spec/04_user_stories/US-002.md', 'h2', story('US-002', 'done', 'specforge/US-002'));
    index.save('p1', 'spec/04_user_stories/US-003.md', 'h3', story('US-003', 'review', 'specforge/US-003'));
    index.save('p1', 'spec/04_user_stories/US-004.md', 'h4', story('US-004', 'done', null));
    const runId = store.createRun('p1', { storyId: 'US-001', kind: 'implement', startKind: 'implement', trigger: 't' });
    store.recordTouches('p1', 'US-001', runId, ['src/a.ts']);

    expect(index.unmergedDoneStories('p1')).toEqual([
      { storyId: 'US-001', branch: 'specforge/US-001' },
      { storyId: 'US-002', branch: 'specforge/US-002' },
    ]);

    index.setMergedAt('p1', 'US-001', '2026-10-16T12:00:00.000Z');
    store.clearTouches('p1', 'US-001');

    expect(index.unmergedDoneStories('p1')).toEqual([{ storyId: 'US-002', branch: 'specforge/US-002' }]);
    expect(index.mergedAt('p1', 'US-001')).toBe('2026-10-16T12:00:00.000Z');
    expect(index.mergedAt('p1', 'US-002')).toBeNull();
    expect(store.touchedFiles('p1', 'US-001')).toEqual([]);
  });
});

describe('US-057 AC-1: overlap warnings', () => {
  it('lists other stories that touched the same files', async () => {
    const { store } = await setup();
    const run = (storyId: string) => store.createRun('p1', { storyId, kind: 'implement', startKind: 'implement', trigger: 't' });
    store.recordTouches('p1', 'US-001', run('US-001'), ['src/a.ts', 'src/b.ts', 'README.md']);
    store.recordTouches('p1', 'US-002', run('US-002'), ['src/b.ts', 'README.md']);
    store.recordTouches('p1', 'US-003', run('US-003'), ['src/c.ts']);

    expect(store.overlaps('p1', 'US-001')).toEqual([{ storyId: 'US-002', files: ['README.md', 'src/b.ts'] }]);
    expect(store.overlaps('p1', 'US-003')).toEqual([]);
  });
});

describe('US-029: quality findings', () => {
  it('replaces open findings per artifact, keeps applied/dismissed history and updates state', async () => {
    const { store } = await setup();
    const runId = store.createRun('p1', { storyId: null, kind: 'quality_check', startKind: null, trigger: 't' });
    const finding = (id: string, severity: 'critical' | 'minor', path = 'spec/02_requirements/fr.md') => ({
      id,
      projectId: 'p1',
      runId,
      artifactPath: path,
      elementId: 'FR-001',
      severity,
      category: 'clarity',
      explanation: `Finding ${id}`,
      suggestedFix: 'Fix it.',
      state: 'open' as const,
      dismissReason: null,
      fixRunId: null,
    });
    store.replaceFindings('p1', 'spec/02_requirements/fr.md', [finding('f1', 'critical'), finding('f2', 'minor')]);
    store.replaceFindings('p1', 'spec/03_design/d.md', [finding('f3', 'minor', 'spec/03_design/d.md')]);
    store.updateFinding('f1', { state: 'dismissed', dismissReason: 'Intentional.' });
    store.updateFinding('f2', { fixRunId: 'refine-1' });

    store.replaceFindings('p1', 'spec/02_requirements/fr.md', [finding('f4', 'minor')]);

    expect(store.findings('p1', 'spec/02_requirements/fr.md').map((f) => [f.id, f.state])).toEqual([
      ['f1', 'dismissed'],
      ['f4', 'open'],
    ]);
    expect(
      store
        .findings('p1')
        .map((f) => f.id)
        .sort(),
    ).toEqual(['f1', 'f3', 'f4']);
    expect(store.finding('f1')).toMatchObject({ dismissReason: 'Intentional.', elementId: 'FR-001' });
    expect(store.finding('f2')).toBeUndefined();
    store.updateFinding('f4', { fixRunId: 'refine-2' });
    expect(store.findingsFixedBy('refine-2').map((f) => f.id)).toEqual(['f4']);
  });
});

describe('US-028: clarification dialogues', () => {
  it('saves and updates a dialogue and returns the latest one of an intent', async () => {
    const { store } = await setup();
    const record = {
      id: 'c1',
      projectId: 'p1',
      intentPath: 'spec/01_intent/intent.md',
      state: 'awaiting_answers' as const,
      sessionId: 's1',
      items: [{ id: 'q1', type: 'question' as const, text: 'Who?', options: [], answer: null }],
      lastRunId: null,
      proposalRunId: null,
      reason: null,
      createdAt: '2026-10-16T10:00:00.000Z',
    };
    store.saveClarification(record);
    store.saveClarification({ ...record, state: 'cancelled', items: [{ ...record.items[0]!, answer: 'Owners' }] });
    store.saveClarification({ ...record, id: 'c2', createdAt: '2026-10-16T11:00:00.000Z' });

    expect(store.clarification('c1')).toMatchObject({ state: 'cancelled', items: [{ answer: 'Owners' }] });
    expect(store.latestClarification('p1', 'spec/01_intent/intent.md')?.id).toBe('c2');
    expect(store.latestClarification('p1', 'spec/01_intent/other.md')).toBeUndefined();
    expect(store.clarification('nope')).toBeUndefined();
  });
});

describe('US-059: requested corrections', () => {
  it('stores the feedback and whether a fresh session was chosen until the correction has started', async () => {
    const { store } = await setup();
    expect(store.correction('p1', 'US-001')).toBeUndefined();
    store.setCorrection('p1', 'US-001', { feedback: 'Fix the sender.', fresh: true });
    expect(store.correction('p1', 'US-001')).toEqual({ feedback: 'Fix the sender.', fresh: true });
    store.setCorrection('p1', 'US-001', null);
    expect(store.correction('p1', 'US-001')).toBeUndefined();
  });
});
