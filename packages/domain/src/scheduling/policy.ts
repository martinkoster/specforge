// SPDX-License-Identifier: Apache-2.0
// SchedulingPolicy (ADR-009, FR-027, FR-065, FR-116b): which queued stories may start now, and why the others wait.

export type StartKind = 'implement' | 'correct' | 'retry' | 'resume';
export type QueueReason = 'dependency' | 'slot' | 'workspace' | 'conflict';

export interface QueueEntry {
  storyId: string;
  /** Authorisation time (ISO-8601). */
  queuedAt: string;
  /** 0 = correction / resume, 1 = normal (incl. retry). */
  priority: 0 | 1;
  startKind: StartKind;
  parentRunId?: string;
  /** *Blocked (conflict)*: waits for a re-check and is not considered until then (FR-067). */
  blockedByConflict?: boolean;
}

export interface SchedulingInput {
  queue: readonly QueueEntry[];
  /** Implementation, correction, retry and resume runs that are preparing, running or awaiting permission. */
  activeImplementationRuns: number;
  /** Effective concurrency limit (1 in non-git mode). */
  limit: number;
  /** Blocking predecessors of a story that are not Done. */
  openPredecessors(storyId: string): readonly string[];
  /** Non-git mode with a write-capable chat/spec run active. */
  workspaceBusy: boolean;
}

export interface WaitingEntry {
  storyId: string;
  reason: Exclude<QueueReason, 'conflict'>;
  waitingFor: string[];
}

export interface StartPlan {
  start: QueueEntry[];
  waiting: WaitingEntry[];
}

export const priorityFor = (startKind: StartKind): 0 | 1 => (startKind === 'correct' || startKind === 'resume' ? 0 : 1);

/** Corrections/resumes first, then FIFO by authorisation time (story id as stable tie-breaker). */
export function orderQueue(queue: readonly QueueEntry[]): QueueEntry[] {
  return [...queue].sort((a, b) => a.priority - b.priority || a.queuedAt.localeCompare(b.queuedAt) || a.storyId.localeCompare(b.storyId));
}

export function planStarts(input: SchedulingInput): StartPlan {
  let free = Math.max(0, input.limit - input.activeImplementationRuns);
  const plan: StartPlan = { start: [], waiting: [] };
  for (const entry of orderQueue(input.queue)) {
    if (entry.blockedByConflict) continue;
    const open = input.openPredecessors(entry.storyId);
    if (open.length > 0) plan.waiting.push({ storyId: entry.storyId, reason: 'dependency', waitingFor: [...open] });
    else if (input.workspaceBusy) plan.waiting.push({ storyId: entry.storyId, reason: 'workspace', waitingFor: [] });
    else if (free > 0) {
      plan.start.push(entry);
      free -= 1;
    } else plan.waiting.push({ storyId: entry.storyId, reason: 'slot', waitingFor: [] });
  }
  return plan;
}
