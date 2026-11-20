// SPDX-License-Identifier: Apache-2.0
// US-102 (FR-098) Start epic and US-103 (FR-084) implementation plan / Start wave.
import type { BoardStatus, StoryDependency } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import { PlanService, type PlanServiceDeps } from '../src/index.js';

const row = (storyId: string, status: BoardStatus, epicId: string | null, size: string | null = 'S') => ({
  storyId,
  title: `Story ${storyId}`,
  status,
  epicId,
  size,
});

function setup(rows: ReturnType<typeof row>[], deps: StoryDependency[] = [], limit = 3) {
  const moves: string[] = [];
  const service = new PlanService({
    stories: () => rows,
    dependencies: () => deps,
    limit: () => limit,
    move: async (_p, storyId) => {
      moves.push(storyId);
      return storyId === 'US-099' ? { ok: false, reason: 'Draft stories cannot start.' } : { ok: true };
    },
  } satisfies PlanServiceDeps);
  return { service, moves };
}

describe('US-102: Start epic', () => {
  it('AC-1: the preview lists the Ready stories to start and the skipped ones', () => {
    const { service } = setup([
      row('US-001', 'ready', 'EP-001'),
      row('US-002', 'backlog', 'EP-001'),
      row('US-003', 'ready', 'EP-001'),
      row('US-004', 'done', 'EP-001'),
      row('US-010', 'ready', 'EP-002'),
    ]);
    expect(service.epicPreview('p1', 'EP-001')).toEqual({
      start: ['US-001', 'US-003'],
      skipped: [
        { storyId: 'US-002', status: 'backlog' },
        { storyId: 'US-004', status: 'done' },
      ],
    });
  });

  it('AC-2: confirming moves each Ready story to In Progress separately; refused moves are reported', async () => {
    const { service, moves } = setup([
      row('US-001', 'ready', 'EP-001'),
      row('US-099', 'ready', 'EP-001'),
      row('US-002', 'review', 'EP-001'),
    ]);
    await expect(service.startEpic('p1', 'EP-001')).resolves.toEqual({
      started: ['US-001'],
      failed: [{ storyId: 'US-099', reason: 'Draft stories cannot start.' }],
      skipped: [{ storyId: 'US-002', status: 'review' }],
    });
    expect(moves).toEqual(['US-001', 'US-099']);
  });
});

describe('US-103: the implementation plan', () => {
  const rows = [
    row('A', 'ready', 'EP-001'),
    row('B', 'backlog', 'EP-001'),
    row('C', 'backlog', 'EP-002'),
    row('D', 'ready', 'EP-002', 'M'),
    row('E', 'in_progress', null),
  ];
  const deps: StoryDependency[] = [
    { from: 'B', to: 'A', type: 'blocking' },
    { from: 'C', to: 'B', type: 'blocking' },
  ];

  it('AC-1/AC-4: waves with stories, sizes, the critical path and the epic graph', () => {
    const { service } = setup(rows, deps);
    const plan = service.plan('p1');
    expect(plan.limit).toBe(3);
    expect(plan.waves.map((w) => w.stories.map((s) => s.id))).toEqual([['A', 'D', 'E'], ['B'], ['C']]);
    expect(plan.waves.map((w) => w.size)).toEqual([7, 2, 2]);
    expect(plan.waves[0]!.stories[1]).toEqual({ id: 'D', title: 'Story D', status: 'ready', epicId: 'EP-002', size: 'M' });
    expect(plan.criticalPath).toEqual(['A', 'B', 'C']);
    expect(plan.epicEdges).toEqual([{ from: 'EP-002', to: 'EP-001' }]);
  });

  it('AC-3: Start wave moves the Ready stories of the wave; the others are listed as skipped', async () => {
    const { service, moves } = setup(rows, deps);
    expect(service.wavePreview('p1', 0)).toEqual({ start: ['A', 'D'], skipped: [{ storyId: 'E', status: 'in_progress' }] });
    await expect(service.startWave('p1', 0)).resolves.toEqual({
      started: ['A', 'D'],
      failed: [],
      skipped: [{ storyId: 'E', status: 'in_progress' }],
    });
    expect(moves).toEqual(['A', 'D']);
    expect(() => service.wavePreview('p1', 9)).toThrow('wave 10');
  });
});
