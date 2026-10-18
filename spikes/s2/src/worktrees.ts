// SPDX-License-Identifier: Apache-2.0
// Prototype of SpecForge's ExecutionSpaceManager (ADR-010): one worktree per story run,
// stacked on unmerged predecessor branches, temporary integration commits for several predecessors.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * How the base commit for several unmerged predecessors is built:
 * - `worktree`: merge in a temporary scratch worktree (works with Git >= 2.30)
 * - `merge-tree`: `git merge-tree --write-tree` + `commit-tree`, no checkout (Git >= 2.38, much faster)
 */
export type IntegrationStrategy = 'worktree' | 'merge-tree';

export interface PrepareRequest {
  repo: string;
  storyId: string;
  baseBranch: string;
  /** Short root directory for worktrees, e.g. <appdata>/wt/<project>. */
  root: string;
  /** Branches of blocking predecessors (Done, possibly unmerged). */
  predecessors: string[];
  strategy?: IntegrationStrategy;
}

export type PrepareResult =
  | {
      kind: 'ready';
      branch: string;
      worktreePath: string;
      baseRef: string;
      stackedOn: string[];
      integrationRef?: string;
      integrationStrategy?: IntegrationStrategy;
    }
  | { kind: 'conflict'; files: string[]; branches: string[] };

export interface ChangedFile {
  path: string;
  change: 'A' | 'M' | 'D';
}

class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`);
  }
}

const IDENTITY = ['-c', 'user.name=SpecForge', '-c', 'user.email=specforge@localhost'];

/** Runs git with an argument array (never a shell, NFR-011); long paths enabled for Windows. */
function gitRaw(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const full = ['-c', 'core.longpaths=true', ...args];
  return new Promise((resolve) => {
    execFile('git', full, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
      resolve({ code, stdout: stdout.trim(), stderr });
    });
  });
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { code, stdout, stderr } = await gitRaw(cwd, args);
  if (code !== 0) throw new GitError(args, code, stderr);
  return stdout;
}

async function succeeds(cwd: string, args: string[]): Promise<boolean> {
  const { code, stderr } = await gitRaw(cwd, args);
  if (code === 0) return true;
  if (code === 1) return false;
  throw new GitError(args, code, stderr);
}

export function isMerged(repo: string, branch: string, base: string): Promise<boolean> {
  return succeeds(repo, ['merge-base', '--is-ancestor', branch, base]);
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  return succeeds(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
}

async function freeBranchName(repo: string, storyId: string): Promise<string> {
  const base = `specforge/${storyId}`;
  if (!(await branchExists(repo, base))) return base;
  for (let n = 2; ; n++) {
    if (!(await branchExists(repo, `${base}-${n}`))) return `${base}-${n}`;
  }
}

type Integration = { ref: string } | { conflict: string[] };

/** Builds a merge commit of `branches` without any checkout (git merge-tree --write-tree, Git >= 2.38). */
async function integrateWithMergeTree(repo: string, branches: string[]): Promise<Integration> {
  let current = await git(repo, ['rev-parse', branches[0]!]);
  for (const branch of branches.slice(1)) {
    const merge = await gitRaw(repo, ['merge-tree', '--write-tree', '--name-only', '--no-messages', current, branch]);
    const [tree, ...conflicted] = merge.stdout.split('\n').filter(Boolean);
    if (merge.code === 1) return { conflict: conflicted };
    if (merge.code !== 0 || !tree) throw new GitError(['merge-tree', current, branch], merge.code, merge.stderr);
    current = await git(repo, [...IDENTITY, 'commit-tree', tree, '-p', current, '-p', branch, '-m', `SpecForge integration: ${branch}`]);
  }
  return { ref: current };
}

/** Builds a temporary merge commit of `branches` in a scratch worktree; the worktree is always removed. */
async function integrateInWorktree(repo: string, branches: string[]): Promise<Integration> {
  const scratch = join(mkdtempSync(join(tmpdir(), 'sf-int-')), 'wt');
  await git(repo, ['worktree', 'add', '--detach', scratch, branches[0]!]);
  try {
    for (const branch of branches.slice(1)) {
      try {
        await git(scratch, [...IDENTITY, 'merge', '--no-ff', '--no-edit', branch]);
      } catch (e) {
        if (!(e instanceof GitError)) throw e;
        const files = (await git(scratch, ['diff', '--name-only', '--diff-filter=U'])).split('\n').filter(Boolean);
        await git(scratch, ['merge', '--abort']).catch(() => undefined);
        return { conflict: files };
      }
    }
    return { ref: await git(scratch, ['rev-parse', 'HEAD']) };
  } finally {
    await git(repo, ['worktree', 'remove', '--force', scratch]).catch(() => undefined);
    rmSync(join(scratch, '..'), { recursive: true, force: true });
  }
}

export async function prepareStoryWorktree(req: PrepareRequest): Promise<PrepareResult> {
  const strategy = req.strategy ?? 'merge-tree';
  const unmerged: string[] = [];
  for (const p of req.predecessors) if (!(await isMerged(req.repo, p, req.baseBranch))) unmerged.push(p);

  let baseRef: string;
  let integrationRef: string | undefined;
  if (unmerged.length === 0) {
    baseRef = await git(req.repo, ['rev-parse', req.baseBranch]);
  } else if (unmerged.length === 1) {
    baseRef = await git(req.repo, ['rev-parse', unmerged[0]!]);
  } else {
    const result =
      strategy === 'merge-tree' ? await integrateWithMergeTree(req.repo, unmerged) : await integrateInWorktree(req.repo, unmerged);
    if ('conflict' in result) return { kind: 'conflict', files: result.conflict, branches: unmerged };
    baseRef = integrationRef = result.ref;
  }

  const branch = await freeBranchName(req.repo, req.storyId);
  const worktreePath = join(req.root, req.storyId);
  await git(req.repo, ['worktree', 'add', '-b', branch, worktreePath, baseRef]);
  return {
    kind: 'ready',
    branch,
    worktreePath,
    baseRef,
    stackedOn: unmerged,
    ...(integrationRef ? { integrationRef, integrationStrategy: strategy } : {}),
  };
}

export async function changedFiles(repo: string, baseRef: string, branch: string): Promise<ChangedFile[]> {
  const out = await git(repo, ['diff', '--name-status', '--no-renames', `${baseRef}..${branch}`]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { path: path!, change: status as ChangedFile['change'] };
    });
}

export async function worktreeList(repo: string): Promise<string[]> {
  const out = await git(repo, ['worktree', 'list', '--porcelain']);
  return out
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
}
