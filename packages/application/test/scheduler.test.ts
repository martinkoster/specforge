// SPDX-License-Identifier: Apache-2.0
import type { ExecSubState, QueueEntry, QueueReason } from '@specforge/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Scheduler, type LaunchRequest, type NewRun, type SchedulerStore, type StoredQueueEntry } from '../src/index.js';

/** In-memory SchedulerStore; `transaction` snapshots state and restores it on error. */
class MemoryStore implements SchedulerStore {
  queueRows = new Map<string, StoredQueueEntry>();
  runs = new Map<string, { storyId: string | null; kind: string; active: boolean; trigger: string }>();
  subStates = new Map<string, ExecSubState>();
  transactions = 0;
  private n = 0;

  transaction<T>(fn: () => T): T {
    this.transactions++;
    const backup = { q: new Map(this.queueRows), r: new Map([...this.runs].map(([k, v]) => [k, { ...v }])) };
    try {
      return fn();
    } catch (e) {
      this.queueRows = backup.q;
      this.runs = backup.r;
      throw e;
    }
  }
  queue(): StoredQueueEntry[] {
    return [...this.queueRows.values()];
  }
  enqueue(_p: string, entry: QueueEntry): void {
    this.queueRows.set(entry.storyId, { ...entry, reason: null, waitingFor: [] });
  }
  dequeue(_p: string, storyId: string): void {
    this.queueRows.delete(storyId);
  }
  setWaiting(_p: string, storyId: string, reason: QueueReason, waitingFor: string[]): void {
    const row = this.queueRows.get(storyId);
    if (row) this.queueRows.set(storyId, { ...row, reason, waitingFor });
  }
  activeImplementationRuns(): number {
    return [...this.runs.values()].filter((r) => r.active && (r.kind === 'implement' || r.kind === 'correct')).length;
  }
  hasActiveRun(_p: string, storyId: string): boolean {
    return [...this.runs.values()].some((r) => r.active && r.storyId === storyId);
  }
  createRun(_p: string, run: NewRun): string {
    const id = `run-${++this.n}`;
    this.runs.set(id, { storyId: run.storyId, kind: run.kind, active: true, trigger: run.trigger });
    return id;
  }
  setSubState(_p: string, storyId: string, subState: ExecSubState): void {
    this.subStates.set(storyId, subState);
  }
  projectsWithQueue(): string[] {
    return this.queueRows.size > 0 ? ['p1'] : [];
  }
  finish(runId: string): void {
    this.runs.get(runId)!.active = false;
  }
}

function setup(options: { limit?: number; deps?: Record<string, string[]>; workspaceBusy?: boolean } = {}) {
  const store = new MemoryStore();
  const done = new Set<string>();
  const launched: (LaunchRequest & { activeAtLaunch: number; limitAtLaunch: number; openPredecessorsAtLaunch: string[] })[] = [];
  let workspaceBusy = options.workspaceBusy ?? false;
  let limit = options.limit ?? 2;
  const scheduler = new Scheduler({
    store,
    context: {
      limit: () => limit,
      openPredecessors: (_p, storyId) => (options.deps?.[storyId] ?? []).filter((d) => !done.has(d)),
      workspaceBusy: () => workspaceBusy,
    },
    launcher: {
      launch: (request) =>
        void launched.push({
          ...request,
          activeAtLaunch: store.activeImplementationRuns(),
          limitAtLaunch: limit,
          openPredecessorsAtLaunch: (options.deps?.[request.storyId] ?? []).filter((d) => !done.has(d)),
        }),
    },
  });
  return {
    store,
    scheduler,
    launched,
    done,
    setWorkspaceBusy: (busy: boolean) => (workspaceBusy = busy),
    setLimit: (n: number) => (limit = n),
  };
}

const authorise = (storyId: string, at: string) => ({ type: 'StoryAuthorised' as const, projectId: 'p1', storyId, at });

describe('US-042 AC-1: single writer, one transaction per evaluation', () => {
  it('processes posted events strictly in order, each evaluation in one transaction', async () => {
    const { scheduler, store, launched } = setup({ limit: 1 });

    await Promise.all([
      scheduler.post(authorise('US-001', 't1')),
      scheduler.post(authorise('US-002', 't2')),
      scheduler.post(authorise('US-003', 't3')),
    ]);

    expect(launched.map((l) => l.storyId)).toEqual(['US-001']);
    expect(store.transactions).toBe(3);
    expect(store.subStates.get('US-001')).toBe('preparing');
    expect(store.subStates.get('US-002')).toBe('queued');
  });

  it('a failing evaluation rolls back and does not stop later events', async () => {
    const { scheduler, store, launched } = setup();
    const createRun = store.createRun.bind(store);
    let fail = true;
    store.createRun = (p, r) => {
      if (fail) {
        fail = false;
        throw new Error('disk full');
      }
      return createRun(p, r);
    };

    await expect(scheduler.post(authorise('US-001', 't1'))).rejects.toThrow('disk full');
    expect(store.queue()).toEqual([]);
    await scheduler.post(authorise('US-002', 't2'));
    expect(launched.map((l) => l.storyId)).toEqual(['US-002']);
  });
});

describe('US-042 AC-2: order and limit', () => {
  it('starts corrections before FIFO stories and never exceeds the limit', async () => {
    const { scheduler, launched, store } = setup({ limit: 1 });
    await scheduler.post(authorise('US-001', 't1'));
    await scheduler.post(authorise('US-002', 't2'));
    await scheduler.post({ type: 'CorrectionRequested', projectId: 'p1', storyId: 'US-009', at: 't3', parentRunId: 'run-0' });

    store.finish(launched[0]!.runId);
    await scheduler.post({ type: 'RunFinished', projectId: 'p1', runId: launched[0]!.runId });

    expect(launched.map((l) => [l.storyId, l.startKind])).toEqual([
      ['US-001', 'implement'],
      ['US-009', 'correct'],
    ]);
    expect(launched[1]).toMatchObject({ parentRunId: 'run-0' });
  });

  it('a raised limit starts waiting stories', async () => {
    const { scheduler, launched, setLimit } = setup({ limit: 1 });
    await scheduler.post(authorise('US-001', 't1'));
    await scheduler.post(authorise('US-002', 't2'));

    setLimit(2);
    await scheduler.post({ type: 'LimitChanged', projectId: 'p1' });

    expect(launched.map((l) => l.storyId)).toEqual(['US-001', 'US-002']);
  });

  it('never launches a story twice while it has an active run (idempotent launch)', async () => {
    const { scheduler, launched } = setup();
    await scheduler.post(authorise('US-001', 't1'));
    await scheduler.post({ type: 'RetryRequested', projectId: 'p1', storyId: 'US-001', at: 't2', parentRunId: 'x' });
    expect(launched).toHaveLength(1);
  });

  it('a dequeued story is removed and never started', async () => {
    const { scheduler, launched, store } = setup({ limit: 0 });
    await scheduler.post(authorise('US-001', 't1'));
    await scheduler.post({ type: 'StoryDequeued', projectId: 'p1', storyId: 'US-001' });
    expect(store.queue()).toEqual([]);
    expect(launched).toEqual([]);
  });
});

describe('US-042 AC-3: queue reasons and triggers', () => {
  it('records dependency waits; approving the predecessor starts the dependent and logs the trigger', async () => {
    const { scheduler, launched, store, done } = setup({ deps: { 'US-002': ['US-001'] } });
    await scheduler.post(authorise('US-002', 't1'));
    expect(store.queue()[0]).toMatchObject({ storyId: 'US-002', reason: 'dependency', waitingFor: ['US-001'] });

    const started = Date.now();
    done.add('US-001');
    await scheduler.post({ type: 'StoryApproved', projectId: 'p1', storyId: 'US-001' });

    expect(Date.now() - started).toBeLessThan(5000);
    expect(launched).toEqual([expect.objectContaining({ storyId: 'US-002', trigger: 'StoryApproved US-001' })]);
    expect([...store.runs.values()][0]!.trigger).toBe('StoryApproved US-001');
  });

  it('records slot and workspace waits', async () => {
    const s = setup({ limit: 1 });
    await s.scheduler.post(authorise('US-001', 't1'));
    await s.scheduler.post(authorise('US-002', 't2'));
    expect(s.store.queue()).toEqual([expect.objectContaining({ storyId: 'US-002', reason: 'slot' })]);

    const w = setup({ workspaceBusy: true });
    await w.scheduler.post(authorise('US-001', 't1'));
    expect(w.store.queue()).toEqual([expect.objectContaining({ storyId: 'US-001', reason: 'workspace' })]);
    w.setWorkspaceBusy(false);
    await w.scheduler.post({ type: 'WorkspaceWriterChanged', projectId: 'p1' });
    expect(w.launched.map((l) => l.trigger)).toEqual(['WorkspaceWriterChanged']);
  });
});

describe('US-042 AC-5: restart', () => {
  it('re-evaluates every persisted queue at startup', async () => {
    const { scheduler, launched, store } = setup();
    store.enqueue('p1', { storyId: 'US-001', queuedAt: 't1', priority: 1, startKind: 'implement' });

    await scheduler.post({ type: 'Startup' });

    expect(launched).toEqual([expect.objectContaining({ storyId: 'US-001', trigger: 'Startup' })]);
  });
});

describe('US-042 AC-4: properties over random event sequences', () => {
  const stories = ['US-001', 'US-002', 'US-003', 'US-004', 'US-005'];
  /** Random acyclic blocking dependencies: a story may depend only on lower-numbered ones. */
  const depsArb = fc
    .tuple(...stories.map((_, i) => fc.subarray(stories.slice(0, i))))
    .map((lists) => Object.fromEntries(stories.map((s, i) => [s, lists[i]!])));
  const eventArb = fc.oneof(
    fc.record({ kind: fc.constant('authorise' as const), story: fc.constantFrom(...stories) }),
    fc.record({ kind: fc.constant('complete' as const), index: fc.nat(10) }),
    fc.record({ kind: fc.constant('approve' as const), index: fc.nat(10) }),
    fc.record({ kind: fc.constant('cancel' as const), story: fc.constantFrom(...stories) }),
    fc.record({ kind: fc.constant('limit' as const), limit: fc.integer({ min: 0, max: 3 }) }),
  );

  it('never exceeds the limit, never starts a story with an open blocking predecessor and never loses a queued story', async () => {
    await fc.assert(
      fc.asyncProperty(depsArb, fc.array(eventArb, { maxLength: 40 }), async (deps, events) => {
        const s = setup({ limit: 2, deps });
        const authorised = new Set<string>();
        const inReview = new Set<string>();
        let clock = 0;
        for (const e of events) {
          if (e.kind === 'authorise') {
            if (authorised.has(e.story) || s.done.has(e.story) || inReview.has(e.story)) continue;
            authorised.add(e.story);
            await s.scheduler.post(authorise(e.story, `t${String(++clock).padStart(3, '0')}`));
          } else if (e.kind === 'complete') {
            const active = [...s.store.runs.entries()].filter(([, r]) => r.active);
            const picked = active[e.index % Math.max(1, active.length)];
            if (!picked) continue;
            s.store.finish(picked[0]);
            authorised.delete(picked[1].storyId!);
            inReview.add(picked[1].storyId!);
            await s.scheduler.post({ type: 'RunFinished', projectId: 'p1', runId: picked[0] });
          } else if (e.kind === 'approve') {
            const review = [...inReview];
            const story = review[e.index % Math.max(1, review.length)];
            if (!story) continue;
            inReview.delete(story);
            s.done.add(story);
            await s.scheduler.post({ type: 'StoryApproved', projectId: 'p1', storyId: story });
          } else if (e.kind === 'cancel') {
            if (!s.store.queueRows.has(e.story)) continue;
            authorised.delete(e.story);
            await s.scheduler.post({ type: 'StoryDequeued', projectId: 'p1', storyId: e.story });
          } else {
            s.setLimit(e.limit);
            await s.scheduler.post({ type: 'LimitChanged', projectId: 'p1' });
          }

          // Every authorised story is either queued or running — none is lost.
          for (const story of authorised) expect(s.store.queueRows.has(story) || s.store.hasActiveRun('p1', story)).toBe(true);
        }
        for (const l of s.launched) {
          // A launch never takes the number of active runs above the limit in force at that moment.
          expect(l.activeAtLaunch).toBeLessThanOrEqual(l.limitAtLaunch);
          // No story is launched while one of its blocking predecessors is not Done.
          expect(l.openPredecessorsAtLaunch).toEqual([]);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('US-043 AC-4: re-check of a blocked (conflict) story', () => {
  it('a conflict entry is not relaunched by a freed slot; ConflictResolved for the story re-evaluates it', async () => {
    const { scheduler, launched, store } = setup();
    store.enqueue('p1', { storyId: 'US-001', queuedAt: 't1', priority: 1, startKind: 'implement' });
    store.setWaiting('p1', 'US-001', 'conflict', ['src/a.ts']);

    await scheduler.post({ type: 'RunFinished', projectId: 'p1', runId: 'x' });
    expect(launched).toEqual([]);
    expect(store.queue()[0]).toMatchObject({ reason: 'conflict', waitingFor: ['src/a.ts'] });

    await scheduler.post({ type: 'ConflictResolved', projectId: 'p1', storyId: 'US-001' });
    expect(launched).toEqual([expect.objectContaining({ storyId: 'US-001', trigger: 'ConflictResolved US-001' })]);
  });
});

describe('Scheduler idle', () => {
  it('resolves once all posted events have been processed', async () => {
    const { scheduler, launched } = setup();
    void scheduler.post(authorise('US-001', 't1'));
    void scheduler.post(authorise('US-002', 't2'));
    await scheduler.idle();
    expect(launched.map((l) => l.storyId)).toEqual(['US-001', 'US-002']);
  });
});
