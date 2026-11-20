// SPDX-License-Identifier: Apache-2.0
// US-087: trace-based feature impact (FR-106, NFR-032), confirmation and the scope for the delta phases.
import { describe, expect, it } from 'vitest';
import type { BoardStatus } from '@specforge/domain';
import { ImpactService, type ImpactItemRecord, type ImpactServiceDeps } from '../src/index.js';

function setup(over: Partial<ImpactServiceDeps> = {}) {
  const elements: Record<string, { type: string; title: string }> = {
    'FI-003': { type: 'feature_intent', title: 'Comments' },
    'FR-034': { type: 'fr', title: 'Task details' },
    'FR-099': { type: 'fr', title: 'Unrelated' },
    'UC-004': { type: 'uc', title: 'View task' },
    'ADR-005': { type: 'adr', title: 'Read-only viewers' },
    'EP-002': { type: 'epic', title: 'Task management' },
    'US-007': { type: 'story', title: 'Task view' },
    'US-008': { type: 'story', title: 'Task details' },
    'US-009': { type: 'story', title: 'Edit task' },
    'US-010': { type: 'story', title: 'Archive' },
  };
  // source → targets
  const links: [string, string][] = [
    ['FI-003', 'EP-002'],
    ['FI-003', 'FR-034'],
    ['FI-003', 'IDEA-007'],
    ['UC-004', 'FR-034'],
    ['ADR-005', 'UC-004'],
    ['US-007', 'UC-004'],
    ['US-008', 'FR-034'],
    ['US-010', 'FR-099'],
  ];
  const stories: { id: string; status: BoardStatus; epicId: string | null }[] = [
    { id: 'US-007', status: 'backlog', epicId: null },
    { id: 'US-008', status: 'done', epicId: 'EP-002' },
    { id: 'US-009', status: 'review', epicId: 'EP-002' },
    { id: 'US-010', status: 'backlog', epicId: null },
  ];
  const rows = new Map<string, ImpactItemRecord>();
  let n = 0;
  const deps: ImpactServiceDeps = {
    element: (_p, id) => elements[id],
    allLinks: () => links.map(([source, target]) => ({ source, target })),
    stories: () => stories,
    storyRuns: (_p, id) => (id === 'US-008' ? [{ runId: 'run-8', status: 'completed' }] : []),
    storyFiles: (_p, id) => (id === 'US-008' ? ['src/task.ts'] : id === 'US-009' ? ['src/task.ts', 'src/edit.ts'] : []),
    store: {
      replaceTraceItems: (projectId, featureId, items) => {
        for (const [id, r] of rows) if (r.projectId === projectId && r.featureId === featureId && r.origin === 'trace') rows.delete(id);
        for (const i of items) rows.set(i.id, i);
      },
      items: (projectId, featureId) => [...rows.values()].filter((r) => r.projectId === projectId && r.featureId === featureId),
      add: (item) => void rows.set(item.id, item),
      removeOrigin: () => undefined,
      remove: (id) => void rows.delete(id),
      confirm: (projectId, featureId) => {
        for (const r of rows.values()) if (r.projectId === projectId && r.featureId === featureId) r.confirmed = true;
      },
    },
    newId: () => `item-${++n}`,
    ...over,
  };
  return { service: new ImpactService(deps), rows };
}

const summary = (items: { targetRef: string; category: string }[]) => items.map((i) => `${i.category}:${i.targetRef}`).sort();

describe('US-087 AC-1: trace-based impact', () => {
  it('reaches requirements, design, ADRs, epics, stories by state, runs and files from the related epics and requirements', () => {
    const { service } = setup();
    const items = service.trace('p1', 'FI-003');

    expect(summary(items)).toEqual(
      [
        'requirement:FR-034',
        'design:UC-004',
        'adr:ADR-005',
        'epic:EP-002',
        'story_not_started:US-007',
        'story_done:US-008',
        'story_in_flight:US-009',
        'run:run-8',
        'code_area:src/task.ts',
        'code_area:src/edit.ts',
      ].sort(),
    );
    expect(items.every((i) => i.confidence === 'high' && i.origin === 'trace')).toBe(true);
    expect(items.find((i) => i.targetRef === 'UC-004')?.reason).toBe('References FR-034');
    expect(items.find((i) => i.targetRef === 'FR-034')?.reason).toBe('Related requirement of FI-003');
    expect(items.find((i) => i.targetRef === 'US-009')?.reason).toBe('Belongs to EP-002');
    expect(items.find((i) => i.targetRef === 'src/task.ts')?.reason).toMatch(/Changed by US-008/);
    expect(items.some((i) => i.targetRef === 'US-010' || i.targetRef === 'FR-099')).toBe(false);
  });

  it('NFR-032/NFR-030: 1,000 stories and 1,000 runs are traced well under 2 s', () => {
    const elements: Record<string, { type: string; title: string }> = {
      'FI-001': { type: 'feature_intent', title: 'F' },
      'EP-001': { type: 'epic', title: 'E' },
    };
    const links: { source: string; target: string }[] = [{ source: 'FI-001', target: 'EP-001' }];
    const stories = Array.from({ length: 1000 }, (_, i) => {
      const id = `US-${i}`;
      elements[id] = { type: 'story', title: id };
      links.push({ source: id, target: 'FR-001' });
      return { id, status: (['backlog', 'ready', 'in_progress', 'review', 'done'] as const)[i % 5], epicId: 'EP-001' };
    });
    const { service } = setup({
      element: (_p, id) => elements[id],
      allLinks: () => links,
      stories: () => stories,
      storyRuns: (_p, id) => [{ runId: `run-${id}`, status: 'completed' }],
      storyFiles: (_p, id) => [`src/${id}.ts`],
    });
    const started = performance.now();
    const items = service.trace('p1', 'FI-001');
    expect(performance.now() - started).toBeLessThan(2000);
    expect(items.filter((i) => i.category === 'run')).toHaveLength(1000);
  });
});

describe('US-087 AC-2/AC-3: proposing, editing and approving the impact list', () => {
  it('proposes the trace items, removes and adds items, approves the list and reports the state', () => {
    const { service } = setup();
    expect(service.state('p1', 'FI-003')).toBe('not_started');

    const proposed = service.propose('p1', 'FI-003');
    expect(proposed.state).toBe('proposed');
    expect(proposed.items).toHaveLength(10);

    service.remove('p1', proposed.items.find((i) => i.targetRef === 'ADR-005')!.id);
    service.add('p1', 'FI-003', 'US-010');
    service.add('p1', 'FI-003', 'docs/api.md');
    const edited = service.view('p1', 'FI-003');
    expect(edited.items.find((i) => i.targetRef === 'US-010')).toMatchObject({
      category: 'story_not_started',
      origin: 'user',
      reason: 'Added by you',
    });
    expect(edited.items.find((i) => i.targetRef === 'docs/api.md')).toMatchObject({ category: 'code_area', origin: 'user' });
    expect(edited.items.some((i) => i.targetRef === 'ADR-005')).toBe(false);
    expect(edited.columns.specs.map((i) => i.targetRef).sort()).toEqual(['FR-034', 'UC-004']);
    expect(edited.columns.work.map((i) => i.targetRef).sort()).toEqual(['EP-002', 'US-007', 'US-008', 'US-009', 'US-010']);
    expect(edited.columns.code.map((i) => i.targetRef).sort()).toEqual(['docs/api.md', 'run-8', 'src/edit.ts', 'src/task.ts']);

    // Proposing again (refresh) keeps the user's additions and brings back removed trace items.
    const refreshed = service.propose('p1', 'FI-003').items;
    expect(refreshed.some((i) => i.targetRef === 'US-010')).toBe(true);
    expect(refreshed.some((i) => i.targetRef === 'ADR-005')).toBe(true);
    service.remove('p1', refreshed.find((i) => i.targetRef === 'ADR-005')!.id);

    service.approve('p1', 'FI-003');
    expect(service.state('p1', 'FI-003')).toBe('confirmed');
    expect(service.view('p1', 'FI-003').items.every((i) => i.confirmed)).toBe(true);
    // AC-4: the confirmed list is the delta scope.
    expect(service.scope('p1', 'FI-003').sort()).toEqual(
      ['FR-034', 'UC-004', 'EP-002', 'US-007', 'US-008', 'US-009', 'US-010', 'docs/api.md', 'run-8', 'src/edit.ts', 'src/task.ts'].sort(),
    );
    expect(() => service.propose('p1', 'FI-003')).toThrow(/already approved/);
  });

  it('refuses to approve an empty list and adding unknown IDs', () => {
    const { service } = setup();
    expect(() => service.approve('p1', 'FI-003')).toThrow(/at least one/);
    expect(() => service.add('p1', 'FI-003', 'FR-404')).toThrow(/FR-404/);
    expect(() => service.add('p1', 'FI-003', '  ')).toThrow(/ID or a path/);
    expect(service.scope('p1', 'FI-003')).toEqual([]);
  });
});
