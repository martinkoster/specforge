// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { BoardData } from '../src/board/KanbanBoard.js';
import { badgesFor, earlyQueueWarning, queueLabel, relationsOf } from '../src/board/dependencies.js';

type Card = BoardData['columns'][number]['cards'][number];
const card = (storyId: string, status: Card['status'], overrides: Partial<Card> = {}): Card => ({
  storyId,
  title: `Story ${storyId}`,
  size: null,
  approval: 'approved',
  status,
  subState: status === 'in_progress' ? 'queued' : 'none',
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  dependsOn: [],
  related: [],
  ...overrides,
});

const board = (cards: Card[], queue: string[] = [], slots = { active: 0, limit: 3 }): BoardData => ({
  columns: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const).map((status) => ({
    status,
    cards: cards.filter((c) => c.status === status),
  })),
  queue,
  slots,
});

describe('US-041 AC-1: dependency badges', () => {
  it('counts open blocking predecessors, open dependents and related stories; Done predecessors no longer block', () => {
    const b = board([
      card('US-001', 'done'),
      card('US-002', 'review'),
      card('US-003', 'backlog', { dependsOn: ['US-001', 'US-002'], related: ['US-004'] }),
      card('US-004', 'backlog', { dependsOn: ['US-003'], related: ['US-003'] }),
      card('US-005', 'done', { dependsOn: ['US-003'] }),
    ]);

    expect(badgesFor(b, 'US-003')).toEqual({ blockedBy: 1, blocks: 1, related: 1 });
    expect(badgesFor(b, 'US-002')).toEqual({ blockedBy: 0, blocks: 1, related: 0 });
    expect(badgesFor(b, 'US-001')).toEqual({ blockedBy: 0, blocks: 0, related: 0 });
  });
});

describe('US-041 AC-2: relations of a selected card', () => {
  it('returns predecessors, successors and related stories', () => {
    const b = board([
      card('US-001', 'done'),
      card('US-002', 'ready', { dependsOn: ['US-001'], related: ['US-003'] }),
      card('US-003', 'backlog', { dependsOn: ['US-002'], related: ['US-002'] }),
    ]);
    expect(relationsOf(b, 'US-002')).toEqual({ predecessors: ['US-001'], successors: ['US-003'], related: ['US-003'] });
  });
});

describe('US-043 AC-1: queue reason labels', () => {
  it('names the waiting-for story with its column, the slot usage and the workspace', () => {
    const b = board(
      [
        card('US-001', 'review'),
        card('US-002', 'in_progress', { queueReason: 'dependency', waitingFor: ['US-001'] }),
        card('US-003', 'in_progress', { queueReason: 'slot' }),
        card('US-004', 'in_progress', { queueReason: 'workspace' }),
        card('US-005', 'in_progress', { subState: 'blocked_conflict', queueReason: 'conflict', waitingFor: ['src/a.ts'] }),
      ],
      [],
      { active: 3, limit: 3 },
    );

    expect(queueLabel(b, card('US-002', 'in_progress', { queueReason: 'dependency', waitingFor: ['US-001'] }))).toBe(
      'Waiting for US-001 (Review)',
    );
    expect(queueLabel(b, card('US-003', 'in_progress', { queueReason: 'slot' }))).toBe('Waiting for run slot (3/3)');
    expect(queueLabel(b, card('US-004', 'in_progress', { queueReason: 'workspace' }))).toBe('Waiting for workspace');
    expect(queueLabel(b, card('US-005', 'in_progress', { subState: 'blocked_conflict', queueReason: 'conflict' }))).toBe(
      'Blocked (conflict)',
    );
    expect(queueLabel(b, card('US-006', 'in_progress'))).toBe('Queued');
  });
});

describe('US-043 AC-2: warning before queuing behind unstarted predecessors', () => {
  it('warns when a blocking predecessor is still in Backlog or Ready', () => {
    const b = board([
      card('US-001', 'backlog'),
      card('US-002', 'ready', { dependsOn: ['US-001'] }),
      card('US-003', 'ready', { dependsOn: ['US-004'] }),
      card('US-004', 'review'),
    ]);

    expect(earlyQueueWarning(b, 'US-002')).toBe(
      'US-002 depends on US-001 (Backlog), which has not been started. It will wait in the queue until its predecessors are Done. Queue it anyway?',
    );
    expect(earlyQueueWarning(b, 'US-003')).toBeNull();
  });
});
