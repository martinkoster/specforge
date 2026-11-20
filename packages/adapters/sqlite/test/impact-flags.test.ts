// SPDX-License-Identifier: Apache-2.0
// US-086 AC-1/AC-3: element change detection in the index and persistent impact flags (impact_flag, ADR-025).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElementChange, ParsedArtifact } from '@specforge/application';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChangeSetRepository,
  ImpactFlagRepository,
  ImpactItemRepository,
  BaselineRepository,
  EpicChoiceRepository,
  FeatureEventRepository,
  InFlightDecisionRepository,
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
  const db = openDatabase({ dir: mkdtempSync(join(tmpdir(), 'sf-impact-')) });
  opened.push(db);
  await new ProjectRepository(db.db).create({ id: 'p1', name: 'P', workspacePath: '/ws', vcsMode: 'git', baseBranch: 'main' });
  const changes: ElementChange[][] = [];
  const index = new IndexRepository(db.sqlite);
  index.onElementsChanged = (_p, c) => void changes.push(c);
  return { db, index, flags: new ImpactFlagRepository(db.sqlite), changes };
}

const requirements = (approval: 'draft' | 'approved', hashes: Record<string, string>): ParsedArtifact => ({
  kind: 'requirements',
  approval,
  elements: Object.keys(hashes).map((id) => ({ id, type: 'fr', title: id, anchor: id.toLowerCase() })),
  links: [],
  dependencies: [],
  elementHashes: hashes,
});

describe('US-086: change detection in the index', () => {
  it('reports elements whose content hash changed, with the approval before the change; the first index reports nothing', async () => {
    const { index, changes } = await setup();
    index.save('p1', 'spec/02_requirements/fr.md', 'h1', requirements('approved', { 'FR-001': 'a', 'FR-002': 'b' }));
    expect(changes).toEqual([]);

    index.save('p1', 'spec/02_requirements/fr.md', 'h2', requirements('draft', { 'FR-001': 'a2', 'FR-002': 'b', 'FR-003': 'c' }));
    expect(changes).toEqual([[{ elementId: 'FR-001', type: 'fr', wasApproved: true }]]);

    index.save('p1', 'spec/02_requirements/fr.md', 'h3', requirements('draft', { 'FR-001': 'a3', 'FR-002': 'b', 'FR-003': 'c' }));
    expect(changes.at(-1)).toEqual([{ elementId: 'FR-001', type: 'fr', wasApproved: false }]);
  });
});

describe('US-086 AC-3: flags survive re-indexing and Rebuild index', () => {
  it('stores, lists and clears flags; re-index and rebuild keep them; impacted artifacts and phases use them', async () => {
    const { db, index, flags } = await setup();
    index.save('p1', 'spec/02_requirements/fr.md', 'h1', requirements('approved', { 'FR-001': 'a' }));
    flags.flag({ projectId: 'p1', elementId: 'FR-001', sourceRef: 'FI-001', reason: 'r', flaggedAt: '2026-11-20T10:00:00.000Z' });
    flags.flag({ projectId: 'p1', elementId: 'FR-001', sourceRef: 'FR-009', reason: 'newer', flaggedAt: '2026-11-20T11:00:00.000Z' });

    index.save('p1', 'spec/02_requirements/fr.md', 'h2', requirements('approved', { 'FR-001': 'a' }));
    expect(flags.list('p1')).toEqual([
      { projectId: 'p1', elementId: 'FR-001', sourceRef: 'FR-009', reason: 'newer', flaggedAt: '2026-11-20T11:00:00.000Z' },
    ]);
    expect(index.impactedPaths('p1')).toEqual(['spec/02_requirements/fr.md']);
    expect(index.phaseInputs('p1').requirements.impacted).toBe(true);

    rebuildIndex(db.sqlite);
    expect(flags.list('p1')).toHaveLength(1);
    flags.clear('p1', 'FR-001');
    expect(flags.list('p1')).toEqual([]);
  });

  it('the migration dropped the Release 1 index columns', async () => {
    const { db } = await setup();
    const columns = (db.sqlite.prepare("select name from pragma_table_info('element')").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('content_hash');
    expect(columns).not.toContain('impact_flag');
    expect(columns).not.toContain('impact_source');
  });

  it('finds dependents of a story and the artifact of an element', async () => {
    const { index } = await setup();
    const story = (id: string, deps: string[]): ParsedArtifact => ({
      kind: 'story',
      approval: 'approved',
      elements: [{ id, type: 'story', title: id, anchor: null }],
      links: [],
      dependencies: deps.map((to) => ({ from: id, to, type: 'blocking' as const, rationale: null })),
      story: {
        id,
        title: id,
        status: 'review',
        approval: 'approved',
        size: null,
        epicId: null,
        featureId: null,
        branch: null,
        reworks: [],
      },
    });
    index.save('p1', 'spec/04_user_stories/US-002.md', 'h', story('US-002', []));
    index.save('p1', 'spec/04_user_stories/US-005.md', 'h', story('US-005', ['US-002']));
    expect(index.dependents('p1', 'US-002')).toEqual([{ id: 'US-005', status: 'review' }]);
    expect(index.elementPath('p1', 'US-005')).toBe('spec/04_user_stories/US-005.md');
    expect(index.elementPath('p1', 'US-404')).toBeUndefined();
  });
});

describe('US-091 AC-5: in-flight decisions (in_flight_decision)', () => {
  it('saves decisions, lists them per feature and story, keeps and clears pending feedback', async () => {
    const { db } = await setup();
    const repo = new InFlightDecisionRepository(db.sqlite);
    const base = { projectId: 'p1', featureId: 'FI-001', changeSetId: 'cs1' };
    repo.save({ ...base, id: 'd1', storyId: 'US-011', decision: 'continue', pendingFeedback: null, decidedAt: '2026-11-20T10:00:00.000Z' });
    repo.save({
      ...base,
      id: 'd2',
      storyId: 'US-012',
      decision: 'apply_in_corrections',
      pendingFeedback: 'Update it.',
      decidedAt: '2026-11-20T10:01:00.000Z',
    });

    expect(repo.byFeature('p1', 'FI-001').map((d) => d.id)).toEqual(['d2', 'd1']);
    expect(repo.latestByStory('p1').get('US-012')?.decision).toBe('apply_in_corrections');
    expect(repo.pendingFeedback('p1', 'US-012')).toBe('Update it.');
    expect(repo.pendingFeedback('p1', 'US-011')).toBeNull();
    repo.clearFeedback('p1', 'US-012');
    expect(repo.pendingFeedback('p1', 'US-012')).toBeNull();
    expect(repo.byFeature('p1', 'FI-002')).toEqual([]);
  });
});

describe('US-089 AC-2: change sets (change_set, change_item)', () => {
  it('saves change sets and items, finds the latest of a phase and updates states', async () => {
    const { db } = await setup();
    const repo = new ChangeSetRepository(db.sqlite);
    const base = { projectId: 'p1', featureId: 'FI-001', phase: 'requirements' as const, runId: 'r1', reason: null };
    repo.saveSet({ ...base, id: 's1', state: 'failed', createdAt: '2026-11-20T10:00:00.000Z' });
    repo.saveSet({ ...base, id: 's2', state: 'running', createdAt: '2026-11-20T11:00:00.000Z' });
    repo.saveSet({ ...base, id: 's2', state: 'open', createdAt: '2026-11-20T11:00:00.000Z' });
    const item = {
      changeSetId: 's2',
      path: 'fr.md',
      kind: 'new' as const,
      before: null,
      after: '### FR-118: A\n',
      patch: '+x',
      state: 'open' as const,
    };
    repo.saveItems([
      { ...item, id: 'i1', elementId: 'FR-118' },
      { ...item, id: 'i2', elementId: null, kind: 'modified', before: 'a\n' },
    ]);
    repo.setItemState('i1', 'accepted');

    expect(repo.latest('p1', 'FI-001', 'requirements')).toMatchObject({ id: 's2', state: 'open' });
    expect(repo.latest('p1', 'FI-001', 'design')).toBeUndefined();
    expect(repo.set('s1')?.state).toBe('failed');
    expect(repo.items('s2').map((i) => [i.id, i.state, i.elementId, i.before])).toEqual([
      ['i1', 'accepted', 'FR-118', null],
      ['i2', 'open', null, 'a\n'],
    ]);
    expect(repo.item('i2')?.kind).toBe('modified');
    expect(repo.item('nope')).toBeUndefined();
  });
});

describe('US-087 AC-3: impact items (impact_item)', () => {
  it('replaces trace items, keeps user items, removes, confirms and survives Rebuild index', async () => {
    const { db } = await setup();
    const items = new ImpactItemRepository(db.sqlite);
    const item = (id: string, origin: 'trace' | 'user', targetRef: string) => ({
      id,
      projectId: 'p1',
      featureId: 'FI-001',
      category: 'requirement' as const,
      targetRef,
      reason: 'r',
      confidence: 'high' as const,
      origin,
      confirmed: false,
    });
    items.replaceTraceItems('p1', 'FI-001', [item('a', 'trace', 'FR-001'), item('b', 'trace', 'FR-002')]);
    items.add(item('c', 'user', 'FR-003'));
    items.replaceTraceItems('p1', 'FI-001', [item('d', 'trace', 'FR-004')]);
    expect(items.items('p1', 'FI-001').map((i) => i.id)).toEqual(['c', 'd']);
    items.remove('c');
    items.confirm('p1', 'FI-001');
    rebuildIndex(db.sqlite);
    expect(items.items('p1', 'FI-001')).toEqual([{ ...item('d', 'trace', 'FR-004'), confirmed: true }]);
    expect(items.items('p1', 'FI-002')).toEqual([]);
  });
});

describe('US-093 AC-1: the approved epic choice per feature (feature_epic_choice)', () => {
  it('saves, replaces and reads the choice', async () => {
    const { db } = await setup();
    const repo = new EpicChoiceRepository(db.sqlite);
    const base = { projectId: 'p1', featureId: 'FI-001', decidedAt: '2026-11-20T10:00:00.000Z' };
    expect(repo.get('p1', 'FI-001')).toBeUndefined();
    repo.save({ ...base, mode: 'new', epicIds: ['EP-003'], title: 'Task comments' });
    repo.save({ ...base, mode: 'extend', epicIds: ['EP-001', 'EP-002'], title: null });
    expect(repo.get('p1', 'FI-001')).toEqual({ ...base, mode: 'extend', epicIds: ['EP-001', 'EP-002'], title: null });
    expect(repo.get('p1', 'FI-002')).toBeUndefined();
  });
});

describe('US-094 AC-3: feature status changes (feature_event)', () => {
  it('records events and lists them per feature and per project, newest first', async () => {
    const { db } = await setup();
    const repo = new FeatureEventRepository(db.sqlite);
    repo.save({ projectId: 'p1', featureId: 'FI-001', status: 'in_delivery', note: null, at: '2026-11-20T10:00:00.000Z' });
    repo.save({ projectId: 'p1', featureId: 'FI-002', status: 'withdrawn', note: 'Kept US-011.', at: '2026-11-20T11:00:00.000Z' });
    repo.save({ projectId: 'p1', featureId: 'FI-001', status: 'done', note: null, at: '2026-11-20T12:00:00.000Z' });
    expect(repo.byFeature('p1', 'FI-001').map((e) => e.status)).toEqual(['done', 'in_delivery']);
    expect(repo.recent('p1', 2)).toEqual([
      { projectId: 'p1', featureId: 'FI-001', status: 'done', note: null, at: '2026-11-20T12:00:00.000Z' },
      { projectId: 'p1', featureId: 'FI-002', status: 'withdrawn', note: 'Kept US-011.', at: '2026-11-20T11:00:00.000Z' },
    ]);
  });
});

describe('US-096 AC-2: baselines (baseline)', () => {
  it('saves baselines and lists them newest first', async () => {
    const { db } = await setup();
    const repo = new BaselineRepository(db.sqlite);
    const base = { projectId: 'p1', commit: 'c1', epicIds: [], notes: 'n' };
    repo.save({ ...base, tag: 'spec-v1.0', createdAt: '2026-11-20T10:00:00.000Z', featureIds: [] });
    repo.save({ ...base, tag: 'spec-v1.1', createdAt: '2026-11-20T11:00:00.000Z', featureIds: ['FI-001'], epicIds: ['EP-003'] });
    expect(repo.list('p1')).toEqual([
      { ...base, tag: 'spec-v1.1', createdAt: '2026-11-20T11:00:00.000Z', featureIds: ['FI-001'], epicIds: ['EP-003'] },
      { ...base, tag: 'spec-v1.0', createdAt: '2026-11-20T10:00:00.000Z', featureIds: [] },
    ]);
    expect(repo.list('p2')).toEqual([]);
  });
});
