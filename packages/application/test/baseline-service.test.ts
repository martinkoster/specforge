// SPDX-License-Identifier: Apache-2.0
// US-096: spec baselines (FR-112, UC-048) — offer, create (annotated tag with notes), list, compare.
import { describe, expect, it } from 'vitest';
import { BaselineError, BaselineService, nextBaselineTag, type BaselineRecord, type BaselineServiceDeps } from '../src/index.js';

function setup(over: Partial<BaselineServiceDeps> = {}) {
  const records: BaselineRecord[] = [];
  const tags = new Map<string, Record<string, string>>();
  const created: { tag: string; ref: string; notes: string }[] = [];
  const files = new Map([['spec/02_requirements/fr.md', '### FR-034: Task details\nChanged by FI-001.\n']]);
  const deps: BaselineServiceDeps = {
    vcsMode: () => 'git',
    baseBranch: () => 'main',
    uncommittedSpecFiles: async () => [],
    git: {
      create: async (_p, input) => {
        created.push(input);
        tags.set(input.tag, Object.fromEntries(files));
        return { commit: `c-${input.tag}` };
      },
      fileAt: async (_p, tag, path) => tags.get(tag)?.[path] ?? null,
    },
    store: { save: (r) => void records.push(r), list: () => [...records].reverse() },
    features: () => [
      { id: 'FI-001', title: 'Task comments', status: 'done' },
      { id: 'FI-002', title: 'Export', status: 'in_delivery' },
    ],
    epics: () => [
      { id: 'EP-001', title: 'Tasks', featureId: null },
      { id: 'EP-003', title: 'Task comments', featureId: 'FI-001' },
    ],
    files: () => ({ read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: 'h' } : undefined) }),
    now: () => '2026-11-20T15:00:00.000Z',
    ...over,
  };
  return { service: new BaselineService(deps), records, created, tags, files };
}

describe('US-096: next baseline version', () => {
  it('counts the minor version up from the highest spec-vX.Y; the first baseline is spec-v1.0', () => {
    expect(nextBaselineTag([])).toBe('spec-v1.0');
    expect(nextBaselineTag(['spec-v1.0', 'spec-v1.9', 'spec-v1.10', 'release-2'])).toBe('spec-v1.11');
    expect(nextBaselineTag(['spec-v2.3', 'spec-v1.7'])).toBe('spec-v2.4');
  });
});

describe('US-096 AC-1/AC-2: offer and create a baseline', () => {
  it('offers the next tag with the Done features not yet baselined and their epics', async () => {
    const { service } = setup();
    expect(await service.offer('p1')).toEqual({
      available: true,
      reason: null,
      uncommitted: [],
      nextTag: 'spec-v1.0',
      features: [{ id: 'FI-001', title: 'Task comments' }],
      epics: [{ id: 'EP-003', title: 'Task comments' }],
    });
  });

  it('creates an annotated tag on the base branch with notes, indexes it; included features are not offered again', async () => {
    const { service, created } = setup();
    const record = await service.create('p1', 'spec-v1.0');
    expect(created).toEqual([
      {
        tag: 'spec-v1.0',
        ref: 'main',
        notes: 'Spec baseline spec-v1.0\n\nFeature intents:\n- FI-001 Task comments\n\nEpics:\n- EP-003 Task comments',
      },
    ]);
    expect(record).toEqual({
      projectId: 'p1',
      tag: 'spec-v1.0',
      commit: 'c-spec-v1.0',
      createdAt: '2026-11-20T15:00:00.000Z',
      featureIds: ['FI-001'],
      epicIds: ['EP-003'],
      notes: expect.stringContaining('FI-001'),
    });
    expect(service.list('p1').map((b) => b.tag)).toEqual(['spec-v1.0']);
    expect(await service.offer('p1')).toMatchObject({ nextTag: 'spec-v1.1', features: [], epics: [] });
    await service.create('p1', 'spec-v1.1');
    expect(created[1]!.notes).toBe('Spec baseline spec-v1.1\n\nNo new feature intents since the previous baseline.');
  });

  it('AC-2: uncommitted spec changes must be committed first; AC-4: non-git projects have no baselines', async () => {
    const dirty = setup({ uncommittedSpecFiles: async () => ['spec/02_requirements/fr.md'] });
    expect(await dirty.service.offer('p1')).toMatchObject({ available: true, uncommitted: ['spec/02_requirements/fr.md'] });
    await expect(dirty.service.create('p1', 'spec-v1.0')).rejects.toThrow('Commit spec changes');
    expect(dirty.created).toEqual([]);

    const plain = setup({ vcsMode: () => 'none' });
    expect(await plain.service.offer('p1')).toMatchObject({ available: false, reason: expect.stringContaining('Git') });
    await expect(plain.service.create('p1', 'spec-v1.0')).rejects.toBeInstanceOf(BaselineError);
  });
});

describe('US-096 AC-3: compare an artifact with a baseline', () => {
  it('returns the file at the tag and its current content', async () => {
    const { service, files } = setup();
    await service.create('p1', 'spec-v1.0');
    files.set('spec/02_requirements/fr.md', '### FR-034: Task details\nChanged by FI-001.\nComments are shown.\n');
    expect(await service.compare('p1', 'spec-v1.0', 'spec/02_requirements/fr.md')).toEqual({
      before: '### FR-034: Task details\nChanged by FI-001.\n',
      after: '### FR-034: Task details\nChanged by FI-001.\nComments are shown.\n',
    });
    await expect(service.compare('p1', 'spec-v9.9', 'spec/02_requirements/fr.md')).rejects.toThrow('spec-v9.9');
  });
});
