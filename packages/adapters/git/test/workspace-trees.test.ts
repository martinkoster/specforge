// SPDX-License-Identifier: Apache-2.0
// US-098 AC-1/AC-2 (ADR-026): per-message workspace baselines as trees written from a temporary index — the user's index
// and working tree stay untouched; the diff covers every changed file, also those changed by shell commands.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceTrees } from '../src/index.js';
import { commitFile, makeRepo, sh } from './helpers.js';

vi.setConfig({ testTimeout: 120_000 });

describe('US-098: workspace baselines (git)', () => {
  it('captures a baseline without touching the index, diffs against it and reads both sides', async () => {
    const repo = makeRepo('sf-trees-');
    commitFile(repo, 'src/a.ts', 'a\n', 'a');
    commitFile(repo, 'src/old.ts', 'old\n', 'old');
    writeFileSync(join(repo, '.gitignore'), 'secret.env\n');
    writeFileSync(join(repo, 'src/a.ts'), 'a staged\n');
    sh(repo, 'add', 'src/a.ts');
    writeFileSync(join(repo, 'notes.md'), 'untracked before\n');
    const statusBefore = sh(repo, 'status', '--porcelain');
    const trees = new WorkspaceTrees();

    const baseline = await trees.capture(repo);
    expect(sh(repo, 'status', '--porcelain')).toBe(statusBefore);

    writeFileSync(join(repo, 'src/a.ts'), 'a changed by the chat\n');
    rmSync(join(repo, 'src/old.ts'));
    mkdirSync(join(repo, 'docs'));
    writeFileSync(join(repo, 'docs/new.md'), 'new\n');
    writeFileSync(join(repo, 'secret.env'), 'TOKEN=1\n');

    const changes = await trees.changes(repo, baseline);
    expect(changes.map((c) => [c.path, c.change])).toEqual([
      ['docs/new.md', 'A'],
      ['src/a.ts', 'M'],
      ['src/old.ts', 'D'],
    ]);
    const a = changes.find((c) => c.path === 'src/a.ts')!;
    expect((await trees.content(repo, a.beforeRef!))?.toString()).toBe('a staged\n');
    expect((await trees.content(repo, a.afterRef!))?.toString()).toBe('a changed by the chat\n');
    expect(changes.find((c) => c.path === 'docs/new.md')!.beforeRef).toBeNull();
    expect(changes.find((c) => c.path === 'src/old.ts')!.afterRef).toBeNull();
    expect(sh(repo, 'diff', '--cached', '--name-only')).toBe('src/a.ts');
    expect(await trees.ignored(repo, ['secret.env', 'src/a.ts'])).toEqual(['secret.env']);
    expect(await trees.ignored(repo, ['src/a.ts'])).toEqual([]);
    expect(readFileSync(join(repo, 'notes.md'), 'utf8')).toBe('untracked before\n');
  });
});
