// SPDX-License-Identifier: Apache-2.0
// Ports of the Scheduler (US-042, ADR-009): queue and run persistence, scheduling context, run launching.
import type { ExecSubState, QueueEntry, QueueReason, StartKind } from '@specforge/domain';
import type { RunKind } from '../ports/agent-adapter.js';

export type RunStatus =
  'preparing' | 'running' | 'awaiting_approval' | 'completed' | 'completed_no_result' | 'failed' | 'cancelled' | 'interrupted';

/** Run statuses that occupy a slot (implementation kinds) and block a second launch of the same story. */
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['preparing', 'running', 'awaiting_approval'];

export interface StoredQueueEntry extends QueueEntry {
  reason: QueueReason | null;
  waitingFor: string[];
}

export interface NewRun {
  storyId: string | null;
  kind: RunKind;
  startKind: StartKind | null;
  trigger: string;
  parentRunId?: string;
  configSnapshot?: unknown;
}

export interface RunRecord {
  id: string;
  projectId: string;
  storyId: string | null;
  kind: RunKind;
  startKind: StartKind | null;
  parentRunId: string | null;
  status: RunStatus;
  startTrigger: string | null;
  configSnapshot: unknown;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  agentSessionId: string | null;
  lastEventSeq: number;
}

/** Synchronous so that one evaluation runs inside one database transaction. */
export interface SchedulerStore {
  transaction<T>(fn: () => T): T;
  queue(projectId: string): StoredQueueEntry[];
  enqueue(projectId: string, entry: QueueEntry): void;
  dequeue(projectId: string, storyId: string): void;
  setWaiting(projectId: string, storyId: string, reason: QueueReason, waitingFor: string[]): void;
  activeImplementationRuns(projectId: string): number;
  hasActiveRun(projectId: string, storyId: string): boolean;
  createRun(projectId: string, run: NewRun): string;
  setSubState(projectId: string, storyId: string, subState: ExecSubState): void;
  projectsWithQueue(): string[];
}
