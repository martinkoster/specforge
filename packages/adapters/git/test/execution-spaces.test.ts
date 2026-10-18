// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ExecutionSpaceManager,
  GitClient,
  WorktreeInUseError,
  parseGitVersion,
  strategyFor,
  type IntegrationStrategy,
} from '../src/index.js';
import { commitFile, makeBranch, makeRepo, sh, tempRoot } from './helpers.js';

// Each Git call costs ~0.3–0.5 s on Windows (spike S2); allow for slow CI runners.
vi.setConfig({ testTimeout: 120_000 });

const manager = (strategy?: IntegrationStrategy) => new ExecutionSpaceManager(new GitClient(), strategy ? { strategy } : {});
const STRATEGIES: IntegrationStrategy[] = ['merge-tree', 'worktree'];

describe('US-046 AC-1: base selection per ADR-010', () => {
  it('chooses merge-tree from Git 2.38 and the scratch worktree before', () => {
    expect(parseGitVersion('git version 2.56.0.windows.1')).toEqual([2, 56, 0]);
    expect(parseGitVersion('git version 2.37.7')).toEqual([2, 37, 7]);
    expect(strategyFor([2, 38, 0])).toBe('merge-tree');
    expect(strategyFor([2, 37, 9])).toBe('worktree');
    expect(() => parseGitVersion('nonsense')).toThrow(/Cannot parse/);
  });

  it('detects the installed Git version', async () => {
    const version = await new GitClient().version();
    expect(version[0]).toBeGreaterThanOrEqual(2);
  });

  it('uses the base branch when there are no unmerged predecessors', async () => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    sh(repo, 'merge', '-q', '--no-ff', '--no-edit', 'specforge/US-001');

    const result = await manager().prepare({
      repo,
      storyId: 'US-005',
      baseBranch: 'main',
      worktreeRoot: tempRoot(),
      predecessors: ['specforge/US-001'],
    });

    expect(result.kind === 'ready' && result.baseRef).toBe(sh(repo, 'rev-parse', 'main'));
    expect(result.kind === 'ready' && result.stackedOn).toEqual([]);
  });

  it('stacks on a single unmerged predecessor', async () => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');

    const result = await manager().prepare({
      repo,
      storyId: 'US-005',
      baseBranch: 'main',
      worktreeRoot: tempRoot(),
      predecessors: ['specforge/US-001'],
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.baseRef).toBe(sh(repo, 'rev-parse', 'specforge/US-001'));
    expect(result.stackedOn).toEqual(['specforge/US-001']);
    expect(readFileSync(join(result.worktreePath, 'a.txt'), 'utf8')).toBe('A\n');
  });

  it.each(STRATEGIES)('builds an integration commit for several predecessors (%s)', async (strategy) => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    makeBranch(repo, 'specforge/US-002', 'main', 'b.txt', 'B\n');

    const result = await manager(strategy).prepare({
      repo,
      storyId: 'US-005',
      baseBranch: 'main',
      worktreeRoot: tempRoot(),
      predecessors: ['specforge/US-001', 'specforge/US-002'],
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.integration).toEqual({ ref: result.baseRef, strategy });
    expect(existsSync(join(result.worktreePath, 'a.txt')) && existsSync(join(result.worktreePath, 'b.txt'))).toBe(true);
  });

  it.each(STRATEGIES)('reports conflicts as Blocked (conflict) with a pending decision (%s)', async (strategy) => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'shared.txt', 'one\n');
    makeBranch(repo, 'specforge/US-002', 'main', 'shared.txt', 'two\n');
    const root = tempRoot();

    const result = await manager(strategy).prepare({
      repo,
      storyId: 'US-005',
      baseBranch: 'main',
      worktreeRoot: root,
      predecessors: ['specforge/US-001', 'specforge/US-002'],
    });

    expect(result).toEqual({
      kind: 'blocked_conflict',
      files: ['shared.txt'],
      branches: ['specforge/US-001', 'specforge/US-002'],
      pendingDecision: {
        type: 'blocked_conflict',
        storyId: 'US-005',
        message: 'Predecessor branches specforge/US-001, specforge/US-002 conflict in shared.txt. Merge them, then click Re-check.',
      },
    });
    expect(readdirSync(root)).toEqual([]);
    expect(sh(repo, 'worktree', 'list').split('\n')).toHaveLength(1);
    expect(sh(repo, 'branch', '--list', 'specforge/US-005')).toBe('');
  });
});

describe('US-046 AC-2: branch naming, short worktree root, recorded base', () => {
  it('creates specforge/<storyId> under <root>/<storyId> and records base_ref and stacked_on', async () => {
    const repo = makeRepo();
    const root = tempRoot();

    const result = await manager().prepare({ repo, storyId: 'US-003', baseBranch: 'main', worktreeRoot: root, predecessors: [] });

    expect(result).toEqual({
      kind: 'ready',
      branch: 'specforge/US-003',
      worktreePath: join(root, 'US-003'),
      baseRef: sh(repo, 'rev-parse', 'main'),
      stackedOn: [],
      warnings: [],
    });
  });

  it('US-016 AC-2: uses the configured branch pattern; the worktree folder is named after the story', async () => {
    const repo = makeRepo();
    const root = tempRoot();

    const result = await manager().prepare({
      repo,
      storyId: 'US-004',
      baseBranch: 'main',
      worktreeRoot: root,
      predecessors: [],
      branchPattern: 'feature/{storyId}-impl',
    });

    expect(result).toMatchObject({ kind: 'ready', branch: 'feature/US-004-impl', worktreePath: join(root, 'US-004') });
  });

  it('adds a numeric suffix for a fresh retry when the branch exists', async () => {
    const repo = makeRepo();
    sh(repo, 'branch', 'specforge/US-003');
    sh(repo, 'branch', 'specforge/US-003-2');
    const root = tempRoot();

    const result = await manager().prepare({ repo, storyId: 'US-003', baseBranch: 'main', worktreeRoot: root, predecessors: [] });

    expect(result.kind === 'ready' && result.branch).toBe('specforge/US-003-3');
    expect(result.kind === 'ready' && result.worktreePath).toBe(join(root, 'US-003-3'));
  });
});

describe('US-046 AC-3: retry reusing the branch and pruning stale worktrees', () => {
  it('checks out the existing story branch in a new worktree, keeping its commits', async () => {
    const repo = makeRepo();
    const m = manager();
    const first = await m.prepare({ repo, storyId: 'US-007', baseBranch: 'main', worktreeRoot: tempRoot(), predecessors: [] });
    if (first.kind !== 'ready') throw new Error('expected ready');
    commitFile(first.worktreePath, 'work.txt', 'agent work\n', 'first run');
    await m.remove(repo, first.worktreePath);

    const retry = await m.prepare({
      repo,
      storyId: 'US-007',
      baseBranch: 'main',
      worktreeRoot: tempRoot(),
      predecessors: [],
      reuseBranch: first.branch,
    });

    expect(retry.kind).toBe('ready');
    if (retry.kind !== 'ready') return;
    expect(retry.branch).toBe(first.branch);
    expect(retry.baseRef).toBe(first.baseRef);
    expect(readFileSync(join(retry.worktreePath, 'work.txt'), 'utf8')).toBe('agent work\n');
  });

  it('refuses to reuse a branch that is still checked out in another worktree', async () => {
    const repo = makeRepo();
    const m = manager();
    const first = await m.prepare({ repo, storyId: 'US-008', baseBranch: 'main', worktreeRoot: tempRoot(), predecessors: [] });
    if (first.kind !== 'ready') throw new Error('expected ready');

    await expect(
      m.prepare({ repo, storyId: 'US-008', baseBranch: 'main', worktreeRoot: tempRoot(), predecessors: [], reuseBranch: first.branch }),
    ).rejects.toBeInstanceOf(WorktreeInUseError);
  });

  it('prunes worktrees whose directories were deleted', async () => {
    const repo = makeRepo();
    const m = manager();
    const first = await m.prepare({ repo, storyId: 'US-009', baseBranch: 'main', worktreeRoot: tempRoot(), predecessors: [] });
    if (first.kind !== 'ready') throw new Error('expected ready');
    const { rmSync } = await import('node:fs');
    rmSync(first.worktreePath, { recursive: true, force: true });
    expect(sh(repo, 'worktree', 'list').split('\n')).toHaveLength(2);

    await m.prune(repo);

    expect(sh(repo, 'worktree', 'list').split('\n')).toHaveLength(1);
  });
});

describe('US-046 AC-4: warning about uncommitted changes in the main working copy', () => {
  it('warns when the main working copy has uncommitted changes', async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, 'README.md'), 'locally modified\n');
    writeFileSync(join(repo, 'new.txt'), 'untracked\n');

    const result = await manager().prepare({ repo, storyId: 'US-010', baseBranch: 'main', worktreeRoot: tempRoot(), predecessors: [] });

    expect(result.kind === 'ready' && result.warnings).toEqual([
      "The main working copy has 2 uncommitted change(s); they are not part of this run's base.",
    ]);
  });
});

describe("US-046 AC-5: argument arrays only and diff of the story's own changes", () => {
  it('passes story ids with shell metacharacters verbatim without executing them', async () => {
    const repo = makeRepo();
    const root = tempRoot();

    await expect(
      manager().prepare({ repo, storyId: 'US-011;echo pwned>pwned.txt', baseBranch: 'main', worktreeRoot: root, predecessors: [] }),
    ).rejects.toThrow(/Invalid story id/);
    expect(existsSync(join(repo, 'pwned.txt'))).toBe(false);
  });

  it("lists only the story's own changes when stacked", async () => {
    const repo = makeRepo();
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'A\n');
    const m = manager();
    const result = await m.prepare({
      repo,
      storyId: 'US-012',
      baseBranch: 'main',
      worktreeRoot: tempRoot(),
      predecessors: ['specforge/US-001'],
    });
    if (result.kind !== 'ready') throw new Error('expected ready');
    commitFile(result.worktreePath, 'c.txt', 'C\n', 'story work');

    await expect(m.changedFiles(repo, result.baseRef, result.branch)).resolves.toEqual([{ path: 'c.txt', change: 'A' }]);
  });
});

describe('US-051 AC-2: changes of a run in its worktree (committed, uncommitted and untracked)', () => {
  it('lists added, modified and deleted files with additions/deletions against the base commit', async () => {
    const repo = makeRepo();
    commitFile(repo, 'old.txt', 'one\ntwo\n', 'old file');
    const m = manager();
    const result = await m.prepare({ repo, storyId: 'US-020', baseBranch: 'main', worktreeRoot: tempRoot(), predecessors: [] });
    if (result.kind !== 'ready') throw new Error('expected ready');
    const wt = result.worktreePath;
    commitFile(wt, 'committed.txt', 'a\nb\nc\n', 'agent commit');
    writeFileSync(join(wt, 'README.md'), 'base\nmore\n');
    writeFileSync(join(wt, 'untracked.txt'), 'x\ny\n');
    sh(wt, 'rm', '-q', 'old.txt');

    await expect(m.worktreeChanges(wt, result.baseRef)).resolves.toEqual([
      { path: 'README.md', change: 'M', additions: 1, deletions: 0 },
      { path: 'committed.txt', change: 'A', additions: 3, deletions: 0 },
      { path: 'old.txt', change: 'D', additions: 0, deletions: 2 },
      { path: 'untracked.txt', change: 'A', additions: 2, deletions: 0 },
    ]);
  });
});

describe('US-024 AC-1: merge detection', () => {
  it('reports which story branches are merged into the base branch, in one Git call', async () => {
    const repo = makeRepo('sf-merged-');
    makeBranch(repo, 'specforge/US-001', 'main', 'a.txt', 'a\n');
    makeBranch(repo, 'specforge/US-002', 'main', 'b.txt', 'b\n');
    sh(repo, 'merge', '-q', '--no-ff', '-m', 'merge US-001', 'specforge/US-001');
    const git = new GitClient();
    const calls: string[][] = [];
    const counting = {
      ...git,
      raw: git.raw.bind(git),
      test: git.test.bind(git),
      version: git.version.bind(git),
      run: (cwd: string, args: readonly string[]) => (calls.push([...args]), git.run(cwd, args)),
    } as unknown as GitClient;

    const merged = await new ExecutionSpaceManager(counting).mergedInto(repo, 'main', [
      'specforge/US-001',
      'specforge/US-002',
      'specforge/US-404',
    ]);

    expect(merged).toEqual(['specforge/US-001']);
    expect(calls).toHaveLength(1);
    expect(await new ExecutionSpaceManager(git).mergedInto(repo, 'main', [])).toEqual([]);
  });
});
