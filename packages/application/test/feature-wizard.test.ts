// SPDX-License-Identifier: Apache-2.0
// US-082: the feature wizard — drafts persisted after every step (ADR-025), resumable; Save writes FI-xxx-<slug>.md.
import { describe, expect, it } from 'vitest';
import { FeatureWizardService, featureIntentFile, type FeatureWizardDeps, type WizardRecord } from '../src/index.js';

function setup(options: { existing?: string[]; specRoot?: string; extra?: Partial<FeatureWizardDeps> } = {}) {
  const rows = new Map<string, WizardRecord>();
  const files = new Map<string, string>();
  const log: string[] = [];
  let n = 0;
  let clock = 0;
  const deps: FeatureWizardDeps = {
    store: {
      save: (row) => void rows.set(row.id, { ...row }),
      get: (id) => rows.get(id),
      list: (projectId) =>
        [...rows.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      remove: (id) => void rows.delete(id),
    },
    featureIds: () => options.existing ?? [],
    specRoot: () => options.specRoot ?? 'spec',
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: 'h' } : undefined),
      writeAtomic: async (path, content, { expectedHash }) => {
        if (expectedHash === null && files.has(path)) throw new Error('exists');
        files.set(path, content);
        return 'h';
      },
    }),
    reindex: async (_p, path) => void log.push(`reindex ${path}`),
    approve: async (_p, path) => void log.push(`approve ${path}`),
    newId: () => `wiz-${++n}`,
    now: () => `2026-11-20T10:00:0${clock++}.000Z`,
    ...options.extra,
  };
  return { service: new FeatureWizardService(deps), rows, files, log };
}

describe('US-082 AC-4: wizard drafts are stored after every step and resumable', () => {
  it('creates, updates and resumes a draft; unsaved drafts are listed newest first', () => {
    const { service } = setup();
    const first = service.create('p1', { text: 'Users can comment on tasks' });
    expect(first).toMatchObject({ id: 'wiz-1', step: 'describe', draft: { text: 'Users can comment on tasks' }, featureId: null });

    const moved = service.update(first.id, { step: 'save', draft: { text: 'Users can comment on tasks', priority: 'should' } });
    expect(moved).toMatchObject({ step: 'save', draft: { priority: 'should' } });
    service.create('p1', { text: 'Export as PDF' });

    expect(service.get(first.id)).toMatchObject({ step: 'save' });
    expect(service.drafts('p1').map((d) => [d.id, d.title])).toEqual([
      ['wiz-2', 'Export as PDF'],
      ['wiz-1', 'Users can comment on tasks'],
    ]);
    expect(service.drafts('other')).toEqual([]);
  });

  it('discarding removes the draft; unknown drafts are refused', () => {
    const { service } = setup();
    const wizard = service.create('p1', { text: 'x' });
    service.discard(wizard.id);
    expect(service.get(wizard.id)).toBeUndefined();
    expect(() => service.update('nope', { step: 'save', draft: { text: 'x' } })).toThrow(/Unknown feature draft/);
  });
});

describe('US-082 AC-3: preview and save as FI-xxx-<slug>.md', () => {
  it('previews the feature intent with the next free ID and a title from the idea', () => {
    const { service } = setup({ existing: ['FI-001', 'FI-002'], specRoot: 'docs/spec' });
    const wizard = service.create('p1', {
      text: 'Users can comment on tasks and mention teammates.\nMore lines.',
      motivation: 'Discussions happen in e-mail today.',
      targetUsers: 'Team members',
      priority: 'should',
      epicId: 'EP-002',
    });

    const preview = service.preview(wizard.id);
    expect(preview.featureId).toBe('FI-003');
    expect(preview.title).toBe('Users can comment on tasks and mention teammates');
    expect(preview.path).toBe('docs/spec/01_intent/FI-003-users-can-comment-on-tasks-and-mention-teammates.md');
    expect(preview.content).toContain('kind: feature_intent');
    expect(preview.content).toContain('id: FI-003');
    expect(preview.content).toContain('priority: should');
    expect(preview.content).toContain('related_epics: [EP-002]');
    expect(preview.content).toContain('## Problem\nUsers can comment on tasks and mention teammates.\nMore lines.');
    expect(preview.content).toContain('Discussions happen in e-mail today.');
    expect(preview.content).toContain('Target users: Team members');
    expect(service.preview(wizard.id, 'Task comments').path).toBe('docs/spec/01_intent/FI-003-task-comments.md');
  });

  it('Save as draft writes the file, re-indexes and keeps the draft linked; Save & approve approves and removes the draft', async () => {
    const { service, files, log, rows } = setup({ existing: ['FI-001'] });
    const draft = service.create('p1', { text: 'Comments' });

    const saved = await service.save(draft.id, { title: 'Task comments', approve: false });
    expect(saved).toEqual({ featureId: 'FI-002', path: 'spec/01_intent/FI-002-task-comments.md' });
    expect(files.get(saved.path)).toContain('approval: draft');
    expect(log).toEqual(['reindex spec/01_intent/FI-002-task-comments.md']);
    expect(rows.get(draft.id)?.featureId).toBe('FI-002');
    expect(service.drafts('p1')).toEqual([]);

    const approved = await service.save(service.create('p1', { text: 'PDF export' }).id, { title: 'PDF export', approve: true });
    expect(approved.featureId).toBe('FI-002');
    expect(log.slice(1)).toEqual(['reindex spec/01_intent/FI-002-pdf-export.md', 'approve spec/01_intent/FI-002-pdf-export.md']);
    expect([...rows.values()].map((r) => r.id)).toEqual([draft.id]);
  });

  it('refuses an empty idea or title', async () => {
    const { service } = setup();
    const wizard = service.create('p1', { text: '   ' });
    await expect(service.save(wizard.id, { title: 'X', approve: false })).rejects.toThrow(/Describe the feature/);
    const other = service.create('p1', { text: 'Idea' });
    await expect(service.save(other.id, { title: ' ', approve: false })).rejects.toThrow(/title/);
  });

  it('renders the file for a draft without optional details', () => {
    const content = featureIntentFile({ id: 'FI-001', title: 'X', draft: { text: 'Idea' } });
    expect(content).not.toContain('priority:');
    expect(content).not.toContain('related_epics');
    expect(content).toContain('## Clarified decisions');
  });
});

describe('US-095 AC-3: Turn into feature — the wizard links the saved feature intent to its idea', () => {
  it('writes source_idea into the feature intent and reports the saved feature to the idea inbox', async () => {
    const turned: string[] = [];
    const { service, files } = setup({
      existing: ['FI-001'],
      extra: { ideaTurned: async (_p, ideaId, featureId) => void turned.push(`${ideaId}→${featureId}`) },
    });
    const wizard = service.create('p1', { text: 'Export board as PDF' }, { sourceIdea: 'IDEA-007' });
    const saved = await service.save(wizard.id, { title: 'Board export', approve: false });
    expect(files.get(saved.path)).toContain('source_idea: IDEA-007');
    expect(turned).toEqual(['IDEA-007→FI-002']);
  });
});
