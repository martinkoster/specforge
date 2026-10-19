// SPDX-License-Identifier: Apache-2.0
// Single-writer, event-driven Scheduler (US-042, ADR-009): events are processed one at a time; each evaluation of a
// project's queue runs in one database transaction; launches happen after the commit through the RunLauncher port.
import { planStarts, priorityFor, type StartKind } from '@specforge/domain';
import type { SchedulerStore } from './ports.js';

export type SchedulerEvent =
  | { type: 'StoryAuthorised'; projectId: string; storyId: string; at: string }
  | {
      type: 'CorrectionRequested' | 'RetryRequested' | 'ResumeRequested';
      projectId: string;
      storyId: string;
      at: string;
      parentRunId: string;
    }
  | { type: 'StoryDequeued'; projectId: string; storyId: string }
  | { type: 'StoryApproved'; projectId: string; storyId: string }
  | { type: 'RunFinished'; projectId: string; runId: string }
  | { type: 'DependencyChanged' | 'LimitChanged' | 'WorkspaceWriterChanged'; projectId: string }
  /** *Re-check* of a blocked (conflict) story (FR-067). */
  | { type: 'ConflictResolved'; projectId: string; storyId: string }
  | { type: 'Startup' };

export interface LaunchRequest {
  runId: string;
  projectId: string;
  storyId: string;
  startKind: StartKind;
  parentRunId?: string;
  /** Why the run started now, e.g. "StoryApproved US-001" (logged on the run). */
  trigger: string;
}

export interface SchedulingContext {
  /** Effective concurrency limit (1 in non-git mode). */
  limit(projectId: string): number;
  openPredecessors(projectId: string, storyId: string): readonly string[];
  /** Non-git mode and a write-capable chat/spec run is active (FR-116b). */
  workspaceBusy(projectId: string): boolean;
  /** Effective configuration recorded on each new run (FR-052); changes apply to the next run. */
  configSnapshot?(projectId: string): unknown;
}

export interface RunLauncher {
  launch(request: LaunchRequest): void;
}

export interface SchedulerDeps {
  store: SchedulerStore;
  context: SchedulingContext;
  launcher: RunLauncher;
}

const START_KIND: Record<'CorrectionRequested' | 'RetryRequested' | 'ResumeRequested', StartKind> = {
  CorrectionRequested: 'correct',
  RetryRequested: 'retry',
  ResumeRequested: 'resume',
};

function triggerOf(event: SchedulerEvent): string {
  return 'storyId' in event ? `${event.type} ${event.storyId}` : event.type;
}

export class Scheduler {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: SchedulerDeps) {}

  /** Queues an event; resolves when it has been processed (events never interleave). */
  post(event: SchedulerEvent): Promise<void> {
    const result = this.tail.then(() => this.process(event));
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves when every event posted so far has been processed. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }

  private process(event: SchedulerEvent): void {
    const projects = event.type === 'Startup' ? this.deps.store.projectsWithQueue() : [event.projectId];
    for (const projectId of projects) {
      const launches = this.deps.store.transaction(() => {
        this.apply(projectId, event);
        return this.evaluate(projectId, triggerOf(event));
      });
      for (const launch of launches) this.deps.launcher.launch(launch);
    }
  }

  private apply(projectId: string, event: SchedulerEvent): void {
    const { store } = this.deps;
    switch (event.type) {
      case 'StoryAuthorised':
        if (store.hasActiveRun(projectId, event.storyId)) return;
        store.enqueue(projectId, { storyId: event.storyId, queuedAt: event.at, priority: 1, startKind: 'implement' });
        store.setSubState(projectId, event.storyId, 'queued');
        return;
      case 'CorrectionRequested':
      case 'RetryRequested':
      case 'ResumeRequested': {
        if (store.hasActiveRun(projectId, event.storyId)) return;
        const startKind = START_KIND[event.type];
        store.enqueue(projectId, {
          storyId: event.storyId,
          queuedAt: event.at,
          priority: priorityFor(startKind),
          startKind,
          parentRunId: event.parentRunId,
        });
        store.setSubState(projectId, event.storyId, 'queued');
        return;
      }
      case 'StoryDequeued':
        store.dequeue(projectId, event.storyId);
        return;
      case 'ConflictResolved': {
        const entry = store.queue(projectId).find((e) => e.storyId === event.storyId);
        if (!entry) return;
        // Re-enqueued with its original authorisation time; the next preparation re-checks the integration.
        store.enqueue(projectId, {
          storyId: entry.storyId,
          queuedAt: entry.queuedAt,
          priority: entry.priority,
          startKind: entry.startKind,
          ...(entry.parentRunId ? { parentRunId: entry.parentRunId } : {}),
        });
        store.setSubState(projectId, entry.storyId, 'queued');
        return;
      }
      default:
        return;
    }
  }

  private evaluate(projectId: string, trigger: string): LaunchRequest[] {
    const { store, context } = this.deps;
    const queue = store
      .queue(projectId)
      .filter((entry) => !store.hasActiveRun(projectId, entry.storyId))
      .map((entry) => ({ ...entry, blockedByConflict: entry.reason === 'conflict' }));
    const plan = planStarts({
      queue,
      activeImplementationRuns: store.activeImplementationRuns(projectId),
      limit: context.limit(projectId),
      openPredecessors: (storyId) => context.openPredecessors(projectId, storyId),
      workspaceBusy: context.workspaceBusy(projectId),
    });
    for (const waiting of plan.waiting) store.setWaiting(projectId, waiting.storyId, waiting.reason, waiting.waitingFor);
    return plan.start.map((entry) => {
      const runId = store.createRun(projectId, {
        storyId: entry.storyId,
        kind: entry.startKind === 'correct' ? 'correct' : 'implement',
        startKind: entry.startKind,
        trigger,
        ...(entry.parentRunId ? { parentRunId: entry.parentRunId } : {}),
        ...(context.configSnapshot ? { configSnapshot: context.configSnapshot(projectId) } : {}),
      });
      store.dequeue(projectId, entry.storyId);
      store.setSubState(projectId, entry.storyId, 'preparing');
      return {
        runId,
        projectId,
        storyId: entry.storyId,
        startKind: entry.startKind,
        trigger,
        ...(entry.parentRunId ? { parentRunId: entry.parentRunId } : {}),
      };
    });
  }
}
