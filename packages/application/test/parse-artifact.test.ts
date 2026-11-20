// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ArtifactParseError, parseArtifact } from '../src/index.js';

const STORY = [
  '---',
  'specforge: 1',
  'kind: story',
  'id: US-005',
  'title: Session handling',
  'approval: approved',
  'status: ready',
  'size: M',
  'epic: EP-001',
  'requirements: [FR-003, FR-007]',
  'depends_on:',
  '  - id: US-002',
  '    rationale: Needs the login endpoint',
  '  - US-003',
  'related_to: [US-006]',
  'branch: specforge/US-005',
  '---',
  '## Description',
  'As a user I want to stay logged in (see UC-004).',
  '## Acceptance criteria',
  '- [ ] AC-1 session survives reload, per ADR-002',
].join('\n');

const REQUIREMENTS = [
  '---',
  'kind: requirements',
  'approval: draft',
  '---',
  '# Functional requirements',
  '### FR-001: Create a project',
  'Derived from D14 and used by UC-001.',
  '### FR-002: Reopen projects',
  'See FR-001.',
].join('\n');

describe('US-020 AC-1: parse front-matter, element headings and trace links', () => {
  it('reads story front-matter fields', () => {
    const parsed = parseArtifact('spec/04_user_stories/US-005-session.md', STORY);

    expect(parsed.kind).toBe('story');
    expect(parsed.approval).toBe('approved');
    expect(parsed.story).toEqual({
      id: 'US-005',
      title: 'Session handling',
      status: 'ready',
      approval: 'approved',
      size: 'M',
      epicId: 'EP-001',
      featureId: null,
      branch: 'specforge/US-005',
      reworks: [],
    });
    expect(parsed.dependencies).toEqual([
      { from: 'US-005', to: 'US-002', type: 'blocking', rationale: 'Needs the login endpoint' },
      { from: 'US-005', to: 'US-003', type: 'blocking', rationale: null },
      { from: 'US-005', to: 'US-006', type: 'related', rationale: null },
    ]);
    expect(parsed.elements).toEqual([{ id: 'US-005', type: 'story', title: 'Session handling', anchor: null }]);
  });

  it('extracts element-ID headings with their types', () => {
    const parsed = parseArtifact('spec/02_requirements/functional_requirements.md', REQUIREMENTS);

    expect(parsed.kind).toBe('requirements');
    expect(parsed.approval).toBe('draft');
    expect(parsed.elements).toEqual([
      { id: 'FR-001', type: 'fr', title: 'Create a project', anchor: 'fr-001-create-a-project' },
      { id: 'FR-002', type: 'fr', title: 'Reopen projects', anchor: 'fr-002-reopen-projects' },
    ]);
  });

  it('extracts ID references as trace links from the enclosing element', () => {
    const story = parseArtifact('spec/04_user_stories/US-005-session.md', STORY);
    const reqs = parseArtifact('spec/02_requirements/functional_requirements.md', REQUIREMENTS);

    expect(story.links).toEqual(
      expect.arrayContaining([
        { source: 'US-005', target: 'FR-003' },
        { source: 'US-005', target: 'FR-007' },
        { source: 'US-005', target: 'UC-004' },
        { source: 'US-005', target: 'ADR-002' },
        { source: 'US-005', target: 'EP-001' },
      ]),
    );
    expect(story.links.some((l) => l.target === 'US-005')).toBe(false);
    expect(reqs.links).toEqual([
      { source: 'FR-001', target: 'D14' },
      { source: 'FR-001', target: 'UC-001' },
      { source: 'FR-002', target: 'FR-001' },
    ]);
  });

  it('parses epics and files without front-matter', () => {
    const epic = parseArtifact(
      'spec/04_user_stories/epics/EP-001-auth.md',
      '---\nkind: epic\nid: EP-001\ntitle: Authentication\napproval: approved\nrequirements: [FR-001]\n---\n## Goal\n',
    );
    const plain = parseArtifact('spec/01_intent/notes.md', '# Notes\nNothing special.');

    expect(epic.epic).toEqual({ id: 'EP-001', title: 'Authentication', approval: 'approved', featureId: null, reviewOutcome: null });
    expect(epic.links).toEqual([{ source: 'EP-001', target: 'FR-001' }]);
    expect(plain).toMatchObject({ kind: 'other', approval: 'draft', elements: [], links: [] });
  });

  it('US-036 AC-2: related stories may carry a rationale like blocking dependencies', () => {
    const parsed = parseArtifact(
      'spec/04_user_stories/US-007.md',
      '---\nkind: story\nid: US-007\ntitle: T\nrelated_to:\n  - id: US-006\n    rationale: Same form.\n  - US-005\n---\n',
    );
    expect(parsed.dependencies).toEqual([
      { from: 'US-007', to: 'US-006', type: 'related', rationale: 'Same form.' },
      { from: 'US-007', to: 'US-005', type: 'related', rationale: null },
    ]);
  });

  it('rejects invalid front-matter with a parse error', () => {
    expect(() => parseArtifact('spec/x.md', '---\nkind: [unclosed\n---\nbody')).toThrow(ArtifactParseError);
    expect(() => parseArtifact('spec/x.md', '---\nkind: story\nstatus: flying\nid: US-1\ntitle: t\n---\n')).toThrow(/status/);
    expect(() => parseArtifact('spec/x.md', '---\nkind: story\ntitle: no id\n---\n')).toThrow(/id/);
  });
});

describe('US-081 AC-1/AC-3: feature intents and feature trace links', () => {
  const FI = [
    '---',
    'specforge: 1',
    'kind: feature_intent',
    'id: FI-003',
    'title: Task comments',
    'approval: approved',
    'status: in_delivery',
    'priority: should',
    'related_epics: [EP-002]',
    'related_requirements: [FR-034]',
    'source_idea: IDEA-007',
    'baseline: spec-v1.3',
    '---',
    '## Problem',
    'Users cannot discuss tasks.',
    '',
  ].join('\n');

  it('indexes a feature intent with id, title, approval, status, source idea and baseline', () => {
    const parsed = parseArtifact('spec/01_intent/FI-003-task-comments.md', FI);
    expect(parsed.kind).toBe('feature_intent');
    expect(parsed.feature).toEqual({
      id: 'FI-003',
      title: 'Task comments',
      approval: 'approved',
      status: 'in_delivery',
      sourceIdea: 'IDEA-007',
      baseline: 'spec-v1.3',
    });
    expect(parsed.elements).toContainEqual({ id: 'FI-003', type: 'feature_intent', title: 'Task comments', anchor: null });
    expect(parsed.links).toEqual(
      expect.arrayContaining([
        { source: 'FI-003', target: 'EP-002' },
        { source: 'FI-003', target: 'FR-034' },
        { source: 'FI-003', target: 'IDEA-007' },
      ]),
    );
  });

  it('defaults the status to draft and rejects an invalid status or id', () => {
    const draft = parseArtifact('spec/01_intent/FI-001-x.md', '---\nkind: feature_intent\nid: FI-001\ntitle: X\n---\n');
    expect(draft.feature).toMatchObject({ status: 'draft', approval: 'draft', sourceIdea: null, baseline: null });
    expect(() =>
      parseArtifact('spec/01_intent/FI-001-x.md', '---\nkind: feature_intent\nid: FI-001\ntitle: X\nstatus: shipped\n---\n'),
    ).toThrow(/status/);
    expect(() => parseArtifact('spec/01_intent/FI-x.md', '---\nkind: feature_intent\nid: X-1\ntitle: X\n---\n')).toThrow(/FI id/);
  });

  it('types links: **Feature** lines introduce, "Changed by" lines change, story feature/reworks', () => {
    const reqs = parseArtifact(
      'spec/02_requirements/functional_requirements.md',
      '---\nkind: requirements\n---\n### FR-040: Comments\n**Feature**: FI-003\nText.\n### FR-012: Tasks\nChanged by FI-003 (comment count).\n',
    );
    expect(reqs.links).toEqual([
      { source: 'FR-040', target: 'FI-003', type: 'introduces' },
      { source: 'FR-012', target: 'FI-003', type: 'changes' },
    ]);

    const story = parseArtifact(
      'spec/04_user_stories/US-020-x.md',
      '---\nkind: story\nid: US-020\ntitle: Rework\nfeature: FI-003\nreworks: [US-008]\n---\n',
    );
    expect(story.links).toEqual(
      expect.arrayContaining([
        { source: 'US-020', target: 'FI-003', type: 'introduces' },
        { source: 'US-020', target: 'US-008', type: 'reworks' },
      ]),
    );
    const epic = parseArtifact('spec/04_user_stories/epics/EP-004-x.md', '---\nkind: epic\nid: EP-004\ntitle: E\nfeature: FI-003\n---\n');
    expect(epic.links).toContainEqual({ source: 'EP-004', target: 'FI-003', type: 'introduces' });
  });
});

describe('US-086: element content hashes (change detection for impact flags)', () => {
  const reqs = (fr1: string, fr2: string) => `---\nkind: requirements\n---\n### FR-001: Login\n${fr1}\n### FR-002: Logout\n${fr2}\n`;

  it('hashes each element section; editing one section changes only its hash', () => {
    const before = parseArtifact('spec/02_requirements/fr.md', reqs('Users log in.', 'Users log out.')).elementHashes!;
    const after = parseArtifact('spec/02_requirements/fr.md', reqs('Users log in with SSO.', 'Users log out.')).elementHashes!;
    expect(Object.keys(before)).toEqual(['FR-001', 'FR-002']);
    expect(after['FR-001']).not.toBe(before['FR-001']);
    expect(after['FR-002']).toBe(before['FR-002']);
    expect(parseArtifact('spec/02_requirements/fr.md', reqs('Users log in.  ', 'Users log out.')).elementHashes!['FR-001']).toBe(
      before['FR-001'],
    );
  });

  it('a story is hashed by its body, not by its front-matter (status changes are no content change)', () => {
    const story = (status: string, ac: string) =>
      `---\nkind: story\nid: US-002\ntitle: T\nstatus: ${status}\n---\n## Description\nAs a user.\n## Acceptance criteria\n- [ ] ${ac}\n`;
    const a = parseArtifact('s.md', story('backlog', 'Works')).elementHashes!['US-002'];
    expect(parseArtifact('s.md', story('done', 'Works')).elementHashes!['US-002']).toBe(a);
    expect(parseArtifact('s.md', story('done', 'Works offline')).elementHashes!['US-002']).not.toBe(a);
  });
});
