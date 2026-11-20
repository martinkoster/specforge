// SPDX-License-Identifier: Apache-2.0
// US-095: capture and triage ideas (FR-111, UC-047).
import { describe, expect, it } from 'vitest';
import { IdeaError, IdeaService, parseIdeas, type ParsedIdea } from '../src/index.js';

const PATH = 'spec/01_intent/ideas.md';

function setup(initial?: string) {
  const files = new Map<string, string>(initial ? [[PATH, initial]] : []);
  let indexed: ParsedIdea[] = initial ? parseIdeas(initial) : [];
  const reindexed: string[] = [];
  const service = new IdeaService({
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h${files.get(path)!.length}` } : undefined),
      writeAtomic: async (path, content, { expectedHash }) => {
        const current = files.get(path);
        if ((current === undefined ? null : `h${current.length}`) !== expectedHash) throw new Error('conflict');
        files.set(path, content);
        return `h${content.length}`;
      },
    }),
    reindex: async (_p, path) => {
      reindexed.push(path);
      indexed = parseIdeas(files.get(path) ?? '');
    },
    ideasPath: () => PATH,
    ideas: () => indexed,
    featureIds: () => ['FI-001', 'FI-002'],
    now: () => '2026-11-20T09:30:00.000Z',
  });
  return { service, files, reindexed };
}

describe('US-095 AC-2: capturing appends to ideas.md and indexes the idea', () => {
  it('creates the file on the first idea, appends later ones with date and source', async () => {
    const { service, files, reindexed } = setup();
    const first = await service.capture('p1', { text: 'Export board as PDF', note: 'Asked twice', source: 'shortcut' });
    expect(first).toMatchObject({
      id: 'IDEA-001',
      text: 'Export board as PDF',
      note: 'Asked twice',
      source: 'shortcut',
      createdAt: '2026-11-20',
      state: 'new',
    });
    await service.capture('p1', { text: 'Bulk edit', source: 'dashboard' });
    expect(files.get(PATH)).toContain('## IDEA-002: Bulk edit\n- created: 2026-11-20 · source: dashboard · state: new');
    expect(reindexed).toEqual([PATH, PATH]);
    await expect(service.capture('p1', { text: '   ', source: 'menu' })).rejects.toBeInstanceOf(IdeaError);
  });
});

describe('US-095 AC-3: triage — turn into feature, merge, dismiss', () => {
  it('lists ideas with the untriaged counter; merge and dismiss update the idea; triaged ideas cannot be triaged again', async () => {
    const { service } = setup();
    await service.capture('p1', { text: 'A', source: 'menu' });
    await service.capture('p1', { text: 'B', source: 'menu' });
    await service.capture('p1', { text: 'C', source: 'menu' });
    expect(service.list('p1')).toMatchObject({ untriaged: 3 });

    await service.merge('p1', 'IDEA-001', 'FI-002');
    await service.dismiss('p1', 'IDEA-002', 'Not needed.');
    await service.turnedIntoFeature('p1', 'IDEA-003', 'FI-003');
    const { ideas, untriaged } = service.list('p1');
    expect(untriaged).toBe(0);
    expect(ideas.map((i) => [i.id, i.state, i.featureId, i.dismissReason])).toEqual([
      ['IDEA-001', 'merged', 'FI-002', null],
      ['IDEA-002', 'dismissed', null, 'Not needed.'],
      ['IDEA-003', 'turned_into_feature', 'FI-003', null],
    ]);
    await expect(service.merge('p1', 'IDEA-002', 'FI-001')).rejects.toThrow('already');
    await expect(service.merge('p1', 'IDEA-404', 'FI-001')).rejects.toThrow('IDEA-404');
  });

  it('merging needs an existing feature; dismissing needs a reason', async () => {
    const { service } = setup();
    await service.capture('p1', { text: 'A', source: 'menu' });
    await expect(service.merge('p1', 'IDEA-001', 'FI-404')).rejects.toThrow('FI-404');
    await expect(service.dismiss('p1', 'IDEA-001', ' ')).rejects.toThrow('reason');
  });
});
