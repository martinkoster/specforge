// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ApprovalService, generationInputCheck, type IndexedArtifact } from '../src/index.js';

const artifacts: IndexedArtifact[] = [
  { path: 'spec/01_intent/intent.md', kind: 'intent', approval: 'approved', parseState: 'ok', parseError: null },
  { path: 'spec/02_requirements/fr.md', kind: 'requirements', approval: 'draft', parseState: 'ok', parseError: null },
  { path: 'spec/02_requirements/nfr.md', kind: 'requirements', approval: 'approved', parseState: 'ok', parseError: null },
  { path: 'spec/03_design/c4.md', kind: 'design', approval: 'approved', parseState: 'ok', parseError: null },
];

function setup() {
  const files = new Map<string, string>([
    ['spec/02_requirements/fr.md', '---\nkind: requirements\napproval: draft\n# keep\n---\n### FR-001\n'],
    ['spec/03_design/c4.md', '---\nkind: design\napproval: approved\napproved_at: 2026-10-01T00:00:00.000Z\n---\n# C4\n'],
  ]);
  const reindexed: string[] = [];
  const service = new ApprovalService({
    index: { artifacts: () => artifacts },
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h${files.get(path)!.length}` } : undefined),
      writeAtomic: async (path, content) => {
        files.set(path, content);
        return `h${content.length}`;
      },
    }),
    reindex: async (_p, path) => void reindexed.push(path),
    now: () => '2026-10-16T09:00:00.000Z',
  });
  return { service, files, reindexed };
}

describe('US-026 AC-1: approve an artifact', () => {
  it('writes approval: approved and approved_at, keeps the body, re-indexes', async () => {
    const { service, files, reindexed } = setup();

    await expect(service.approve('p1', 'spec/02_requirements/fr.md')).resolves.toEqual({ ok: true, hash: expect.any(String) });

    const content = files.get('spec/02_requirements/fr.md')!;
    expect(content).toContain('approval: approved');
    expect(content).toContain('approved_at: 2026-10-16T09:00:00.000Z');
    expect(content).toContain('# keep');
    expect(content.endsWith('### FR-001\n')).toBe(true);
    expect(reindexed).toEqual(['spec/02_requirements/fr.md']);
  });

  it('refuses paths that are not artifacts', async () => {
    const { service } = setup();
    await expect(service.approve('p1', 'src/index.ts')).rejects.toMatchObject({ code: 'NOT_AN_ARTIFACT' });
  });
});

describe('US-026 AC-2: an AI change makes the artifact Draft again', () => {
  it('sets approval: draft, removes approved_at and records the run', async () => {
    const { service, files } = setup();

    await service.markDraftAfterAiChange('p1', ['spec/03_design/c4.md', 'src/not-an-artifact.ts'], 'run-42');

    const content = files.get('spec/03_design/c4.md')!;
    expect(content).toContain('approval: draft');
    expect(content).not.toContain('approved_at');
    expect(content).toContain('generated_by: run-42');
  });
});

describe('US-026 AC-3: generating from Draft inputs needs confirmation', () => {
  it('lists the Draft inputs of a generation target with a warning', () => {
    expect(generationInputCheck('design', artifacts)).toEqual({
      drafts: ['spec/02_requirements/fr.md'],
      warning: 'Some inputs are still Draft: spec/02_requirements/fr.md. Generated design may need rework. Continue anyway?',
    });
    expect(generationInputCheck('requirements', artifacts)).toEqual({ drafts: [], warning: null });
    expect(generationInputCheck('stories', artifacts)).toEqual({ drafts: [], warning: null });
  });
});
