// SPDX-License-Identifier: Apache-2.0
// Files of a story's run for the review (US-057, UC-022): before/after contents of the story's own changes (vs. the
// run's base commit or its pre-run snapshot) and validated paths for "Open in editor".
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { GitClient } from '@specforge/git';
import type { SnapshotStore } from '@specforge/snapshot';
import type { ExecutionStore } from '@specforge/sqlite';

export interface FileVersions {
  before: string | null;
  after: string | null;
  binary: boolean;
}

export interface ReviewFilesDeps {
  store: ExecutionStore;
  workspace(projectId: string): string;
  snapshots(projectId: string): SnapshotStore;
  git: GitClient;
}

const MAX_TEXT = 2 * 1024 * 1024;
const isBinary = (data: Buffer | undefined) => data !== undefined && (data.length > MAX_TEXT || data.includes(0));

export class ReviewFiles {
  constructor(private readonly deps: ReviewFilesDeps) {}

  /** Absolute path of a run file; refuses anything outside the run's worktree (or the workspace in non-git mode). */
  resolve(projectId: string, runId: string, path: string): string {
    const root = this.root(projectId, runId);
    const segments = path.split('/');
    if (path === '' || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || segments.some((s) => s === '..' || s === '')) {
      throw new Error(`Invalid file path ${path}.`);
    }
    const full = resolve(join(root, ...segments));
    if (!full.startsWith(resolve(root) + sep)) throw new Error(`Invalid file path ${path}.`);
    return full;
  }

  async versions(projectId: string, runId: string, path: string): Promise<FileVersions> {
    const space = this.deps.store.executionSpace(runId);
    if (!space) throw new Error(`Run ${runId} has no execution space.`);
    const full = this.resolve(projectId, runId, path);
    const after = await readFile(full).catch(() => undefined);
    let before: Buffer | undefined;
    if (space.mode === 'worktree' && space.worktreePath && space.baseRef) {
      before = await this.deps.git.blob(space.worktreePath, space.baseRef, path);
    } else if (space.snapshotId) {
      const snapshots = this.deps.snapshots(projectId);
      const entry = snapshots.load(space.snapshotId).manifest.files[path];
      before = entry ? snapshots.readObject(entry.hash) : undefined;
    }
    if (isBinary(before) || isBinary(after)) return { before: null, after: null, binary: true };
    return { before: before?.toString('utf8') ?? null, after: after?.toString('utf8') ?? null, binary: false };
  }

  private root(projectId: string, runId: string): string {
    const space = this.deps.store.executionSpace(runId);
    if (space?.mode === 'worktree' && space.worktreePath) return space.worktreePath;
    return this.deps.workspace(projectId);
  }
}
