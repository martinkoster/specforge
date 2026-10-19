// SPDX-License-Identifier: Apache-2.0
// Kanban board (US-038, FR-019–FR-021): columns, human moves through the story state machine, card order.
import {
  BOARD_STATUSES,
  applyStoryCommand,
  moveStory,
  type Approval,
  type BoardStatus,
  type ExecSubState,
  type QueueReason,
  type StoryCommand,
  type StoryDependency,
  deriveEpicStatus,
  type EpicProgress,
  type EpicStatus,
} from '@specforge/domain';
import type { ArtifactFiles } from '../stories/dependency-service.js';
import { editFrontMatter } from '../stories/front-matter.js';

export interface BoardStoryRow {
  storyId: string;
  title: string;
  size: string | null;
  approval: Approval;
  status: BoardStatus;
  subState: ExecSubState;
  /** Position within the column (DB-only, ADR-004); null = not yet ordered. */
  order: number | null;
  queueReason: QueueReason | null;
  waitingFor: string[];
  statusNotice: string | null;
  authorisedAt: string | null;
  /** Epic of the story (`epic` front-matter), null = No epic. */
  epicId?: string | null;
}

export interface BoardIndex {
  stories(projectId: string): BoardStoryRow[];
  storyPath(projectId: string, storyId: string): string | undefined;
  setSubState(projectId: string, storyId: string, subState: ExecSubState): void;
  setOrder(projectId: string, storyId: string, order: number): void;
  setAuthorisedAt(projectId: string, storyId: string, at: string): void;
  dependencies(projectId: string): StoryDependency[];
}

export type BoardCard = Omit<BoardStoryRow, 'order' | 'authorisedAt' | 'epicId'> & {
  epicId: string | null;
  /** Blocking predecessors (`depends_on`). */
  dependsOn: string[];
  /** Related stories in either direction (`related_to`). */
  related: string[];
};

/** A swimlane of the board by epic (US-039, FR-096). */
export interface BoardLane {
  epicId: string | null;
  title: string;
  status: EpicStatus;
  progress: EpicProgress;
  /** Colour index of the epic tag (0–7); null for "No epic". */
  colour: number | null;
}

export interface Board {
  columns: { status: BoardStatus; cards: BoardCard[] }[];
  /** Lanes in lane order plus "No epic"; empty without epics. */
  lanes: BoardLane[];
  /** Queued stories in the order the Scheduler will consider them (US-043). */
  queue: string[];
  slots: { active: number; limit: number };
}

export type MoveOutcome = { ok: true } | { ok: false; reason: string };

export interface BoardServiceDeps {
  index: BoardIndex;
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
  now(): string;
  /** Called after a transition is persisted (→ Scheduler events). */
  onTransition(projectId: string, storyId: string, command: StoryCommand): void | Promise<void>;
  queueOrder?(projectId: string): string[];
  slots?(projectId: string): { active: number; limit: number };
  /** Epics in lane order with the stored epic-review outcome (US-039). */
  epics?(projectId: string): { id: string; title: string; laneOrder: number | null; reviewOutcome: string | null }[];
  /** The story branch was merged (FR-115). */
  merged?(projectId: string, storyId: string): boolean;
  /** Why AI actions are disabled (capability gating, US-013), or null. */
  aiDisabledReason?(): string | null;
}

const ORDER_STEP = 1024;

function sortColumn(rows: BoardStoryRow[]): BoardStoryRow[] {
  return [...rows].sort((a, b) => {
    if (a.order !== null && b.order !== null) return a.order - b.order || a.storyId.localeCompare(b.storyId);
    if (a.order !== null) return -1;
    if (b.order !== null) return 1;
    return a.storyId.localeCompare(b.storyId);
  });
}

const toCard = ({ order: _o, authorisedAt: _a, epicId, ...card }: BoardStoryRow, deps: readonly StoryDependency[]): BoardCard => ({
  ...card,
  epicId: epicId ?? null,
  dependsOn: deps.filter((d) => d.type === 'blocking' && d.from === card.storyId).map((d) => d.to),
  related: [
    ...new Set(
      deps
        .filter((d) => d.type === 'related' && (d.from === card.storyId || d.to === card.storyId))
        .map((d) => (d.from === card.storyId ? d.to : d.from)),
    ),
  ],
});

export class BoardService {
  /** Tail of each project's serialised moves. */
  private readonly moves = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: BoardServiceDeps) {}

  board(projectId: string): Board {
    const rows = this.deps.index.stories(projectId);
    const dependencies = this.deps.index.dependencies(projectId);
    return {
      columns: BOARD_STATUSES.map((status) => ({
        status,
        cards: sortColumn(rows.filter((r) => r.status === status)).map((r) => toCard(r, dependencies)),
      })),
      lanes: this.lanes(projectId, rows),
      queue: this.deps.queueOrder?.(projectId) ?? [],
      slots: this.deps.slots?.(projectId) ?? { active: 0, limit: 0 },
    };
  }

  private lanes(projectId: string, rows: readonly BoardStoryRow[]): BoardLane[] {
    const epics = this.deps.epics?.(projectId) ?? [];
    if (epics.length === 0) return [];
    // Colours follow the epic IDs, so an epic keeps its colour when lanes are reordered.
    const colourOf = new Map([...epics].sort((a, b) => a.id.localeCompare(b.id)).map((e, i) => [e.id, i % 8]));
    const lane = (epicId: string | null, title: string, reviewOutcome: string | null): BoardLane => {
      const stories = rows.filter((r) => (r.epicId ?? null) === epicId);
      const derived = deriveEpicStatus(
        stories.map((r) => ({ status: r.status, size: r.size, merged: this.deps.merged?.(projectId, r.storyId) ?? false })),
        reviewOutcome,
      );
      return { epicId, title, ...derived, colour: epicId ? colourOf.get(epicId)! : null };
    };
    const ordered = [...epics].sort((a, b) => (a.laneOrder ?? Infinity) - (b.laneOrder ?? Infinity) || a.id.localeCompare(b.id));
    return [...ordered.map((e) => lane(e.id, e.title, e.reviewOutcome)), lane(null, 'No epic', null)];
  }

  /**
   * Moves a card to `to`, placed before `beforeStoryId` (null/undefined = end of the column).
   * A move within the same column only reorders; other moves are human transitions validated by the domain.
   */
  async move(projectId: string, storyId: string, to: BoardStatus, beforeStoryId?: string | null): Promise<MoveOutcome> {
    // Read, check and write one move at a time per project: a repeated move (double click, keyboard type-ahead) must
    // see the first one's result instead of starting the story twice. The transition is announced outside the lock.
    const moved = await this.serial(projectId, async (): Promise<MoveOutcome & { command?: StoryCommand }> => {
      const rows = this.deps.index.stories(projectId);
      const story = rows.find((r) => r.storyId === storyId);
      if (!story) return { ok: false, reason: `Unknown story ${storyId}.` };
      if (story.status === to) {
        this.place(projectId, rows, story, to, beforeStoryId);
        return { ok: true };
      }
      const result = moveStory({ status: story.status, subState: story.subState, approval: story.approval }, to, 'human');
      if (!result.ok) return result;
      // Moving to In Progress starts an agent run: it needs the AI capability (ADR-018).
      const disabled = result.command === 'startImplementation' ? (this.deps.aiDisabledReason?.() ?? null) : null;
      if (disabled) return { ok: false, reason: disabled };
      const written = await this.writeStatus(projectId, storyId, result.state.status, result.state.subState);
      if (!written.ok) return written;
      // The authorisation is persisted before the Scheduler hears of it (crash-safe, service_design.md).
      if (result.command === 'startImplementation') this.deps.index.setAuthorisedAt(projectId, storyId, this.deps.now());
      this.place(projectId, rows, story, to, beforeStoryId);
      return { ok: true, command: result.command };
    });
    if (!moved.ok) return moved;
    if (moved.command) await this.deps.onTransition(projectId, storyId, moved.command);
    return { ok: true };
  }

  private serial<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.moves.get(projectId) ?? Promise.resolve();
    const next = previous.then(work, work);
    this.moves.set(
      projectId,
      next.catch(() => undefined),
    );
    return next;
  }

  /** *Re-check* of a blocked (conflict) story (US-043 AC-4, FR-067): back into the queue. */
  async recheck(projectId: string, storyId: string): Promise<MoveOutcome> {
    const story = this.deps.index.stories(projectId).find((r) => r.storyId === storyId);
    if (!story) return { ok: false, reason: `Unknown story ${storyId}.` };
    const result = applyStoryCommand(
      { status: story.status, subState: story.subState, approval: story.approval },
      'recheckConflict',
      'human',
    );
    if (!result.ok) return result;
    this.deps.index.setSubState(projectId, storyId, result.state.subState);
    await this.deps.onTransition(projectId, storyId, 'recheckConflict');
    return { ok: true };
  }

  /** Recovery of a failed or interrupted run (US-055, UC-023): retry, resume (session) or discard (→ Ready). */
  async runAction(projectId: string, storyId: string, action: 'retry' | 'resume' | 'discard'): Promise<MoveOutcome> {
    const story = this.deps.index.stories(projectId).find((r) => r.storyId === storyId);
    if (!story) return { ok: false, reason: `Unknown story ${storyId}.` };
    const command = ({ retry: 'retryRun', resume: 'resumeRun', discard: 'discardRun' } as const)[action];
    const result = applyStoryCommand({ status: story.status, subState: story.subState, approval: story.approval }, command, 'human');
    if (!result.ok) return result;
    // Retry and resume start an agent run: they need the AI capability (ADR-018).
    const disabled = action === 'discard' ? null : (this.deps.aiDisabledReason?.() ?? null);
    if (disabled) return { ok: false, reason: disabled };
    if (result.state.status !== story.status) {
      const written = await this.writeStatus(projectId, storyId, result.state.status, result.state.subState);
      if (!written.ok) return written;
    } else {
      this.deps.index.setSubState(projectId, storyId, result.state.subState);
    }
    await this.deps.onTransition(projectId, storyId, command);
    return { ok: true };
  }

  /** A system transition (e.g. a completed run moves the story to Review, FR-024); validated by the domain. */
  async system(projectId: string, storyId: string, command: StoryCommand): Promise<MoveOutcome> {
    const story = this.deps.index.stories(projectId).find((r) => r.storyId === storyId);
    if (!story) return { ok: false, reason: `Unknown story ${storyId}.` };
    const result = applyStoryCommand({ status: story.status, subState: story.subState, approval: story.approval }, command, 'system');
    if (!result.ok) return result;
    return this.writeStatus(projectId, storyId, result.state.status, result.state.subState);
  }

  /** Writes `status` to the story front-matter, re-indexes it and records the execution sub-state. */
  private async writeStatus(projectId: string, storyId: string, status: BoardStatus, subState: ExecSubState): Promise<MoveOutcome> {
    const path = this.deps.index.storyPath(projectId, storyId);
    if (!path) return { ok: false, reason: `The file of ${storyId} is not indexed.` };
    const files = this.deps.files(projectId);
    const file = await files.read(path);
    if (!file) return { ok: false, reason: `The file of ${storyId} no longer exists.` };
    await files.writeAtomic(
      path,
      editFrontMatter(file.content, (doc) => doc.set('status', status)),
      { expectedHash: file.hash },
    );
    await this.deps.reindex(projectId, path);
    this.deps.index.setSubState(projectId, storyId, subState);
    return { ok: true };
  }

  /** Gives the card a position between its new neighbours (fractional ordering, renumbering when needed). */
  private place(projectId: string, rows: BoardStoryRow[], story: BoardStoryRow, to: BoardStatus, beforeStoryId?: string | null): void {
    const column = sortColumn(rows.filter((r) => r.status === to && r.storyId !== story.storyId));
    let index = beforeStoryId ? column.findIndex((r) => r.storyId === beforeStoryId) : -1;
    if (index < 0) index = column.length;
    const positioned = [...column.slice(0, index), story, ...column.slice(index)];
    // Renumber the whole column when unordered cards precede the insertion point or no gap is left.
    const needsRenumber = positioned.slice(0, index + 1).some((r) => r !== story && r.order === null);
    const prev = index > 0 ? column[index - 1]!.order : null;
    const next = index < column.length ? column[index]!.order : null;
    if (!needsRenumber && (next === null || prev === null || next - prev > 1e-6)) {
      const order =
        prev === null && next === null
          ? ORDER_STEP
          : prev === null
            ? next! - ORDER_STEP
            : next === null
              ? prev + ORDER_STEP
              : (prev + next) / 2;
      this.deps.index.setOrder(projectId, story.storyId, order);
      return;
    }
    positioned.forEach((r, i) => this.deps.index.setOrder(projectId, r.storyId, (i + 1) * ORDER_STEP));
  }
}
