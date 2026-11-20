// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { TraceService, type TraceDeps } from '../src/index.js';

const elements: Record<string, { type: string; title: string; artifactPath: string }> = {
  'FR-001': { type: 'fr', title: 'Login', artifactPath: 'spec/02_requirements/fr.md' },
  'UC-001': { type: 'uc', title: 'Log in', artifactPath: 'spec/03_design/uc.md' },
  'US-001': { type: 'story', title: 'Login form', artifactPath: 'spec/04_user_stories/US-001.md' },
};
// source → targets ("source references target")
const links: Record<string, string[]> = {
  'UC-001': ['FR-001'],
  'US-001': ['FR-001', 'UC-001', 'FR-404'],
};

const deps: TraceDeps = {
  element: (_p, id) => elements[id],
  linkTargets: (_p, id) => links[id] ?? [],
  linkSources: (_p, id) => Object.keys(links).filter((s) => links[s]!.includes(id)),
  storyRuns: (_p, storyId) => (storyId === 'US-001' ? [{ runId: 'r1', status: 'completed', createdAt: '2026-10-16T10:00:00.000Z' }] : []),
  runStory: (runId) => (runId === 'r1' ? 'US-001' : null),
  runFiles: (runId) => (runId === 'r1' ? ['src/login.ts', 'test/login.test.ts'] : []),
  fileRuns: (_p, path) => (path === 'src/login.ts' ? [{ runId: 'r1', storyId: 'US-001' }] : []),
  allLinks: () =>
    Object.entries(links).flatMap(([source, targets]) =>
      targets.map((target) => ({ source, target, artifactPath: elements[source]!.artifactPath })),
    ),
};

const service = new TraceService(deps);

describe('US-034 AC-1: upstream and downstream links', () => {
  it('a requirement: nothing upstream, design and stories downstream', () => {
    expect(service.trace('p1', { kind: 'element', id: 'FR-001' })).toEqual({
      node: { kind: 'element', id: 'FR-001', label: 'FR-001: Login', path: 'spec/02_requirements/fr.md', exists: true },
      upstream: [],
      downstream: [
        { kind: 'element', id: 'UC-001', label: 'UC-001: Log in', path: 'spec/03_design/uc.md', exists: true },
        { kind: 'story', id: 'US-001', label: 'US-001: Login form', path: 'spec/04_user_stories/US-001.md', exists: true },
      ],
      issues: [],
    });
  });

  it('a story: requirements and design upstream, its runs downstream; unknown references are issues (AC-3)', () => {
    const trace = service.trace('p1', { kind: 'element', id: 'US-001' });
    expect(trace.upstream.map((n) => [n.id, n.exists])).toEqual([
      ['FR-001', true],
      ['FR-404', false],
      ['UC-001', true],
    ]);
    expect(trace.downstream).toEqual([{ kind: 'run', id: 'r1', label: 'Run 2026-10-16 10:00 (completed)', exists: true }]);
    expect(trace.issues).toEqual(['US-001 references FR-404, which does not exist.']);
  });

  it('a run: its story upstream, its changed files downstream; a file: the runs and stories that touched it', () => {
    expect(service.trace('p1', { kind: 'run', id: 'r1' })).toMatchObject({
      upstream: [{ kind: 'story', id: 'US-001' }],
      downstream: [
        { kind: 'file', id: 'src/login.ts', label: 'src/login.ts', runId: 'r1' },
        { kind: 'file', id: 'test/login.test.ts', label: 'test/login.test.ts', runId: 'r1' },
      ],
    });
    expect(service.trace('p1', { kind: 'file', id: 'src/login.ts' })).toMatchObject({
      node: { kind: 'file', id: 'src/login.ts' },
      upstream: [
        { kind: 'run', id: 'r1' },
        { kind: 'story', id: 'US-001' },
      ],
      downstream: [],
    });
  });

  it('an unknown element is reported as an issue', () => {
    expect(service.trace('p1', { kind: 'element', id: 'FR-999' })).toMatchObject({
      node: { exists: false },
      issues: ['FR-999 does not exist.'],
    });
  });
});

describe('US-034 AC-3: validation of all links', () => {
  it('lists every link to an unknown ID with the artifact it is in', () => {
    expect(service.issues('p1')).toEqual([
      { path: 'spec/04_user_stories/US-001.md', message: 'US-001 references FR-404, which does not exist.' },
    ]);
  });
});

describe('US-081 AC-3: feature trace types in the traceability panel', () => {
  it('marks introduces / changes / reworks links of a feature intent; plain references stay unmarked', () => {
    const featureElements: Record<string, { type: string; title: string; artifactPath: string }> = {
      ...elements,
      'FI-003': { type: 'feature_intent', title: 'Comments', artifactPath: 'spec/01_intent/FI-003-comments.md' },
      'US-020': { type: 'story', title: 'Comment list', artifactPath: 'spec/04_user_stories/US-020.md' },
    };
    const featureLinks: Record<string, string[]> = { 'FR-001': ['FI-003'], 'US-020': ['FI-003', 'US-001'], 'UC-001': ['FI-003'] };
    const types: Record<string, string> = { 'FR-001>FI-003': 'changes', 'US-020>FI-003': 'introduces', 'US-020>US-001': 'reworks' };
    const typed = new TraceService({
      ...deps,
      element: (_p, id) => featureElements[id],
      linkTargets: (_p, id) => featureLinks[id] ?? [],
      linkSources: (_p, id) => Object.keys(featureLinks).filter((s) => featureLinks[s]!.includes(id)),
      storyRuns: () => [],
      linkType: (_p, source, target) => types[`${source}>${target}`] ?? 'references',
    });

    const fi = typed.trace('p1', { kind: 'element', id: 'FI-003' });
    expect(fi.downstream.map((n) => [n.id, n.linkType])).toEqual([
      ['FR-001', 'changes'],
      ['UC-001', undefined],
      ['US-020', 'introduces'],
    ]);
    expect(typed.trace('p1', { kind: 'element', id: 'US-020' }).upstream.map((n) => [n.id, n.linkType])).toEqual([
      ['FI-003', 'introduces'],
      ['US-001', 'reworks'],
    ]);
  });
});

describe('US-086 AC-4: impact flags on trace nodes', () => {
  it('marks flagged elements with the reason', () => {
    const flagged = new TraceService({
      ...deps,
      impact: (_p, id) => (id === 'US-001' ? 'FR-001 changed after it was approved.' : undefined),
    });
    const down = flagged.trace('p1', { kind: 'element', id: 'FR-001' }).downstream;
    expect(down.find((n) => n.id === 'US-001')?.impact).toBe('FR-001 changed after it was approved.');
    expect(down.find((n) => n.id === 'UC-001')).not.toHaveProperty('impact');
    expect(flagged.trace('p1', { kind: 'element', id: 'US-001' }).node.impact).toBe('FR-001 changed after it was approved.');
  });
});
