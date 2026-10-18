// SPDX-License-Identifier: Apache-2.0
// The open project's workspace services: files, indexer, external-change reconciliation and watcher (US-019, US-021).
import {
  ExternalChangeReconciler,
  SelfWriteRegistry,
  StoryDependencyService,
  WorkspaceIndexer,
  type ReconcileEvent,
} from '@specforge/application';
import { IpcError } from '@specforge/ipc-contract';
import type { IndexRepository } from '@specforge/sqlite';
import { WorkspaceFiles, watchWorkspace, type WorkspaceWatcher } from '@specforge/workspace-fs';

export interface ProjectContext {
  projectId: string;
  root: string;
  files: WorkspaceFiles;
  indexer: WorkspaceIndexer;
  dependencies: StoryDependencyService;
}

interface Active extends ProjectContext {
  watcher: WorkspaceWatcher | undefined;
  running: Set<Promise<void>>;
}

export interface ProjectContextsOptions {
  index: IndexRepository;
  /** Watch the workspace for external edits (off in unit tests that do not need it). */
  watch: boolean;
  onReconcile?(projectId: string, event: ReconcileEvent): void;
  /** External changes were indexed (→ dashboard read model, US-060). */
  onIndexed?(projectId: string): void;
}

/** Exactly one project is open at a time; only the open project is watched and indexed (service_design.md). */
export class ProjectContexts {
  private active: Active | undefined;

  constructor(private readonly options: ProjectContextsOptions) {}

  get current(): ProjectContext | undefined {
    return this.active;
  }

  async activate(projectId: string, root: string): Promise<ProjectContext> {
    await this.close();
    const selfWrites = new SelfWriteRegistry();
    const files = new WorkspaceFiles(root, { onWrite: (path, hash) => selfWrites.register(path, hash) });
    const indexer = new WorkspaceIndexer(files, this.options.index);
    await indexer.indexAll(projectId);
    const running = new Set<Promise<void>>();
    const context: Active = {
      projectId,
      root,
      files,
      indexer,
      dependencies: new StoryDependencyService(files, this.options.index, indexer),
      watcher: undefined,
      running,
    };
    if (this.options.watch) {
      const reconciler = new ExternalChangeReconciler(files, indexer, this.options.index, selfWrites, (event) =>
        this.options.onReconcile?.(projectId, event),
      );
      context.watcher = await watchWorkspace(root, {}, (paths) => {
        const job = reconciler
          .handle(projectId, paths)
          .then(() => this.options.onIndexed?.(projectId))
          .finally(() => running.delete(job));
        running.add(job);
      });
    }
    this.active = context;
    return context;
  }

  /** The open project, which must be `projectId`. */
  require(projectId: string): ProjectContext {
    if (this.active?.projectId !== projectId) throw new IpcError('PROJECT_NOT_OPEN', `Project ${projectId} is not open.`);
    return this.active;
  }

  async close(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    if (!active) return;
    await active.watcher?.close();
    await Promise.allSettled([...active.running]);
  }
}
