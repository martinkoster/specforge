// SPDX-License-Identifier: Apache-2.0
// Rework stories (FR-109, US-092): Done stories are never reopened; a new story with `reworks: [US-008]` changes them.
import type { BoardStatus } from './state-machine.js';

const STATUS_LABEL: Record<BoardStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

/** Why the `reworks` targets of `storyId` are invalid: every target must exist and be Done. */
export function reworkIssues(storyId: string, reworks: readonly string[], statusOf: (id: string) => BoardStatus | undefined): string[] {
  return reworks.flatMap((target) => {
    if (target === storyId) return [`${storyId} cannot rework itself.`];
    const status = statusOf(target);
    if (status === undefined) return [`${storyId} reworks ${target}, which does not exist.`];
    if (status !== 'done') return [`${storyId} reworks ${target}, which is not Done (${STATUS_LABEL[status]}).`];
    return [];
  });
}

/** Original story → the stories reworking it, in story order ("Reworked by US-xxx"). */
export function reworkedBy(stories: ReadonlyArray<{ storyId: string; reworks: readonly string[] }>): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const s of [...stories].sort((a, b) => a.storyId.localeCompare(b.storyId))) {
    for (const target of s.reworks) by.set(target, [...(by.get(target) ?? []), s.storyId]);
  }
  return by;
}
