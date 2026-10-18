// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { orderQueue, planStarts, type QueueEntry } from '../src/index.js';

const entry = (storyId: string, queuedAt: string, overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  storyId,
  queuedAt,
  priority: 1,
  startKind: 'implement',
  ...overrides,
});

describe('US-042 AC-2: queue order and limit (SchedulingPolicy, ADR-009)', () => {
  it('orders corrections/resumes first, then FIFO by authorisation time', () => {
    const queue = [
      entry('US-003', '2026-10-15T10:03:00Z'),
      entry('US-001', '2026-10-15T10:01:00Z'),
      entry('US-009', '2026-10-15T10:09:00Z', { priority: 0, startKind: 'correct' }),
      entry('US-002', '2026-10-15T10:02:00Z'),
    ];

    expect(orderQueue(queue).map((e) => e.storyId)).toEqual(['US-009', 'US-001', 'US-002', 'US-003']);
  });

  it('starts as many as free slots allow and records "slot" for the rest', () => {
    const plan = planStarts({
      queue: [entry('US-001', 'a'), entry('US-002', 'b'), entry('US-003', 'c')],
      activeImplementationRuns: 1,
      limit: 2,
      openPredecessors: () => [],
      workspaceBusy: false,
    });

    expect(plan.start.map((e) => e.storyId)).toEqual(['US-001']);
    expect(plan.waiting).toEqual([
      { storyId: 'US-002', reason: 'slot', waitingFor: [] },
      { storyId: 'US-003', reason: 'slot', waitingFor: [] },
    ]);
  });

  it('never starts anything when the limit is already reached (e.g. lowered limit)', () => {
    const plan = planStarts({
      queue: [entry('US-001', 'a')],
      activeImplementationRuns: 3,
      limit: 2,
      openPredecessors: () => [],
      workspaceBusy: false,
    });
    expect(plan.start).toEqual([]);
  });
});

describe('US-042 AC-3: queue reasons', () => {
  it('records "dependency" with the open blocking predecessors; a later story without dependencies may start', () => {
    const plan = planStarts({
      queue: [entry('US-002', 'a'), entry('US-003', 'b')],
      activeImplementationRuns: 0,
      limit: 3,
      openPredecessors: (id) => (id === 'US-002' ? ['US-001'] : []),
      workspaceBusy: false,
    });

    expect(plan.start.map((e) => e.storyId)).toEqual(['US-003']);
    expect(plan.waiting).toEqual([{ storyId: 'US-002', reason: 'dependency', waitingFor: ['US-001'] }]);
  });

  it('records "workspace" in non-git mode while a writing spec/chat run is active (FR-116b)', () => {
    const plan = planStarts({
      queue: [entry('US-001', 'a')],
      activeImplementationRuns: 0,
      limit: 1,
      openPredecessors: () => [],
      workspaceBusy: true,
    });
    expect(plan.waiting).toEqual([{ storyId: 'US-001', reason: 'workspace', waitingFor: [] }]);
  });
});

describe('US-043 AC-4 / FR-067: blocked (conflict) entries', () => {
  it('keep waiting with reason "conflict" until re-checked and take no slot', () => {
    const plan = planStarts({
      queue: [
        { storyId: 'US-001', queuedAt: 'a', priority: 1, startKind: 'implement', blockedByConflict: true },
        { storyId: 'US-002', queuedAt: 'b', priority: 1, startKind: 'implement' },
      ],
      activeImplementationRuns: 0,
      limit: 1,
      openPredecessors: () => [],
      workspaceBusy: false,
    });
    expect(plan.start.map((e) => e.storyId)).toEqual(['US-002']);
    expect(plan.waiting).toEqual([]);
  });
});
