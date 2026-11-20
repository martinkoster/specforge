// SPDX-License-Identifier: Apache-2.0
// Per-message workspace baselines for chat changes (US-098, ADR-026): a tree written from a temporary index (a copy of
// the user's index, so the stat cache is reused) after `git add -A`; `.gitignore` is respected; the user's index and
// working tree are untouched. The diff between the baseline tree and a fresh tree covers every changed file — also
// those changed by approved shell commands.
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { GitClient } from './git-client.js';

export interface TreeChange {
  path: string;
  change: 'A' | 'M' | 'D';
  /** Blob of the file in the baseline; null for added files. */
  beforeRef: string | null;
  /** Blob of the file after the turn; null for deleted files. */
  afterRef: string | null;
}

const ZERO = /^0+$/;

export class WorkspaceTrees {
  constructor(private readonly git = new GitClient()) {}

  /** AC-1: the workspace as a tree object (SHA); the user's index is copied, never modified. */
  async capture(repo: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'sf-index-'));
    const index = join(dir, 'index');
    try {
      const gitIndex = (await this.git.run(repo, ['rev-parse', '--git-path', 'index'])).trim();
      await copyFile(isAbsolute(gitIndex) ? gitIndex : join(repo, gitIndex), index).catch(() => undefined);
      const env = { GIT_INDEX_FILE: index };
      await this.git.run(repo, ['add', '-A'], { env });
      return (await this.git.run(repo, ['write-tree'], { env })).trim();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** AC-2: the files that differ between the baseline tree and the current workspace, sorted by path. */
  async changes(repo: string, baseline: string): Promise<TreeChange[]> {
    const current = await this.capture(repo);
    if (current === baseline) return [];
    const out = await this.git.run(repo, ['diff-tree', '-r', '-z', '--no-renames', '--raw', baseline, current]);
    const parts = out.split('\0').filter((p) => p !== '');
    const changes: TreeChange[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      // ":100644 100644 <src> <dst> M" followed by the path.
      const [, , src, dst, status] = parts[i]!.slice(1).split(' ') as [string, string, string, string, string];
      const change = status.startsWith('A') ? 'A' : status.startsWith('D') ? 'D' : 'M';
      changes.push({ path: parts[i + 1]!, change, beforeRef: ZERO.test(src) ? null : src, afterRef: ZERO.test(dst) ? null : dst });
    }
    return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** Content of a blob, or undefined if it does not exist. */
  content(repo: string, blob: string): Promise<Buffer | undefined> {
    return this.git.object(repo, blob);
  }

  /** The paths among `paths` that Git ignores (they are not tracked, AC-3). */
  async ignored(repo: string, paths: readonly string[]): Promise<string[]> {
    if (paths.length === 0) return [];
    const result = await this.git.raw(repo, ['check-ignore', '--no-index', '--', ...paths]);
    return result.code === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
  }
}
