// SPDX-License-Identifier: Apache-2.0
// "Commit spec changes" (US-023, FR-072): status, diffs and commits limited to spec/ and .specforge/ on the main
// workspace's current branch.
import { GitClient } from './git-client.js';

export interface SpecFileStatus {
  path: string;
  change: 'A' | 'M' | 'D';
}

export type SpecCommitResult = { ok: true; commit: string } | { ok: false; output: string };

const SPEC_PATHS = ['spec', '.specforge'];

function isSpecPath(path: string): boolean {
  const segments = path.split('/');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || segments.some((s) => s === '..' || s === '.' || s === '')) return false;
  return SPEC_PATHS.includes(segments[0]!) && segments.length > 1;
}

function changeOf(xy: string): SpecFileStatus['change'] {
  if (xy.includes('D')) return 'D';
  if (xy[0] === 'A') return 'A';
  return 'M';
}

export class SpecCommits {
  constructor(private readonly git = new GitClient()) {}

  /** Uncommitted files under spec/ and .specforge/ (staged, unstaged and untracked), sorted by path. */
  async status(repo: string): Promise<SpecFileStatus[]> {
    const out = await this.git.run(repo, ['status', '--porcelain=v2', '-z', '--no-renames', '--untracked-files=all', '--', ...SPEC_PATHS]);
    const files: SpecFileStatus[] = [];
    for (const entry of out.split('\0').filter(Boolean)) {
      if (entry.startsWith('? ')) files.push({ path: entry.slice(2), change: 'A' });
      else if (entry.startsWith('1 ')) {
        // "1 XY sub mH mI mW hH hI path"
        const fields = entry.split(' ');
        files.push({ path: fields.slice(8).join(' '), change: changeOf(fields[1]!) });
      }
    }
    return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** Unified diff of one file against HEAD; new files are shown as fully added. */
  async diff(repo: string, path: string): Promise<string> {
    const tracked = await this.git.run(repo, ['diff', 'HEAD', '--', path]);
    if (tracked !== '') return tracked;
    // Untracked: --no-index exits with 1 when the files differ.
    const added = await this.git.raw(repo, ['diff', '--no-index', '--', '/dev/null', path]);
    return added.stdout;
  }

  /**
   * Commits exactly `paths` (all under spec/ or .specforge/) on the current branch. A failing hook leaves nothing
   * committed and the index of these paths as before; its output is returned.
   */
  async commit(repo: string, paths: readonly string[], message: string): Promise<SpecCommitResult> {
    const invalid = paths.filter((p) => !isSpecPath(p));
    if (invalid.length > 0 || paths.length === 0) {
      throw new Error(
        `Commit spec changes may include only specification files (spec/**, .specforge/**): ${invalid.join(', ') || 'none given'}`,
      );
    }
    await this.git.run(repo, ['add', '-A', '--', ...paths]);
    const result = await this.git.raw(repo, ['commit', '-q', '-m', message, '--', ...paths]);
    if (result.code !== 0) {
      await this.git.raw(repo, ['reset', '-q', '--', ...paths]);
      return {
        ok: false,
        output:
          [result.stderr, result.stdout]
            .filter((s) => s.trim() !== '')
            .join('\n')
            .trim() || `git commit failed (${result.code}).`,
      };
    }
    return { ok: true, commit: await this.git.run(repo, ['rev-parse', 'HEAD']) };
  }
}
