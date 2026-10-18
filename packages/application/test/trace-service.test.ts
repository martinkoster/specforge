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
