// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'core.longpaths=true', ...args], { cwd, encoding: 'utf8' }).trim();
}

/** Creates a repo with one commit on `main`; returns its path. */
export function makeRepo(prefix = 's2-repo-'): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, 'config', 'user.email', 'spike@specforge.local');
  sh(repo, 'config', 'user.name', 'Spike');
  sh(repo, 'config', 'commit.gpgsign', 'false');
  sh(repo, 'config', 'core.autocrlf', 'false');
  commitFile(repo, 'README.md', 'base\n', 'initial');
  return repo;
}

export function commitFile(cwd: string, path: string, content: string, message: string): void {
  const full = join(cwd, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  sh(cwd, 'add', '--', path);
  sh(cwd, 'commit', '-q', '-m', message);
}

/** Creates `branch` from `from` with one committed file, then returns to main. */
export function makeBranch(repo: string, branch: string, from: string, file: string, content: string): void {
  sh(repo, 'checkout', '-q', '-b', branch, from);
  commitFile(repo, file, content, `${branch}: ${file}`);
  sh(repo, 'checkout', '-q', 'main');
}

export function tempRoot(prefix = 's2-wt-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
