// SPDX-License-Identifier: Apache-2.0
import type { ExecSubState } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import { pendingDecisions, type BoardStoryRow, type PendingPermission } from '../src/index.js';

const row = (storyId: string, status: BoardStoryRow['status'], overrides: Partial<BoardStoryRow> = {}): BoardStoryRow => ({
  storyId,
  title: `Story ${storyId}`,
  size: null,
  approval: 'approved',
  status,
  subState: (status === 'in_progress' ? 'running' : 'none') as ExecSubState,
  order: null,
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  authorisedAt: null,
  ...overrides,
});

const permission = (id: string, runId: string): PendingPermission => ({
  id,
  runId,
  projectId: 'p1',
  runKind: 'implement',
  toolName: 'Bash',
  input: { command: 'npm test' },
  cwd: '/wt/US-001',
  outsideWorkspace: false,
  requestedAt: '2026-10-15T12:00:00.000Z',
});

describe('US-053 AC-2: pending decisions grouped by story/run', () => {
  it('lists permission requests, stories in Review, failed/interrupted runs and blocked queue items', () => {
    const groups = pendingDecisions({
      stories: [
        row('US-001', 'in_progress', { subState: 'awaiting_permission' }),
        row('US-002', 'review'),
        row('US-003', 'in_progress', { subState: 'failed', statusNotice: 'Failed: The agent crashed.' }),
        row('US-004', 'in_progress', { subState: 'interrupted' }),
        row('US-005', 'in_progress', { subState: 'blocked_conflict', queueReason: 'conflict', waitingFor: ['src/a.ts'] }),
        row('US-006', 'ready'),
      ],
      permissions: [permission('q1', 'run-1'), permission('q2', 'run-1')],
      storyOfRun: (runId) => (runId === 'run-1' ? 'US-001' : null),
      recommendations: [],
    });

    expect(groups.map((g) => [g.storyId, g.items.map((i) => i.kind)])).toEqual([
      ['US-001', ['permission', 'permission']],
      ['US-003', ['failed']],
      ['US-004', ['interrupted']],
      ['US-005', ['blocked']],
      ['US-002', ['review']],
    ]);
    expect(groups[0]).toMatchObject({
      title: 'Story US-001',
      items: [{ kind: 'permission', permission: { id: 'q1' } }, { kind: 'permission' }],
    });
    expect(groups.find((g) => g.storyId === 'US-003')!.items[0]).toMatchObject({ detail: 'Failed: The agent crashed.' });
    expect(groups.find((g) => g.storyId === 'US-005')!.items[0]).toMatchObject({ detail: 'Conflicting files: src/a.ts' });
  });

  it('counts all items and includes recommendations', () => {
    const groups = pendingDecisions({
      stories: [row('US-002', 'review')],
      permissions: [],
      storyOfRun: () => null,
      recommendations: [{ id: 'r1', storyId: 'US-002', runId: 'run-9', text: 'Move US-002 to Done' }],
    });
    expect(groups).toEqual([
      {
        storyId: 'US-002',
        title: 'Story US-002',
        items: [
          { kind: 'review', detail: 'Ready for your review' },
          { kind: 'recommendation', detail: 'Move US-002 to Done', id: 'r1', runId: 'run-9' },
        ],
      },
    ]);
  });

  it('permission requests of specification runs (no story) are grouped by run', () => {
    const groups = pendingDecisions({
      stories: [],
      permissions: [permission('q9', 'run-spec')],
      storyOfRun: () => null,
      recommendations: [],
    });
    expect(groups).toEqual([
      { storyId: null, runId: 'run-spec', title: 'Run run-spec', items: [expect.objectContaining({ kind: 'permission' })] },
    ]);
  });
});
