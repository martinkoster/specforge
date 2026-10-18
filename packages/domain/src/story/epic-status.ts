// SPDX-License-Identifier: Apache-2.0
// Derived epic status and progress (FR-095, ADR-020): epics are never executed or moved; their status follows from
// their stories, the stored epic-review outcome and merge detection.
import type { BoardStatus } from './state-machine.js';

export type EpicStatus = 'not_started' | 'in_progress' | 'ready_for_review' | 'done' | 'merged';

export interface EpicStoryState {
  status: BoardStatus;
  size: string | null;
  /** The story branch was merged by the user (FR-115). */
  merged: boolean;
}

export interface EpicProgress {
  done: number;
  total: number;
  doneWeight: number;
  totalWeight: number;
}

const WEIGHTS: Record<string, number> = { XS: 1, S: 2, M: 3, L: 5, XL: 8 };

/** Size weight of a story for the size-weighted progress (unknown sizes count as M). */
export function sizeWeight(size: string | null): number {
  return (size && WEIGHTS[size]) || WEIGHTS.M!;
}

export function deriveEpicStatus(
  stories: readonly EpicStoryState[],
  reviewOutcome: 'confirmed' | 'skipped' | string | null,
): { status: EpicStatus; progress: EpicProgress } {
  const done = stories.filter((s) => s.status === 'done');
  const progress: EpicProgress = {
    done: done.length,
    total: stories.length,
    doneWeight: done.reduce((sum, s) => sum + sizeWeight(s.size), 0),
    totalWeight: stories.reduce((sum, s) => sum + sizeWeight(s.size), 0),
  };
  if (stories.length === 0 || stories.every((s) => s.status === 'backlog' || s.status === 'ready'))
    return { status: 'not_started', progress };
  if (done.length < stories.length) return { status: 'in_progress', progress };
  if (reviewOutcome !== 'confirmed' && reviewOutcome !== 'skipped') return { status: 'ready_for_review', progress };
  return { status: stories.every((s) => s.merged) ? 'merged' : 'done', progress };
}
