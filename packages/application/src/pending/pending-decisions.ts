// SPDX-License-Identifier: Apache-2.0
// Pending decisions (US-053 AC-2, FR-033, UC-027): everything waiting for the user, grouped by story or run and
// ordered by urgency.
import type { BoardStoryRow } from '../board/board-service.js';
import type { PendingPermission } from '../permissions/permission-broker.js';

export interface Recommendation {
  id: string;
  storyId: string | null;
  runId: string;
  text: string;
}

export type PendingItem =
  | { kind: 'permission'; permission: PendingPermission }
  | { kind: 'failed' | 'interrupted' | 'blocked' | 'review'; detail: string }
  | { kind: 'recommendation'; detail: string; id: string; runId: string };

export type PendingGroup =
  { storyId: string; title: string; items: PendingItem[] } | { storyId: null; runId: string; title: string; items: PendingItem[] };

export interface PendingInputs {
  stories: readonly BoardStoryRow[];
  permissions: readonly PendingPermission[];
  storyOfRun(runId: string): string | null;
  recommendations: readonly Recommendation[];
}

const URGENCY: Record<PendingItem['kind'], number> = { permission: 0, failed: 1, interrupted: 1, blocked: 2, review: 3, recommendation: 4 };

export function pendingDecisions(inputs: PendingInputs): PendingGroup[] {
  const byStory = new Map<string, PendingItem[]>();
  const byRun = new Map<string, PendingItem[]>();
  const add = (storyId: string | null, runId: string | null, item: PendingItem): void => {
    const map = storyId ? byStory : byRun;
    const key = (storyId ?? runId)!;
    map.set(key, [...(map.get(key) ?? []), item]);
  };

  for (const permission of inputs.permissions)
    add(inputs.storyOfRun(permission.runId), permission.runId, { kind: 'permission', permission });
  for (const story of inputs.stories) {
    if (story.subState === 'failed') add(story.storyId, null, { kind: 'failed', detail: story.statusNotice ?? 'The run failed.' });
    else if (story.subState === 'interrupted')
      add(story.storyId, null, { kind: 'interrupted', detail: story.statusNotice ?? 'The run was interrupted.' });
    else if (story.subState === 'blocked_conflict' || story.queueReason === 'conflict') {
      add(story.storyId, null, { kind: 'blocked', detail: `Conflicting files: ${story.waitingFor.join(', ')}` });
    } else if (story.status === 'review') add(story.storyId, null, { kind: 'review', detail: 'Ready for your review' });
  }
  for (const r of inputs.recommendations) add(r.storyId, r.runId, { kind: 'recommendation', detail: r.text, id: r.id, runId: r.runId });

  const titles = new Map(inputs.stories.map((s) => [s.storyId, s.title]));
  const groups: PendingGroup[] = [
    ...[...byStory].map(([storyId, items]): PendingGroup => ({ storyId, title: titles.get(storyId) ?? `Story ${storyId}`, items })),
    ...[...byRun].map(([runId, items]): PendingGroup => ({ storyId: null, runId, title: `Run ${runId}`, items })),
  ];
  const rank = (g: PendingGroup): number => Math.min(...g.items.map((i) => URGENCY[i.kind]));
  const key = (g: PendingGroup): string => g.storyId ?? g.runId;
  return groups
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind]) }))
    .sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)));
}

export function pendingCount(groups: readonly PendingGroup[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}
