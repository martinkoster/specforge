// SPDX-License-Identifier: Apache-2.0
// Project settings (US-016, FR-027, FR-050, FR-053): Git conventions, worktree folder, snapshot exclusions, parallel runs.

export interface ProjectSettings {
  /** Branch the story branches are created from (git mode). */
  baseBranch: string;
  branchPattern: string;
  /** Absolute folder for run worktrees (`<root>/<storyId>`, ADR-010). */
  worktreeRoot: string;
  snapshotExclusions: string[];
  concurrencyLimit: number;
}

export const MAX_CONCURRENCY = 10;

export const DEFAULT_PROJECT_SETTINGS: Omit<ProjectSettings, 'baseBranch' | 'worktreeRoot'> = {
  branchPattern: 'specforge/{storyId}',
  snapshotExclusions: ['node_modules/**', '.venv/**', 'dist/**', 'build/**', 'target/**'],
  concurrencyLimit: 3,
};

/** Non-git mode shares the working copy: one run at a time (D12). */
export function effectiveConcurrency(limit: number, vcsMode: 'git' | 'none'): number {
  return vcsMode === 'none' ? 1 : limit;
}

export function branchNameFor(pattern: string, storyId: string): string {
  return pattern.replaceAll('{storyId}', storyId);
}

/** Git's ref-name rules (git check-ref-format) for a branch name. */
export function isValidBranchName(name: string): boolean {
  if (name === '' || name === '@' || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock'))
    return false;
  if (name.includes('..') || name.includes('//') || name.includes('@{') || /[\s~^:?*[\\]/.test(name)) return false;
  if ([...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
  return name.split('/').every((part) => part !== '' && !part.startsWith('.'));
}

const isAbsolute = (path: string): boolean => /^([a-zA-Z]:)?[\\/]/.test(path);
const normalise = (path: string): string => {
  const p = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-zA-Z]:/.test(p) ? p.toLowerCase() : p;
};

export function validateProjectSettings(s: ProjectSettings, ctx: { workspacePath: string; vcsMode: 'git' | 'none' }): string[] {
  const errors: string[] = [];
  if (ctx.vcsMode === 'git' && s.baseBranch.trim() === '') errors.push('Choose a base branch.');
  if (!s.branchPattern.includes('{storyId}')) errors.push('The branch pattern must contain {storyId}.');
  else {
    const sample = branchNameFor(s.branchPattern, 'US-001');
    if (!isValidBranchName(sample)) errors.push(`"${sample}" is not a valid Git branch name.`);
  }
  if (!isAbsolute(s.worktreeRoot)) errors.push('The worktree folder must be an absolute path.');
  else {
    const root = normalise(s.worktreeRoot);
    const workspace = normalise(ctx.workspacePath);
    if (root === workspace || root.startsWith(`${workspace}/`)) {
      errors.push('The worktree folder must be outside the workspace (run worktrees must not be indexed).');
    }
  }
  for (const pattern of s.snapshotExclusions) {
    if (pattern.trim() === '') errors.push('Snapshot exclusions must not be empty.');
    else if (isAbsolute(pattern)) errors.push(`Snapshot exclusion "${pattern}" must be a path pattern relative to the workspace.`);
  }
  if (!Number.isInteger(s.concurrencyLimit) || s.concurrencyLimit < 1 || s.concurrencyLimit > MAX_CONCURRENCY) {
    errors.push(`Parallel runs must be a whole number from 1 to ${MAX_CONCURRENCY}.`);
  }
  return errors;
}
