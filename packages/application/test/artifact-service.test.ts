// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ArtifactConflictError, ArtifactService, type ArtifactListIndex } from '../src/index.js';

function setup() {
  const files = new Map<string, string>([
    ['spec/01_intent/intent.md', '---\nkind: intent\napproval: approved\n---\n# Intent\n'],
    ['spec/02_requirements/functional_requirements.md', '---\nkind: requirements\napproval: draft\n---\n### FR-001: Login\n'],
  ]);
  const hash = (c: string) => `h${c.length}`;
  const reindexed: string[] = [];
  const index: ArtifactListIndex = {
    artifacts: () => [
      {
        path: 'spec/02_requirements/functional_requirements.md',
        kind: 'requirements',
        approval: 'draft',
        parseState: 'ok',
        parseError: null,
      },
      { path: 'spec/01_intent/intent.md', kind: 'intent', approval: 'approved', parseState: 'ok', parseError: null },
      { path: 'spec/03_design/broken.md', kind: 'other', approval: 'draft', parseState: 'invalid', parseError: 'bad yaml' },
    ],
  };
  const service = new ArtifactService({
    index,
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: hash(files.get(path)!) } : undefined),
      writeAtomic: async (path, content, { expectedHash }) => {
        const current = files.get(path);
        if (current !== undefined && expectedHash !== hash(current)) throw new ArtifactConflictError(path);
        files.set(path, content);
        return hash(content);
      },
    }),
    reindex: async (_p, path) => void reindexed.push(path),
  });
  return { service, files, reindexed, hash };
}

describe('US-025 AC-2: specifications listed by type with approval state', () => {
  it('groups indexed artifacts by kind in specification order', () => {
    const { service } = setup();

    expect(service.list('p1')).toEqual([
      { kind: 'intent', label: 'Intent', artifacts: [{ path: 'spec/01_intent/intent.md', approval: 'approved', invalid: null }] },
      {
        kind: 'requirements',
        label: 'Requirements',
        artifacts: [{ path: 'spec/02_requirements/functional_requirements.md', approval: 'draft', invalid: null }],
      },
      { kind: 'other', label: 'Other', artifacts: [{ path: 'spec/03_design/broken.md', approval: 'draft', invalid: 'bad yaml' }] },
    ]);
  });
});

describe('US-025 AC-1: read and save', () => {
  it('reads content with its hash and saves atomically with optimistic concurrency, then re-indexes', async () => {
    const { service, files, reindexed } = setup();
    const doc = await service.read('p1', 'spec/01_intent/intent.md');

    const result = await service.save('p1', 'spec/01_intent/intent.md', `${doc.content}More.\n`, doc.hash);

    expect(result).toEqual({ ok: true, hash: expect.any(String) });
    expect(files.get('spec/01_intent/intent.md')).toContain('More.');
    expect(reindexed).toEqual(['spec/01_intent/intent.md']);
  });

  it('only indexed artifacts can be read or written (no arbitrary paths)', async () => {
    const { service } = setup();
    await expect(service.read('p1', '../../etc/passwd')).rejects.toMatchObject({ code: 'NOT_AN_ARTIFACT' });
    await expect(service.save('p1', 'src/index.ts', 'x', null)).rejects.toMatchObject({ code: 'NOT_AN_ARTIFACT' });
  });
});

describe('US-025 AC-3: saving over an externally changed file', () => {
  it('returns the disk version and a diff for the conflict dialog instead of overwriting', async () => {
    const { service, files } = setup();
    const doc = await service.read('p1', 'spec/01_intent/intent.md');
    files.set('spec/01_intent/intent.md', '---\nkind: intent\napproval: approved\n---\n# Intent (edited elsewhere)\n');

    const result = await service.save('p1', 'spec/01_intent/intent.md', `${doc.content}Mine.\n`, doc.hash);

    expect(result).toEqual({
      ok: false,
      conflict: {
        theirs: expect.stringContaining('edited elsewhere'),
        theirsHash: expect.any(String),
        diff: expect.stringContaining('+Mine.'),
      },
    });
    expect(files.get('spec/01_intent/intent.md')).toContain('edited elsewhere');
  });

  it('"keep mine" saves over the disk version using its hash', async () => {
    const { service, files } = setup();
    const doc = await service.read('p1', 'spec/01_intent/intent.md');
    files.set('spec/01_intent/intent.md', 'theirs\n');
    const conflict = await service.save('p1', 'spec/01_intent/intent.md', 'mine\n', doc.hash);
    if (conflict.ok) throw new Error('expected a conflict');

    await expect(service.save('p1', 'spec/01_intent/intent.md', 'mine\n', conflict.conflict.theirsHash)).resolves.toMatchObject({
      ok: true,
    });
    expect(files.get('spec/01_intent/intent.md')).toBe('mine\n');
  });
});
