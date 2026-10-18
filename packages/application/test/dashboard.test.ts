// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { buildDashboard, type DashboardInput } from '../src/index.js';

const input: DashboardInput = {
  stories: [
    { storyId: 'US-001', status: 'done' },
    { storyId: 'US-002', status: 'review' },
    { storyId: 'US-003', status: 'in_progress' },
    { storyId: 'US-004', status: 'backlog' },
  ],
  runs: [
    {
      runId: 'r1',
      storyId: 'US-001',
      kind: 'implement',
      status: 'completed',
      createdAt: '2026-10-16T08:00:00.000Z',
      endedAt: '2026-10-16T08:10:00.000Z',
    },
    {
      runId: 'r2',
      storyId: null,
      kind: 'generate',
      status: 'completed',
      createdAt: '2026-10-16T09:00:00.000Z',
      endedAt: '2026-10-16T09:05:00.000Z',
    },
    { runId: 'r3', storyId: 'US-003', kind: 'implement', status: 'running', createdAt: '2026-10-16T10:00:00.000Z', endedAt: null },
  ],
  queued: 2,
  pendingDecisions: 3,
  unmerged: 1,
  artifacts: [
    { path: 'spec/01_intent/intent.md', kind: 'intent', approval: 'approved', impacted: false },
    { path: 'spec/02_requirements/fr.md', kind: 'requirements', approval: 'approved', impacted: true },
    { path: 'spec/04_user_stories/epics/EP-001.md', kind: 'epic', approval: 'draft', impacted: false },
    { path: 'spec/04_user_stories/US-001.md', kind: 'story', approval: 'approved', impacted: false },
    { path: 'notes/readme.md', kind: 'other', approval: 'draft', impacted: false },
  ],
  lanes: [
    { epicId: 'EP-001', title: 'Login', status: 'in_progress', progress: { done: 1, total: 3, doneWeight: 3, totalWeight: 9 }, colour: 0 },
    { epicId: null, title: 'No epic', status: 'not_started', progress: { done: 0, total: 1, doneWeight: 0, totalWeight: 3 }, colour: null },
  ],
};

describe('US-061: dashboard read model', () => {
  it('AC-1: story counts per state, progress, active/queued runs, pending decisions, unmerged branches and recent activity', () => {
    const d = buildDashboard(input);
    expect(d.storyCounts).toEqual({ backlog: 1, ready: 0, in_progress: 1, review: 1, done: 1 });
    expect(d.progress).toEqual({ done: 1, total: 4 });
    expect(d.runs).toEqual({ active: 1, queued: 2 });
    expect(d.pendingDecisions).toBe(3);
    expect(d.unmerged).toBe(1);
    expect(d.activity.map((a) => [a.runId, a.label])).toEqual([
      ['r3', 'US-003: implementation running'],
      ['r2', 'Specification generate completed'],
      ['r1', 'US-001: implementation completed'],
    ]);
  });

  it('AC-2: artifacts per phase with approval and impact state (epics with the user stories)', () => {
    expect(buildDashboard(input).artifacts).toEqual([
      { phase: 'intent', items: [{ path: 'spec/01_intent/intent.md', approval: 'approved', impacted: false }] },
      { phase: 'requirements', items: [{ path: 'spec/02_requirements/fr.md', approval: 'approved', impacted: true }] },
      { phase: 'design', items: [] },
      {
        phase: 'stories',
        items: [
          { path: 'spec/04_user_stories/epics/EP-001.md', approval: 'draft', impacted: false },
          { path: 'spec/04_user_stories/US-001.md', approval: 'approved', impacted: false },
        ],
      },
    ]);
  });

  it('AC-3/AC-4: epics with status and progress; Kanban only once stories exist; activity limited to 10', () => {
    const d = buildDashboard(input);
    expect(d.epics).toEqual([
      { epicId: 'EP-001', title: 'Login', status: 'in_progress', progress: { done: 1, total: 3, doneWeight: 3, totalWeight: 9 } },
    ]);
    expect(d.kanbanEnabled).toBe(true);
    expect(buildDashboard({ ...input, stories: [] }).kanbanEnabled).toBe(false);
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...input.runs[0]!,
      runId: `x${i}`,
      endedAt: `2026-10-16T08:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    expect(buildDashboard({ ...input, runs: many }).activity).toHaveLength(10);
  });
});
