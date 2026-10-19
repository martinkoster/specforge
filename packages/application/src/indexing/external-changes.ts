// SPDX-License-Identifier: Apache-2.0
// Reconciles external edits of workspace artifacts (FR-018, FR-023, US-021).
import { moveStory, type Approval, type BoardStatus, type ExecSubState } from '@specforge/domain';
import type { ArtifactFiles } from '../stories/dependency-service.js';
import { editFrontMatter } from '../stories/front-matter.js';
import type { WorkspaceIndexer } from './workspace-indexer.js';

/** Remembers content hashes SpecForge wrote itself so the watcher can ignore them. */
export class SelfWriteRegistry {
  private readonly writes = new Map<string, { hash: string; at: number }[]>();

  constructor(private readonly ttlMs = 10_000) {}

  register(path: string, hash: string): void {
    const list = (this.writes.get(path) ?? []).filter((w) => Date.now() - w.at < this.ttlMs);
    list.push({ hash, at: Date.now() });
    this.writes.set(path, list);
  }

  /** True (once) if the current content of `path` was written by SpecForge. */
  consume(path: string, hash: string): boolean {
    const list = this.writes.get(path) ?? [];
    const index = list.findIndex((w) => w.hash === hash && Date.now() - w.at < this.ttlMs);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
}

export interface IndexedStory {
  storyId: string;
  status: BoardStatus;
  approval: Approval;
}

/** Port: the index operations the reconciler needs. */
export interface StoryStatusIndex {
  storyByPath(projectId: string, path: string): IndexedStory | undefined;
  execSubState(projectId: string, storyId: string): ExecSubState;
  setStoryStatus(projectId: string, storyId: string, status: BoardStatus): void;
  setStatusNotice(projectId: string, storyId: string, notice: string | null): void;
}

export type ReconcileEvent =
  | { type: 'self-write'; path: string }
  | { type: 'reindexed'; path: string; status: 'indexed' | 'invalid' | 'removed' }
  | { type: 'story-added'; storyId: string }
  | { type: 'story-moved'; storyId: string; from: BoardStatus; to: BoardStatus }
  | { type: 'status-rejected'; storyId: string; from: BoardStatus; to: BoardStatus; reason: string };

/** External edits may only plan work (Backlog ↔ Ready); starting, reviewing and accepting work is done on the board. */
const PLANNING_COMMANDS = new Set(['approveForReady', 'moveToBacklog']);

export class ExternalChangeReconciler {
  constructor(
    private readonly files: ArtifactFiles,
    private readonly indexer: WorkspaceIndexer,
    private readonly index: StoryStatusIndex,
    private readonly selfWrites: SelfWriteRegistry,
    private readonly emit: (event: ReconcileEvent) => void,
  ) {}

  async handle(projectId: string, paths: readonly string[]): Promise<void> {
    for (const path of paths) await this.handleOne(projectId, path);
  }

  private async handleOne(projectId: string, path: string): Promise<void> {
    const file = await this.files.read(path);
    if (file && this.selfWrites.consume(path, file.hash)) {
      this.emit({ type: 'self-write', path });
      return;
    }
    const before = this.index.storyByPath(projectId, path);
    const result = await this.indexer.reindex(projectId, path);
    this.emit({ type: 'reindexed', path, status: result.status });
    const after = this.index.storyByPath(projectId, path);
    // A new story file (its epic may need to be reopened, FR-095).
    if (file && !before && after) this.emit({ type: 'story-added', storyId: after.storyId });
    if (!file || !before || !after || before.storyId !== after.storyId || before.status === after.status) return;

    const subState = this.index.execSubState(projectId, before.storyId);
    const move = moveStory({ status: before.status, subState, approval: after.approval }, after.status, 'human');
    if (move.ok && PLANNING_COMMANDS.has(move.command)) {
      this.index.setStatusNotice(projectId, before.storyId, null);
      this.emit({ type: 'story-moved', storyId: before.storyId, from: before.status, to: after.status });
      return;
    }
    const reason =
      !move.ok && after.status === 'ready' && before.status === 'backlog'
        ? move.reason
        : `Moving a story from ${before.status} to ${after.status} is not allowed by editing the file. Starting, reviewing and accepting work is done on the board.`;
    await this.revert(projectId, path, file, before);
    this.emit({ type: 'status-rejected', storyId: before.storyId, from: before.status, to: after.status, reason });
    this.index.setStatusNotice(projectId, before.storyId, reason);
  }

  /** Restores the previous status in the index and in the file (so a later full index stays consistent). */
  private async revert(projectId: string, path: string, file: { content: string; hash: string }, before: IndexedStory): Promise<void> {
    this.index.setStoryStatus(projectId, before.storyId, before.status);
    const restored = editFrontMatter(file.content, (doc) => doc.set('status', before.status));
    await this.files.writeAtomic(path, restored, { expectedHash: file.hash });
  }
}
