// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedFiles, isMerged, prepareStoryWorktree, worktreeList, type IntegrationStrategy } from '../src/worktrees.js';
import { commitFile, makeBranch, makeRepo, sh, tempRoot } from './helpers.js';

describe('US-002 AC-1: worktree per story under a short root with branch specforge/<storyId>', () => {
  it('creates the branch from the base branch and a worktree under <root>/<storyId>', async () => {
    const repo = makeRepo();
    const root = tempRoot();

    const result = await prepareStoryWorktree({ repo, storyId: 'US-003', baseBranch: 'main', root, predecessors: [] });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.branch).toBe('specforge/US-003');
    expect(result.worktreePath).toBe(join(root, 'US-003'));
    expect(existsSync(join(result.worktreePath, 'README.md'))).toBe(true);
    expect(result.baseRef).toBe(sh(repo, 'rev-parse', 'main'));
    expect(result.stackedOn).toEqual([]);
  });

  it('adds a numeric suffix when the story branch already exists (fresh retry)', async () => {
    const repo = makeRepo();
    sh(repo, 'branch', 'specforge/US-003');

    const result = await prepareStoryWorktree({ repo, storyId: 'US-003', baseBranch: 'main', root: tempRoot(), predecessors: [] });

    expect(result.kind === 'ready' && result.branch).toBe('specforge/US-003-2');
  });
});

describe('US-002 AC-2: stacking on unmerged predecessors', () => {
  it('branches from the single unmerged predecessor branch', async () => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');

    const result = await prepareStoryWorktree({
      repo, storyId: 'US-005', baseBranch: 'main', root: tempRoot(), predecessors: ['specforge/US-001'],
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.baseRef).toBe(sh(repo, 'rev-parse', 'specforge/US-001'));
    expect(result.stackedOn).toEqual(['specforge/US-001']);
    expect(readFileSync(join(result.worktreePath, 'a.txt'), 'utf8')).toBe('A\n');
  });

  it.each<IntegrationStrategy>(['worktree', 'merge-tree'])('branches from a temporary integration commit containing two unmerged predecessors (%s)', async (strategy) => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    makeBranch(repo, 'specforge/US-002', 'main', 'b.txt', 'B\n');

    const result = await prepareStoryWorktree({
      repo, storyId: 'US-005', baseBranch: 'main', root: tempRoot(), predecessors: ['specforge/US-001', 'specforge/US-002'], strategy,
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.integrationRef).toBe(result.baseRef);
    expect(result.integrationStrategy).toBe(strategy);
    expect(readFileSync(join(result.worktreePath, 'a.txt'), 'utf8')).toBe('A\n');
    expect(readFileSync(join(result.worktreePath, 'b.txt'), 'utf8')).toBe('B\n');
    expect(sh(repo, 'branch', '--list', 'specforge/US-001', 'specforge/US-002').split('\n')).toHaveLength(2);
  });

  it.each<IntegrationStrategy>(['worktree', 'merge-tree'])('integrates three predecessors (%s)', async (strategy) => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    makeBranch(repo, 'specforge/US-002', 'main', 'b.txt', 'B\n');
    makeBranch(repo, 'specforge/US-003', 'main', 'c.txt', 'C\n');

    const result = await prepareStoryWorktree({
      repo, storyId: 'US-006', baseBranch: 'main', root: tempRoot(),
      predecessors: ['specforge/US-001', 'specforge/US-002', 'specforge/US-003'], strategy,
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    for (const f of ['a.txt', 'b.txt', 'c.txt']) expect(existsSync(join(result.worktreePath, f))).toBe(true);
    expect(result.integrationStrategy).toBe(strategy);
  });

  it('ignores predecessors already merged into the base branch', async () => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    sh(repo, 'merge', '-q', '--no-ff', '--no-edit', 'specforge/US-001');

    expect(await isMerged(repo, 'specforge/US-001', 'main')).toBe(true);
    const result = await prepareStoryWorktree({
      repo, storyId: 'US-005', baseBranch: 'main', root: tempRoot(), predecessors: ['specforge/US-001'],
    });

    expect(result.kind === 'ready' && result.baseRef).toBe(sh(repo, 'rev-parse', 'main'));
    expect(result.kind === 'ready' && result.stackedOn).toEqual([]);
  });
});

describe('US-002 AC-3: conflicting integration merges', () => {
  it.each<IntegrationStrategy>(['worktree', 'merge-tree'])('reports the conflicting files and leaves no scratch worktree or story branch behind (%s)', async (strategy) => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'shared.txt', 'from US-001\n');
    makeBranch(repo, 'specforge/US-002', 'main', 'shared.txt', 'from US-002\n');
    const root = tempRoot();

    const result = await prepareStoryWorktree({
      repo, storyId: 'US-005', baseBranch: 'main', root, predecessors: ['specforge/US-001', 'specforge/US-002'], strategy,
    });

    expect(result).toEqual({ kind: 'conflict', files: ['shared.txt'], branches: ['specforge/US-001', 'specforge/US-002'] });
    expect(await worktreeList(repo)).toHaveLength(1);
    expect(readdirSync(root)).toEqual([]);
    expect(sh(repo, 'branch', '--list', 'specforge/US-005')).toBe('');
  });
});

describe('US-002 AC-4: diff shows only the story\'s own changes when stacked', () => {
  it('lists only files changed on the story branch relative to its base_ref', async () => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    const result = await prepareStoryWorktree({
      repo, storyId: 'US-005', baseBranch: 'main', root: tempRoot(), predecessors: ['specforge/US-001'],
    });
    if (result.kind !== 'ready') throw new Error('expected ready');
    commitFile(result.worktreePath, 'c.txt', 'C\n', 'US-005 work');

    const files = await changedFiles(repo, result.baseRef, result.branch);

    expect(files).toEqual([{ path: 'c.txt', change: 'A' }]);
  });
});

describe('US-002 AC-5: Windows path lengths', () => {
  it('checks out a repository whose paths exceed 260 characters in the worktree', async () => {
    const repo = makeRepo();
    const deep = Array.from({ length: 12 }, (_, i) => `level-${i}-${'x'.repeat(14)}`).join('/');
    commitFile(repo, `${deep}/deep-file.txt`, 'deep\n', 'deep path');
    const root = tempRoot();

    const result = await prepareStoryWorktree({ repo, storyId: 'US-009', baseBranch: 'main', root, predecessors: [] });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    const full = join(result.worktreePath, ...deep.split('/'), 'deep-file.txt');
    expect(full.length).toBeGreaterThan(260);
    expect(readFileSync(full, 'utf8')).toBe('deep\n');
  });
});
