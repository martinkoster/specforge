// SPDX-License-Identifier: Apache-2.0
// US-081 AC-1/AC-3/AC-5: feature intents in the workspace index (feature_intent table, typed trace links).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParsedArtifact } from '@specforge/application';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FeatureWizardRepository,
  INDEX_TABLES,
  IndexRepository,
  ProjectRepository,
  openDatabase,
  rebuildIndex,
  type OpenDatabase,
} from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup() {
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-fi-')) });
  opened.push(db);
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: '/ws', vcsMode: 'git', baseBranch: 'main' });
  return { db, index: new IndexRepository(db.sqlite) };
}

const feature = (id: string, status: 'draft' | 'approved' | 'in_delivery' = 'approved'): ParsedArtifact => ({
  kind: 'feature_intent',
  approval: 'approved',
  elements: [{ id, type: 'feature_intent', title: `Feature ${id}`, anchor: null }],
  links: [{ source: id, target: 'FR-034' }],
  dependencies: [],
  feature: { id, title: `Feature ${id}`, approval: 'approved', status, sourceIdea: 'IDEA-007', baseline: null },
});

const story = (id: string, featureId: string | null, status: 'backlog' | 'done' = 'backlog'): ParsedArtifact => ({
  kind: 'story',
  approval: 'approved',
  elements: [{ id, type: 'story', title: id, anchor: null }],
  links: featureId
    ? [
        { source: id, target: featureId, type: 'introduces' },
        { source: id, target: 'US-001', type: 'reworks' },
      ]
    : [],
  dependencies: [],
  story: { id, title: id, status, approval: 'approved', size: null, epicId: null, featureId, branch: null, reworks: ['US-001'] },
});

describe('US-081: feature intents in the index', () => {
  it('AC-5: the migration adds the feature_intent index table; it is rebuilt with the other index tables', async () => {
    const { db, index } = await setup();
    expect(INDEX_TABLES.map((t) => t.name)).toContain('feature_intent');
    index.save('p1', 'spec/01_intent/FI-003-x.md', 'h', feature('FI-003'));
    rebuildIndex(db.sqlite);
    expect(index.features('p1')).toEqual([]);
  });

  it('AC-1: stores id, title, approval, status, source idea and baseline; re-indexing replaces, removing deletes', async () => {
    const { index } = await setup();
    index.save('p1', 'spec/01_intent/FI-003-x.md', 'h1', feature('FI-003'));
    index.save('p1', 'spec/01_intent/FI-001-y.md', 'h2', feature('FI-001', 'draft'));

    expect(index.features('p1')).toEqual([
      {
        id: 'FI-001',
        title: 'Feature FI-001',
        approval: 'approved',
        status: 'draft',
        sourceIdea: 'IDEA-007',
        baseline: null,
        path: 'spec/01_intent/FI-001-y.md',
      },
      {
        id: 'FI-003',
        title: 'Feature FI-003',
        approval: 'approved',
        status: 'approved',
        sourceIdea: 'IDEA-007',
        baseline: null,
        path: 'spec/01_intent/FI-003-x.md',
      },
    ]);

    index.save('p1', 'spec/01_intent/FI-003-x.md', 'h3', feature('FI-003', 'in_delivery'));
    expect(index.features('p1').find((f) => f.id === 'FI-003')?.status).toBe('in_delivery');
    index.remove('p1', 'spec/01_intent/FI-003-x.md');
    expect(index.features('p1').map((f) => f.id)).toEqual(['FI-001']);
  });

  it('AC-3: typed links are stored; stories and epics of a feature are found', async () => {
    const { index } = await setup();
    index.save('p1', 'spec/01_intent/FI-003-x.md', 'h1', feature('FI-003'));
    index.save('p1', 'spec/04_user_stories/US-010.md', 'h2', story('US-010', 'FI-003', 'done'));
    index.save('p1', 'spec/04_user_stories/US-011.md', 'h3', story('US-011', null));

    expect(index.linkType('p1', 'US-010', 'FI-003')).toBe('introduces');
    expect(index.linkType('p1', 'US-010', 'US-001')).toBe('reworks');
    expect(index.linkType('p1', 'FI-003', 'FR-034')).toBe('references');
    expect(index.linkType('p1', 'US-011', 'FI-003')).toBeUndefined();
    expect(index.featureStories('p1', 'FI-003')).toEqual([{ id: 'US-010', status: 'done', approval: 'approved' }]);
  });
});

describe('US-082 AC-4: feature wizard drafts survive restarts (feature_wizard, ADR-025)', () => {
  it('saves, reads, lists newest first and removes drafts; they survive a rebuild of the index', async () => {
    const { db } = await setup();
    const wizards = new FeatureWizardRepository(db.sqlite);
    const row = {
      id: 'w1',
      projectId: 'p1',
      step: 'describe' as const,
      draft: { text: 'Comments', priority: 'should' as const },
      sessionId: null,
      sourceIdea: null,
      featureId: null,
      updatedAt: '2026-11-20T10:00:00.000Z',
    };
    wizards.save(row);
    wizards.save({ ...row, id: 'w2', updatedAt: '2026-11-20T11:00:00.000Z' });
    wizards.save({ ...row, step: 'save', featureId: 'FI-001' });

    expect(wizards.get('w1')).toEqual({ ...row, step: 'save', featureId: 'FI-001' });
    rebuildIndex(db.sqlite);
    expect(wizards.list('p1').map((r) => r.id)).toEqual(['w2', 'w1']);
    wizards.remove('w2');
    expect(wizards.get('w2')).toBeUndefined();
    expect(wizards.list('other')).toEqual([]);
  });
});
