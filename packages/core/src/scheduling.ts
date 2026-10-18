// SPDX-License-Identifier: Apache-2.0
// Scheduler wiring (US-042): scheduling context from the index and settings, and the board → scheduler event mapping.
import { Scheduler, type RunLauncher, type SchedulingContext } from '@specforge/application';
import type { StoryCommand } from '@specforge/domain';
import type { ExecutionStore, IndexRepository, ProjectRepository } from '@specforge/sqlite';

/** Default parallel implementation runs (FR-027); configurable per project in project settings. */
export const DEFAULT_CONCURRENCY_LIMIT = 3;

export interface SchedulingDeps {
  store: ExecutionStore;
  index: IndexRepository;
  projects: ProjectRepository;
  /** Synchronous VCS mode lookup (cached from the last open). */
  vcsMode(projectId: string): 'git' | 'none' | undefined;
  /** Effective agent/execution configuration recorded on each new run (FR-052). */
  configSnapshot?(projectId: string): unknown;
  /** Effective parallel-runs limit (project settings; 1 without Git). */
  limit?(projectId: string): number;
  /** Starts launched runs (the ExecutionService). */
  launcher: RunLauncher;
}

export function createScheduler(deps: SchedulingDeps): Scheduler {
  const context: SchedulingContext = {
    limit: (projectId) => deps.limit?.(projectId) ?? (deps.vcsMode(projectId) === 'none' ? 1 : DEFAULT_CONCURRENCY_LIMIT),
    openPredecessors: (projectId, storyId) => {
      const status = new Map(deps.index.stories(projectId).map((s) => [s.storyId, s.status]));
      return deps.index
        .dependencies(projectId)
        .filter((d) => d.from === storyId && d.type === 'blocking' && status.get(d.to) !== 'done')
        .map((d) => d.to);
    },
    workspaceBusy: (projectId) => deps.vcsMode(projectId) === 'none' && deps.store.activeWorkspaceWriters(projectId) > 0,
    ...(deps.configSnapshot ? { configSnapshot: deps.configSnapshot } : {}),
  };
  return new Scheduler({ store: deps.store, context, launcher: deps.launcher });
}

/** Board transitions that the Scheduler must hear about (BoardService → Scheduler, service_design.md). */
export async function notifyScheduler(
  scheduler: Scheduler,
  store: ExecutionStore,
  index: IndexRepository,
  projectId: string,
  storyId: string,
  command: StoryCommand,
): Promise<void> {
  const at = index.stories(projectId).find((s) => s.storyId === storyId)?.authorisedAt ?? new Date().toISOString();
  switch (command) {
    case 'startImplementation':
      store.setStatusNotice(projectId, storyId, null);
      return scheduler.post({ type: 'StoryAuthorised', projectId, storyId, at });
    case 'removeFromQueue':
      return scheduler.post({ type: 'StoryDequeued', projectId, storyId });
    case 'recheckConflict':
      store.setStatusNotice(projectId, storyId, null);
      return scheduler.post({ type: 'ConflictResolved', projectId, storyId });
    case 'approveImplementation':
      return scheduler.post({ type: 'StoryApproved', projectId, storyId });
    case 'requestCorrections':
    case 'resumeRun':
    case 'retryRun': {
      const parentRunId = store.lastRunId(projectId, storyId);
      if (!parentRunId) return scheduler.post({ type: 'StoryAuthorised', projectId, storyId, at });
      store.setStatusNotice(projectId, storyId, null);
      return scheduler.post({
        type: command === 'requestCorrections' ? 'CorrectionRequested' : command === 'resumeRun' ? 'ResumeRequested' : 'RetryRequested',
        projectId,
        storyId,
        at: new Date().toISOString(),
        parentRunId,
      });
    }
    case 'discardRun':
    case 'rejectImplementation':
      store.setStatusNotice(projectId, storyId, null);
      return;
    default:
      return;
  }
}
