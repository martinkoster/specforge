// SPDX-License-Identifier: Apache-2.0
// ExecutionSpaceManager (ADR-010, FR-038, FR-067, FR-116c): one worktree per story run, stacked on unmerged predecessors.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitClient, GitVersion } from './git-client.js';

/** `merge-tree`: checkout-free integration commit (Git ≥ 2.38); `worktree`: merge in a scratch worktree (Git 2.30–2.37). */
export type IntegrationStrategy = 'merge-tree' | 'worktree';

export function strategyFor([major, minor]: GitVersion): IntegrationStrategy {
  return major > 2 || (major === 2 && minor >= 38) ? 'merge-tree' : 'worktree';
}

export interface PrepareRequest {
  repo: string;
  storyId: string;
  baseBranch: string;
  /** Short per-project root, e.g. <appdata>/wt/<projectShortId>. */
  worktreeRoot: string;
  /** Branches of blocking predecessors (Done, possibly unmerged). */
  predecessors: string[];
  /** Retry: check out this existing story branch instead of creating a new one. */
  reuseBranch?: string;
  /** Branch name pattern with `{storyId}` (project settings, US-016); default `specforge/{storyId}`. */
  branchPattern?: string;
}

export interface PendingConflictDecision {
  type: 'blocked_conflict';
  storyId: string;
  message: string;
}

export type PrepareResult =
  | {
      kind: 'ready';
      branch: string;
      worktreePath: string;
      baseRef: string;
      stackedOn: string[];
      integration?: { ref: string; strategy: IntegrationStrategy };
      warnings: string[];
    }
  | { kind: 'blocked_conflict'; files: string[]; branches: string[]; pendingDecision: PendingConflictDecision };

export interface ChangedFile {
  path: string;
  change: 'A' | 'M' | 'D';
}

export interface ChangedFileStat extends ChangedFile {
  additions: number;
  deletions: number;
}

export class WorktreeInUseError extends Error {
  constructor(branch: string) {
    super(`Branch ${branch} is still checked out in another worktree; finish or remove that run first.`);
    this.name = 'WorktreeInUseError';
  }
}

const STORY_ID = /^[A-Za-z]+-\d+$/;
const IDENTITY = ['-c', 'user.name=SpecForge', '-c', 'user.email=specforge@localhost'];

type Integration = { ref: string } | { conflict: string[] };

export class ExecutionSpaceManager {
  private strategy: Promise<IntegrationStrategy> | undefined;

  constructor(
    private readonly git: GitClient,
    options: { strategy?: IntegrationStrategy } = {},
  ) {
    if (options.strategy) this.strategy = Promise.resolve(options.strategy);
  }

  async prepare(request: PrepareRequest): Promise<PrepareResult> {
    if (!STORY_ID.test(request.storyId)) throw new Error(`Invalid story id "${request.storyId}"`);
    const { repo } = request;
    const warnings = await this.uncommittedWarning(repo);

    if (request.reuseBranch) {
      const worktreePath = join(request.worktreeRoot, request.reuseBranch.split('/').pop()!);
      if (await this.checkedOutElsewhere(repo, request.reuseBranch)) throw new WorktreeInUseError(request.reuseBranch);
      await this.git.run(repo, ['worktree', 'add', worktreePath, request.reuseBranch]);
      const baseRef = await this.git.run(repo, ['merge-base', request.reuseBranch, request.baseBranch]);
      return { kind: 'ready', branch: request.reuseBranch, worktreePath, baseRef, stackedOn: [], warnings };
    }

    const merged = new Set(
      (await this.git.run(repo, ['branch', '--merged', request.baseBranch, '--format=%(refname:short)'])).split('\n').filter(Boolean),
    );
    const unmerged = request.predecessors.filter((p) => !merged.has(p));

    let baseRef: string;
    let integration: { ref: string; strategy: IntegrationStrategy } | undefined;
    if (unmerged.length === 0) baseRef = await this.git.run(repo, ['rev-parse', request.baseBranch]);
    else if (unmerged.length === 1) baseRef = await this.git.run(repo, ['rev-parse', unmerged[0]!]);
    else {
      const strategy = await this.integrationStrategy();
      const result =
        strategy === 'merge-tree' ? await this.integrateWithMergeTree(repo, unmerged) : await this.integrateInWorktree(repo, unmerged);
      if ('conflict' in result) {
        return {
          kind: 'blocked_conflict',
          files: result.conflict,
          branches: unmerged,
          pendingDecision: {
            type: 'blocked_conflict',
            storyId: request.storyId,
            message: `Predecessor branches ${unmerged.join(', ')} conflict in ${result.conflict.join(', ')}. Merge them, then click Re-check.`,
          },
        };
      }
      baseRef = result.ref;
      integration = { ref: result.ref, strategy };
    }

    const base = (request.branchPattern ?? 'specforge/{storyId}').replaceAll('{storyId}', request.storyId);
    const branch = await this.freeBranchName(repo, base);
    // The folder is named after the story (plus the retry suffix), independent of the branch pattern.
    const worktreePath = join(request.worktreeRoot, request.storyId + branch.slice(base.length));
    await this.git.run(repo, ['worktree', 'add', '-b', branch, worktreePath, baseRef]);
    return { kind: 'ready', branch, worktreePath, baseRef, stackedOn: unmerged, ...(integration ? { integration } : {}), warnings };
  }

  /** Startup cleanup of worktrees whose directories no longer exist. */
  async prune(repo: string): Promise<void> {
    await this.git.run(repo, ['worktree', 'prune']);
  }

  async remove(repo: string, worktreePath: string): Promise<void> {
    await this.git.run(repo, ['worktree', 'remove', '--force', worktreePath]);
  }

  async changedFiles(repo: string, baseRef: string, branch: string): Promise<ChangedFile[]> {
    const out = await this.git.run(repo, ['diff', '--name-status', '--no-renames', `${baseRef}..${branch}`]);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [change, path] = line.split('\t');
        return { path: path!, change: change as ChangedFile['change'] };
      });
  }

  /**
   * Everything a run changed in its worktree relative to the commit it started from: committed and uncommitted
   * changes of tracked files plus untracked files (US-051, FR-043).
   */
  async worktreeChanges(worktreePath: string, baseRef: string): Promise<ChangedFileStat[]> {
    // One diff call for change type (raw) and line counts (numstat), in parallel with the untracked listing.
    const [diff, untracked] = await Promise.all([
      this.git.run(worktreePath, ['diff', '--no-renames', '--raw', '--numstat', baseRef]),
      this.git.run(worktreePath, ['ls-files', '--others', '--exclude-standard']),
    ]);
    const rows = diff.split('\n').filter(Boolean);
    const counts = new Map(
      rows
        .filter((row) => !row.startsWith(':'))
        .map((row) => {
          const [add, del, path] = row.split('\t');
          // Binary files report "-".
          return [path!, { additions: Number(add) || 0, deletions: Number(del) || 0 }] as const;
        }),
    );
    const changes: ChangedFileStat[] = rows
      .filter((row) => row.startsWith(':'))
      .map((row) => {
        // ":<mode> <mode> <sha> <sha> <status>\t<path>"
        const [meta, path] = row.split('\t') as [string, string];
        const change = meta.split(' ').at(-1)!.charAt(0) as ChangedFile['change'];
        return { path, change, ...(counts.get(path) ?? { additions: 0, deletions: 0 }) };
      });
    for (const path of untracked.split('\n').filter(Boolean)) {
      const content = await readFile(join(worktreePath, path), 'utf8').catch(() => '');
      const lines = content === '' ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
      changes.push({ path, change: 'A', additions: lines, deletions: 0 });
    }
    // Byte order, like Git.
    return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** Branches (of `branches`) whose tip is reachable from `baseBranch`: merged by the user (US-024, FR-115). */
  async mergedInto(repo: string, baseBranch: string, branches: readonly string[]): Promise<string[]> {
    if (branches.length === 0) return [];
    // One call for all candidates (equivalent to `merge-base --is-ancestor` per branch); missing branches are skipped.
    const out = await this.git.run(repo, [
      'for-each-ref',
      `--merged=${baseBranch}`,
      '--format=%(refname:short)',
      ...branches.map((b) => `refs/heads/${b}`),
    ]);
    const merged = new Set(out.split('\n').filter(Boolean));
    return branches.filter((b) => merged.has(b));
  }

  private integrationStrategy(): Promise<IntegrationStrategy> {
    this.strategy ??= this.git.version().then(strategyFor);
    return this.strategy;
  }

  private async uncommittedWarning(repo: string): Promise<string[]> {
    const status = (await this.git.run(repo, ['status', '--porcelain'])).split('\n').filter(Boolean);
    return status.length > 0
      ? [`The main working copy has ${status.length} uncommitted change(s); they are not part of this run's base.`]
      : [];
  }

  private async checkedOutElsewhere(repo: string, branch: string): Promise<boolean> {
    const list = await this.git.run(repo, ['worktree', 'list', '--porcelain']);
    return list.split('\n').some((line) => line === `branch refs/heads/${branch}`);
  }

  private async freeBranchName(repo: string, base: string): Promise<string> {
    const exists = (name: string) => this.git.test(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
    if (!(await exists(base))) return base;
    for (let n = 2; ; n++) if (!(await exists(`${base}-${n}`))) return `${base}-${n}`;
  }

  private async integrateWithMergeTree(repo: string, branches: string[]): Promise<Integration> {
    let current = await this.git.run(repo, ['rev-parse', branches[0]!]);
    for (const branch of branches.slice(1)) {
      const merge = await this.git.raw(repo, ['merge-tree', '--write-tree', '--name-only', '--no-messages', current, branch]);
      const [tree, ...conflicted] = merge.stdout.split('\n').filter(Boolean);
      if (merge.code === 1) return { conflict: conflicted };
      if (merge.code !== 0 || !tree) throw new Error(`git merge-tree failed (${merge.code}): ${merge.stderr.trim()}`);
      current = await this.git.run(repo, [
        ...IDENTITY,
        'commit-tree',
        tree,
        '-p',
        current,
        '-p',
        branch,
        '-m',
        `SpecForge integration: ${branch}`,
      ]);
    }
    return { ref: current };
  }

  private async integrateInWorktree(repo: string, branches: string[]): Promise<Integration> {
    const holder = mkdtempSync(join(tmpdir(), 'sf-int-'));
    const scratch = join(holder, 'wt');
    await this.git.run(repo, ['worktree', 'add', '--detach', scratch, branches[0]!]);
    try {
      for (const branch of branches.slice(1)) {
        const merge = await this.git.raw(scratch, [...IDENTITY, 'merge', '--no-ff', '--no-edit', branch]);
        if (merge.code !== 0) {
          const files = (await this.git.run(scratch, ['diff', '--name-only', '--diff-filter=U'])).split('\n').filter(Boolean);
          await this.git.raw(scratch, ['merge', '--abort']);
          return { conflict: files };
        }
      }
      return { ref: await this.git.run(scratch, ['rev-parse', 'HEAD']) };
    } finally {
      await this.git.raw(repo, ['worktree', 'remove', '--force', scratch]);
      rmSync(holder, { recursive: true, force: true });
    }
  }
}
