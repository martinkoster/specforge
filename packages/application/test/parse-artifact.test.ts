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
