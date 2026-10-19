// SPDX-License-Identifier: Apache-2.0
// Run execution wiring (US-048): execution spaces (worktree per story run in git mode, snapshot + in place without Git)
// and the basic run prompt.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangedFileStat, ExecutionSpaces, LaunchRequest, PreparedSpace, RunPromptBuilder } from '@specforge/application';
import {
  DEFAULT_CONTEXT_BUDGET,
  INSTRUCTIONS_PATH,
  assembleContext,
  editFrontMatter,
  extractElementSection,
  type StoryInfo,
} from '@specforge/application';
import type { ExecutionSpaceManager } from '@specforge/git';
import type { SnapshotStore } from '@specforge/snapshot';
import type { ExecutionStore, IndexRepository } from '@specforge/sqlite';
import type { WorkspaceFiles } from '@specforge/workspace-fs';

export interface ProjectWorkspace {
  workspacePath: string;
  vcsMode: 'git' | 'none';
  baseBranch: string | null;
  files: WorkspaceFiles;
  reindex(path: string): Promise<unknown>;
}

export interface CoreExecutionSpacesDeps {
  workspace(projectId: string): Promise<ProjectWorkspace>;
  settings(projectId: string): { worktreeRoot: string; branchPattern: string; snapshotExclusions: string[] };
  index: IndexRepository;
  store: ExecutionStore;
  spaces: ExecutionSpaceManager;
  snapshots(projectId: string): SnapshotStore;
}

/** Prepares where a run works (ADR-010, ADR-011) and records it on the run and in the story front-matter. */
export class CoreExecutionSpaces implements ExecutionSpaces {
  constructor(private readonly deps: CoreExecutionSpacesDeps) {}

  async prepare(request: LaunchRequest): Promise<PreparedSpace> {
    const { deps } = this;
    const ws = await deps.workspace(request.projectId);
    const settings = deps.settings(request.projectId);

    if (ws.vcsMode === 'none') {
      const snapshot = await deps.snapshots(request.projectId).create(ws.workspacePath, { exclusions: settings.snapshotExclusions });
      deps.store.saveExecutionSpace(request.runId, {
        mode: 'in_place',
        branch: null,
        worktreePath: null,
        baseRef: null,
        stackedOn: [],
        snapshotId: snapshot.id,
      });
      return { kind: 'ready', cwd: ws.workspacePath, workspaceRoot: ws.workspacePath, nonGit: true };
    }

    if (!ws.baseBranch) throw new Error('No base branch is configured for this project (Settings → Project).');

    // US-055: resume (same agent session) and "reuse branch" retries continue in the previous run's worktree; so do
    // corrections (US-059: same branch, resumed or fresh session).
    const previous = request.parentRunId ? deps.store.executionSpace(request.parentRunId) : undefined;
    const reuse =
      request.startKind === 'resume' ||
      request.startKind === 'correct' ||
      (request.startKind === 'retry' && deps.store.retryMode(request.projectId, request.storyId) === 'reuse');
    if (reuse && previous?.mode === 'worktree' && previous.branch) {
      if (previous.worktreePath && existsSync(previous.worktreePath)) {
        deps.store.saveExecutionSpace(request.runId, { ...previous });
        return { kind: 'ready', cwd: previous.worktreePath, workspaceRoot: previous.worktreePath, nonGit: false };
      }
      const reused = await deps.spaces.prepare({
        repo: ws.workspacePath,
        storyId: request.storyId,
        baseBranch: ws.baseBranch,
        worktreeRoot: settings.worktreeRoot,
        predecessors: [],
        reuseBranch: previous.branch,
      });
      if (reused.kind === 'ready') {
        deps.store.saveExecutionSpace(request.runId, {
          mode: 'worktree',
          branch: reused.branch,
          worktreePath: reused.worktreePath,
          baseRef: reused.baseRef,
          stackedOn: [],
        });
        return { kind: 'ready', cwd: reused.worktreePath, workspaceRoot: reused.worktreePath, nonGit: false };
      }
    }
    const status = new Map(deps.index.stories(request.projectId).map((s) => [s.storyId, s.status]));
    const predecessors = deps.index
      .dependencies(request.projectId)
      // Merged predecessors are part of the base branch already (US-024 AC-3).
      .filter(
        (d) =>
          d.from === request.storyId &&
          d.type === 'blocking' &&
          status.get(d.to) === 'done' &&
          deps.index.mergedAt(request.projectId, d.to) === null,
      )
      .map((d) => deps.index.storyBranch(request.projectId, d.to))
      .filter((b): b is string => b !== null);
    const result = await deps.spaces.prepare({
      repo: ws.workspacePath,
      storyId: request.storyId,
      baseBranch: ws.baseBranch,
      worktreeRoot: settings.worktreeRoot,
      predecessors,
      branchPattern: settings.branchPattern,
    });
    if (result.kind === 'blocked_conflict')
      return { kind: 'blocked_conflict', files: result.files, message: result.pendingDecision.message };

    deps.store.saveExecutionSpace(request.runId, {
      mode: 'worktree',
      branch: result.branch,
      worktreePath: result.worktreePath,
      baseRef: result.baseRef,
      stackedOn: result.stackedOn,
    });
    await this.recordBranch(ws, request, result.branch);
    return { kind: 'ready', cwd: result.worktreePath, workspaceRoot: result.worktreePath, nonGit: false };
  }

  async changes(request: LaunchRequest): Promise<ChangedFileStat[]> {
    const space = this.deps.store.executionSpace(request.runId);
    if (!space) return [];
    if (space.mode === 'worktree' && space.worktreePath && space.baseRef)
      return this.deps.spaces.worktreeChanges(space.worktreePath, space.baseRef);
    if (space.mode === 'in_place' && space.snapshotId) {
      const ws = await this.deps.workspace(request.projectId);
      const changes = await this.deps.snapshots(request.projectId).diff(space.snapshotId, ws.workspacePath);
      return changes.map((c) => ({ path: c.path, change: c.change, ...statsFromPatch(c.patch) }));
    }
    return [];
  }

  /** `branch:` is set in the story front-matter when a run starts (data_model.md §1.3). */
  private async recordBranch(ws: ProjectWorkspace, request: LaunchRequest, branch: string): Promise<void> {
    const path = this.deps.index.storyPath(request.projectId, request.storyId);
    if (!path) return;
    const file = await ws.files.read(path);
    if (!file) return;
    await ws.files.writeAtomic(
      path,
      editFrontMatter(file.content, (doc) => doc.set('branch', branch)),
      { expectedHash: file.hash },
    );
    await ws.reindex(path);
  }
}

/** Collects the inputs of the ContextAssembler (US-050) and stores the assembled context on the run (FR-037). */
export class ContextPromptBuilder implements RunPromptBuilder {
  constructor(
    private readonly workspace: (projectId: string) => Promise<ProjectWorkspace>,
    private readonly index: IndexRepository,
    private readonly store: ExecutionStore,
    private readonly budget = DEFAULT_CONTEXT_BUDGET,
  ) {}

  async build(request: LaunchRequest): Promise<{ prompt: string; systemAppend: string }> {
    const { projectId, storyId } = request;
    const ws = await this.workspace(projectId);
    const read = async (path: string) => (await ws.files.read(path))?.content ?? '';
    const stories = new Map(this.index.stories(projectId).map((s) => [s.storyId, s]));
    const info = (id: string): StoryInfo => ({
      id,
      title: stories.get(id)?.title ?? id,
      status: stories.get(id)?.status ?? 'backlog',
      summary: this.store.latestSummary(projectId, id),
      changedFiles: this.store.touchedFiles(projectId, id),
    });

    const storyPath = this.index.storyPath(projectId, storyId);
    const epicId = this.index.storyEpicId(projectId, storyId);
    const linked = [];
    for (const target of this.index.linkTargets(projectId, storyId)) {
      const element = this.index.element(projectId, target);
      if (!element || element.type === 'story' || element.type === 'epic') continue;
      linked.push({
        id: target,
        title: element.title,
        path: element.artifactPath,
        text: extractElementSection(await read(element.artifactPath), target),
      });
    }
    const epicElement = epicId ? this.index.element(projectId, epicId) : undefined;
    const epic = epicId
      ? {
          id: epicId,
          title: epicElement?.title ?? epicId,
          goal: epicElement ? sectionText(await read(epicElement.artifactPath), 'Goal') : null,
          siblings: this.index.epicStoryIds(projectId, epicId).map(info),
        }
      : null;
    const predecessors = this.index
      .dependencies(projectId)
      .filter((d) => d.from === storyId && d.type === 'blocking')
      .map((d) => info(d.to));
    const instructions = (await read(INSTRUCTIONS_PATH)).trim() || null;
    // US-059: review feedback; a fresh agent session also gets the summary of the run being corrected.
    const correction = request.startKind === 'correct' ? this.store.correction(projectId, storyId) : undefined;
    const previousSummary = correction?.fresh ? this.store.latestSummary(projectId, storyId) : null;

    const assembled = assembleContext({
      story: { id: storyId, title: stories.get(storyId)?.title ?? storyId, content: storyPath ? await read(storyPath) : '' },
      startKind: request.startKind,
      ...(correction ? { feedback: correction.feedback } : {}),
      ...(previousSummary ? { previousSummary } : {}),
      instructions,
      linked,
      epic,
      predecessors,
      concurrent: this.store
        .activeStories(projectId, storyId)
        .map((id) => ({ id, title: stories.get(id)?.title ?? id, touchedFiles: this.store.touchedFiles(projectId, id) })),
      budget: this.budget,
    });
    this.store.setContextDigest(request.runId, [assembled.prompt, '', '--- System prompt appendix ---', assembled.systemAppend].join('\n'));
    return { prompt: assembled.prompt, systemAppend: assembled.systemAppend };
  }
}

/** Text of a `## <name>` section. */
function sectionText(markdown: string, name: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${name.toLowerCase()}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  const text = lines
    .slice(start + 1, end < 0 ? lines.length : end)
    .join('\n')
    .trim();
  return text || null;
}

/** Additions and deletions of a unified diff (file headers excluded). */
export function statsFromPatch(patch: string | undefined): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of (patch ?? '').split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

export const snapshotRoot = (appDataDir: string, projectId: string): string => join(appDataDir, 'snapshots', projectId);
