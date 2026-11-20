// SPDX-License-Identifier: Apache-2.0
// US-096 AC-2/AC-3: spec baselines as annotated Git tags — create, list, read a file at a baseline.
import { describe, expect, it, vi } from 'vitest';
import { SpecBaselines } from '../src/index.js';
import { commitFile, makeRepo, sh } from './helpers.js';

vi.setConfig({ testTimeout: 120_000 });

describe('US-096: spec baselines (git)', () => {
  it('creates an annotated tag on the base branch, lists it with its notes and reads files at the tag', async () => {
    const repo = makeRepo('sf-baseline-');
    sh(repo, 'config', 'tag.gpgsign', 'false');
    commitFile(repo, 'spec/02_requirements/fr.md', '### FR-001: Old\n', 'spec');
    const baselines = new SpecBaselines();
    const branch = sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD');

    const created = await baselines.create(repo, {
      tag: 'spec-v1.0',
      ref: branch,
      notes: 'Baseline spec-v1.0\n\nFeatures: FI-001 Comments',
    });
    expect(created.commit).toBe(sh(repo, 'rev-parse', 'HEAD'));
    commitFile(repo, 'spec/02_requirements/fr.md', '### FR-001: New\n', 'change');

    const tags = await baselines.list(repo);
    expect(tags).toEqual([
      { tag: 'spec-v1.0', commit: created.commit, createdAt: expect.any(String), notes: 'Baseline spec-v1.0\n\nFeatures: FI-001 Comments' },
    ]);
    expect(await baselines.fileAt(repo, 'spec-v1.0', 'spec/02_requirements/fr.md')).toBe('### FR-001: Old\n');
    expect(await baselines.fileAt(repo, 'spec-v1.0', 'spec/02_requirements/missing.md')).toBeNull();
    await expect(baselines.create(repo, { tag: 'spec-v1.0', ref: branch, notes: 'x' })).rejects.toThrow(/exists/);
    await expect(baselines.create(repo, { tag: 'bad tag', ref: branch, notes: 'x' })).rejects.toThrow(/valid tag name/);
  });
});
