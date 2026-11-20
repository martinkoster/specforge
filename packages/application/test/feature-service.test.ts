// SPDX-License-Identifier: Apache-2.0
// US-081: feature intents — list/get with derived status and links, status written by SpecForge only.
import { describe, expect, it } from 'vitest';
import type { BoardStatus, FeatureStatus } from '@specforge/domain';
import { FeatureService, type FeatureEvent, type FeatureServiceDeps, type FeatureRecord } from '../src/index.js';

function setup(
  options: {
    features?: FeatureRecord[];
    stories?: Record<string, { id: string; status: BoardStatus }[]>;
    delta?: string[];
    extra?: Partial<FeatureServiceDeps>;
  } = {},
) {
  const files = new Map<string, { content: string; hash: string }>();
  const features = options.features ?? [];
  for (const f of features) {
    files.set(f.path, {
      content: `---\nkind: feature_intent\nid: ${f.id}\ntitle: ${f.title}\nstatus: ${f.status}\n---\n## Problem\n`,
      hash: `h-${f.id}`,
    });
  }
  const reindexed: string[] = [];
  const deps: FeatureServiceDeps = {
    index: {
      features: () => features,
      featureStories: (_p, id) => options.stories?.[id] ?? [],
      linkSources: (_p, id) => [...(options.stories?.[id] ?? []).map((s) => s.id), 'FR-040', 'FR-012', 'EP-004'],
      linkType: (_p, source) =>
        source === 'FR-012'
          ? 'changes'
          : source === 'FR-040' || source.startsWith('US-') || source === 'EP-004'
            ? 'introduces'
            : 'references',
    },
    acceptedDelta: (_p, id) => options.delta?.includes(id) ?? false,
    files: () => ({
      read: async (path) => files.get(path),
      writeAtomic: async (path, content, { expectedHash }) => {
        if (files.get(path)?.hash !== expectedHash) throw new Error('conflict');
        files.set(path, { content, hash: `${expectedHash}+` });
        return `${expectedHash}+`;
      },
    }),
    reindex: async (_p, path) => {
      reindexed.push(path);
      const f = features.find((x) => x.path === path);
      if (!f) return;
      f.status = /status: (\w+)/.exec(files.get(path)!.content)![1] as FeatureStatus;
    },
    ...options.extra,
  };
  return { service: new FeatureService(deps), files, reindexed, features };
}

const record = (id: string, approval: 'draft' | 'approved', status: FeatureStatus): FeatureRecord => ({
  id,
  title: `Feature ${id}`,
  approval,
  status,
  sourceIdea: null,
  baseline: null,
  path: `spec/01_intent/${id}-x.md`,
});

describe('US-081 AC-5: feature.list / feature.get', () => {
  it('lists features with the derived status and returns links with their trace types', () => {
    const { service } = setup({
      features: [record('FI-001', 'approved', 'approved'), record('FI-002', 'draft', 'draft')],
      stories: { 'FI-001': [{ id: 'US-010', status: 'review' }] },
    });

    expect(service.list('p1').map((f) => [f.id, f.status, f.storyCount])).toEqual([
      ['FI-001', 'in_delivery', 1],
      ['FI-002', 'draft', 0],
    ]);
    const fi = service.get('p1', 'FI-001');
    expect(fi).toMatchObject({ id: 'FI-001', status: 'in_delivery', path: 'spec/01_intent/FI-001-x.md' });
    expect(fi?.links).toEqual([
      { id: 'EP-004', type: 'introduces' },
      { id: 'FR-012', type: 'changes' },
      { id: 'FR-040', type: 'introduces' },
      { id: 'US-010', type: 'introduces' },
    ]);
    expect(service.get('p1', 'FI-404')).toBeUndefined();
  });

  it('AC-2: proposes the next free FI id', () => {
    const { service } = setup({ features: [record('FI-001', 'draft', 'draft'), record('FI-004', 'draft', 'draft')] });
    expect(service.nextId('p1')).toBe('FI-005');
  });
});

describe('US-081 AC-4: the status is written by SpecForge', () => {
  it('writes the derived status into the front-matter and re-indexes; unchanged features are left alone', async () => {
    const { service, files, reindexed } = setup({
      features: [
        record('FI-001', 'approved', 'in_delivery'),
        record('FI-002', 'approved', 'approved'),
        record('FI-003', 'approved', 'approved'),
      ],
      stories: { 'FI-001': [{ id: 'US-010', status: 'done' }], 'FI-002': [] },
      delta: ['FI-003'],
    });

    expect(await service.sync('p1')).toEqual(['FI-001', 'FI-003']);

    expect(files.get('spec/01_intent/FI-001-x.md')!.content).toContain('status: done');
    expect(files.get('spec/01_intent/FI-003-x.md')!.content).toContain('status: in_delivery');
    expect(files.get('spec/01_intent/FI-001-x.md')!.content).toContain('## Problem');
    expect(reindexed).toEqual(['spec/01_intent/FI-001-x.md', 'spec/01_intent/FI-003-x.md']);
    expect(await service.sync('p1')).toEqual([]);
  });

  it('never leaves Withdrawn and skips a file that changed meanwhile', async () => {
    const { service, files } = setup({
      features: [record('FI-001', 'approved', 'withdrawn'), record('FI-002', 'approved', 'approved')],
      stories: { 'FI-001': [{ id: 'US-010', status: 'done' }], 'FI-002': [{ id: 'US-011', status: 'ready' }] },
    });
    files.set('spec/01_intent/FI-002-x.md', { content: 'no front-matter', hash: 'other' });

    expect(await service.sync('p1')).toEqual([]);
  });
});

describe('US-084: feature progress and stepper', () => {
  it('returns the feature phases with soft gates and the progress of all open features', () => {
    const { service } = setup({
      features: [record('FI-001', 'approved', 'approved'), record('FI-002', 'draft', 'draft'), record('FI-003', 'approved', 'withdrawn')],
      stories: { 'FI-001': [{ id: 'US-010', status: 'ready' }] },
    });

    const fi = service.get('p1', 'FI-001')!;
    expect(fi.current).toBe('impact');
    expect(fi.phases.map((p) => [p.phase, p.state])).toEqual([
      ['intent', 'approved'],
      ['impact', 'not_started'],
      ['requirements', 'not_started'],
      ['design', 'not_started'],
      ['stories', 'awaiting_approval'],
      ['kanban', 'in_progress'],
      ['epic_review', 'not_started'],
    ]);
    expect(fi.phases.find((p) => p.phase === 'stories')?.unapprovedEarlier).toEqual(['impact', 'requirements', 'design']);
    expect(service.progress('p1').map((p) => [p.id, p.status])).toEqual([
      ['FI-001', 'in_delivery'],
      ['FI-002', 'draft'],
    ]);
  });
});

describe('US-085 AC-1: list data for the Active features widget', () => {
  it('lists each feature with its mini stepper, current phase, next step and story progress', () => {
    const { service } = setup({
      features: [record('FI-001', 'approved', 'approved'), record('FI-002', 'draft', 'draft')],
      stories: {
        'FI-001': [
          { id: 'US-010', status: 'done' },
          { id: 'US-011', status: 'review' },
        ],
      },
    });

    const [fi1, fi2] = service.list('p1');
    expect(fi1).toMatchObject({ current: 'impact', nextStep: 'Analyse the impact of FI-001', progress: { done: 1, total: 2 } });
    expect(fi1!.phases.map((p) => p.phase)).toEqual(['intent', 'impact', 'requirements', 'design', 'stories', 'kanban', 'epic_review']);
    expect(fi2).toMatchObject({ current: 'intent', nextStep: 'Approve FI-002 Feature FI-002', progress: { done: 0, total: 0 } });
  });
});

describe('US-094: feature completion and withdrawal (FR-104)', () => {
  const events: FeatureEvent[] = [];
  const recorder = {
    recordEvent: (e: FeatureEvent) => void events.push(e),
    events: (_p: string, id: string) => events.filter((e) => e.featureId === id),
  };

  it('AC-1/AC-3: a feature whose linked stories are all Done becomes Done; the change is written and recorded', async () => {
    events.splice(0);
    const { service, files } = setup({
      features: [record('FI-001', 'approved', 'in_delivery')],
      stories: {
        'FI-001': [
          { id: 'US-010', status: 'done' },
          { id: 'US-011', status: 'done' },
        ],
      },
      extra: { ...recorder, now: () => '2026-11-20T12:00:00.000Z' },
    });
    expect(await service.sync('p1')).toEqual(['FI-001']);
    expect(files.get('spec/01_intent/FI-001-x.md')!.content).toContain('status: done');
    expect(events).toEqual([{ projectId: 'p1', featureId: 'FI-001', status: 'done', note: null, at: '2026-11-20T12:00:00.000Z' }]);
    expect(service.get('p1', 'FI-001')?.events).toEqual(events);
  });

  it('AC-2: the withdraw preview lists open change sets, applied changes and not-started stories', () => {
    const { service } = setup({
      features: [record('FI-001', 'approved', 'in_delivery')],
      stories: {
        'FI-001': [
          { id: 'US-010', status: 'backlog' },
          { id: 'US-011', status: 'ready' },
          { id: 'US-012', status: 'done' },
        ],
      },
      extra: { changeSets: { open: () => [{ phase: 'design', state: 'open' }], discard: () => [] } },
    });
    expect(service.withdrawPreview('p1', 'FI-001')).toEqual({
      openChangeSets: ['design'],
      appliedChanges: ['EP-004', 'FR-012', 'FR-040'],
      notStartedStories: ['US-010', 'US-011'],
      blockedBy: null,
    });
  });

  it('AC-2: withdrawing discards open change sets, deletes the chosen not-started stories and writes Withdrawn (terminal)', async () => {
    events.splice(0);
    const discarded: string[] = [];
    const removed: string[] = [];
    const { service, files, reindexed } = setup({
      features: [record('FI-001', 'approved', 'in_delivery')],
      stories: {
        'FI-001': [
          { id: 'US-010', status: 'backlog' },
          { id: 'US-011', status: 'ready' },
          { id: 'US-012', status: 'in_progress' },
        ],
      },
      extra: {
        ...recorder,
        now: () => '2026-11-20T13:00:00.000Z',
        changeSets: {
          open: () => [{ phase: 'stories', state: 'open' }],
          discard: (_p, id) => {
            discarded.push(id);
            return ['stories'];
          },
        },
        storyPath: (_p, id) => `spec/04_user_stories/${id}.md`,
        removeFile: async (_p, path) => void removed.push(path),
      },
    });

    await expect(service.withdraw('p1', 'FI-001', { deleteStories: ['US-012'] })).rejects.toThrow('US-012');
    const result = await service.withdraw('p1', 'FI-001', { deleteStories: ['US-010'] });
    expect(result).toEqual({ discarded: ['stories'], deleted: ['US-010'], kept: ['US-011'] });
    expect(discarded).toEqual(['FI-001']);
    expect(removed).toEqual(['spec/04_user_stories/US-010.md']);
    expect(reindexed).toEqual(expect.arrayContaining(['spec/04_user_stories/US-010.md', 'spec/01_intent/FI-001-x.md']));
    expect(files.get('spec/01_intent/FI-001-x.md')!.content).toContain('status: withdrawn');
    expect(events.at(-1)).toMatchObject({ featureId: 'FI-001', status: 'withdrawn', note: 'Deleted US-010; kept US-011.' });
    expect(service.get('p1', 'FI-001')?.status).toBe('withdrawn');
    await expect(service.withdraw('p1', 'FI-001', { deleteStories: [] })).rejects.toThrow('already withdrawn');
  });

  it('AC-2: a Done feature cannot be withdrawn; a running generation blocks the withdrawal', () => {
    const done = setup({
      features: [record('FI-001', 'approved', 'done')],
      stories: { 'FI-001': [{ id: 'US-010', status: 'done' }] },
    });
    expect(done.service.withdrawPreview('p1', 'FI-001').blockedBy).toContain('Done');
    const running = setup({
      features: [record('FI-001', 'approved', 'approved')],
      extra: { changeSets: { open: () => [{ phase: 'requirements', state: 'running' }], discard: () => [] } },
    });
    expect(running.service.withdrawPreview('p1', 'FI-001').blockedBy).toContain('running');
  });
});
