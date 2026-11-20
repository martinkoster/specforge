// SPDX-License-Identifier: Apache-2.0
// PlanService (US-102, US-103, UC-036, UC-041, FR-084, FR-098): implementation waves, critical path and the derived epic
// graph; *Start epic* / *Start wave* move the Ready stories to In Progress one by one — each a human authorisation; the
// Scheduler queues those with open blocking dependencies or beyond the concurrency limit.
import { epicDependencies, implementationPlan, type BoardStatus, type EpicDependency, type StoryDependency } from '@specforge/domain';

export interface PlanStoryRow {
  storyId: string;
  title: string;
  status: BoardStatus;
  epicId: string | null;
  size: string | null;
}

export interface PlanServiceDeps {
  stories(projectId: string): readonly PlanStoryRow[];
  dependencies(projectId: string): readonly StoryDependency[];
  /** Effective concurrency limit of the project. */
  limit(projectId: string): number;
  /** A human move to In Progress (BoardService). */
  move(projectId: string, storyId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export interface StoriesStartPreview {
  start: string[];
  skipped: { storyId: string; status: BoardStatus }[];
}

export interface StoriesStartResult {
  started: string[];
  failed: { storyId: string; reason: string }[];
  skipped: StoriesStartPreview['skipped'];
}

export interface PlanView {
  limit: number;
  waves: {
    index: number;
    size: number;
    stories: { id: string; title: string; status: BoardStatus; epicId: string | null; size: string | null }[];
  }[];
  criticalPath: string[];
  epicEdges: EpicDependency[];
}

export class PlanService {
  constructor(private readonly deps: PlanServiceDeps) {}

  plan(projectId: string): PlanView {
    const rows = this.deps.stories(projectId);
    const dependencies = this.deps.dependencies(projectId);
    const limit = this.deps.limit(projectId);
    const byId = new Map(rows.map((r) => [r.storyId, r]));
    const computed = implementationPlan(
      rows.map((r) => ({ id: r.storyId, size: r.size, status: r.status })),
      dependencies,
      limit,
    );
    return {
      limit,
      waves: computed.waves.map((w, index) => ({
        index,
        size: w.size,
        stories: w.stories.map((id) => {
          const r = byId.get(id)!;
          return { id, title: r.title, status: r.status, epicId: r.epicId, size: r.size };
        }),
      })),
      criticalPath: computed.criticalPath,
      epicEdges: epicDependencies(
        rows.map((r) => ({ id: r.storyId, epicId: r.epicId })),
        dependencies,
      ),
    };
  }

  /** US-102 AC-1: the Ready stories of the epic and the skipped ones (not Ready, not Done-and-gone). */
  epicPreview(projectId: string, epicId: string): StoriesStartPreview {
    return this.preview(this.deps.stories(projectId).filter((r) => r.epicId === epicId));
  }

  /** US-102 AC-2. */
  startEpic(projectId: string, epicId: string): Promise<StoriesStartResult> {
    return this.start(projectId, this.epicPreview(projectId, epicId));
  }

  /** US-103 AC-3: the Ready stories of wave `index` (0-based). */
  wavePreview(projectId: string, index: number): StoriesStartPreview {
    const wave = this.plan(projectId).waves[index];
    if (!wave) throw new Error(`There is no wave ${index + 1}.`);
    const rows = this.deps.stories(projectId);
    const ids = new Set(wave.stories.map((s) => s.id));
    return this.preview(rows.filter((r) => ids.has(r.storyId)));
  }

  startWave(projectId: string, index: number): Promise<StoriesStartResult> {
    return this.start(projectId, this.wavePreview(projectId, index));
  }

  private preview(rows: readonly PlanStoryRow[]): StoriesStartPreview {
    const sorted = [...rows].sort((a, b) => a.storyId.localeCompare(b.storyId));
    return {
      start: sorted.filter((r) => r.status === 'ready').map((r) => r.storyId),
      skipped: sorted.filter((r) => r.status !== 'ready').map((r) => ({ storyId: r.storyId, status: r.status })),
    };
  }

  /** Each move is its own human authorisation (FR-022); a refused move does not stop the others. */
  private async start(projectId: string, preview: StoriesStartPreview): Promise<StoriesStartResult> {
    const started: string[] = [];
    const failed: StoriesStartResult['failed'] = [];
    for (const storyId of preview.start) {
      const moved = await this.deps.move(projectId, storyId);
      if (moved.ok) started.push(storyId);
      else failed.push({ storyId, reason: moved.reason });
    }
    return { started, failed, skipped: preview.skipped };
  }
}
