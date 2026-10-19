// SPDX-License-Identifier: Apache-2.0
// Project settings (US-016, UC-026): instructions in .specforge/instructions.md, Git conventions, worktree folder,
// snapshot exclusions and the parallel-runs limit (fixed at 1 without Git).
import { DEFAULT_PROJECT_SETTINGS, effectiveConcurrency, validateProjectSettings, type ProjectSettings } from '@specforge/domain';
import { ArtifactConflictError } from '../specs/artifact-service.js';
import type { ArtifactFiles } from '../stories/dependency-service.js';

/** Settings stored per project (the base branch lives on the project record). */
export type StoredProjectSettings = Omit<ProjectSettings, 'baseBranch'>;

export interface ProjectSettingsStore {
  projectSettings(projectId: string): Partial<StoredProjectSettings> | undefined;
  setProjectSettings(projectId: string, settings: StoredProjectSettings): void;
}

export interface ProjectSettingsDeps {
  store: ProjectSettingsStore;
  projects: {
    get(projectId: string): Promise<{ workspacePath: string; vcsMode: 'git' | 'none'; baseBranch: string | null } | undefined>;
    setBaseBranch(projectId: string, branch: string): Promise<void>;
  };
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  branchExists(workspacePath: string, branch: string): Promise<boolean>;
  /** Short default under app data, e.g. `<appdata>/wt/<projectShortId>` (ADR-010: short paths on Windows). */
  defaultWorktreeRoot(projectId: string): string;
  /** The Scheduler re-evaluates the queue (`LimitChanged`). */
  onLimitChanged(projectId: string): void | Promise<void>;
}

export interface ProjectSettingsView {
  settings: ProjectSettings;
  vcsMode: 'git' | 'none';
  effectiveConcurrency: number;
  concurrencyNote: string | null;
  instructions: { content: string; hash: string | null };
}

export const INSTRUCTIONS_PATH = '.specforge/instructions.md';
const NON_GIT_NOTE = 'Projects without Git share one working copy, so only one run can be active at a time.';

export class ProjectSettingsService {
  constructor(private readonly deps: ProjectSettingsDeps) {}

  /** Effective concurrency limit, synchronous for the Scheduler's evaluation. */
  limit(projectId: string, vcsMode: 'git' | 'none'): number {
    return effectiveConcurrency(this.stored(projectId).concurrencyLimit, vcsMode);
  }

  async get(projectId: string): Promise<ProjectSettingsView> {
    const project = await this.require(projectId);
    const stored = this.stored(projectId);
    const file = await this.deps.files(projectId).read(INSTRUCTIONS_PATH);
    return {
      settings: { ...stored, baseBranch: project.baseBranch ?? '' },
      vcsMode: project.vcsMode,
      effectiveConcurrency: effectiveConcurrency(stored.concurrencyLimit, project.vcsMode),
      concurrencyNote: project.vcsMode === 'none' ? NON_GIT_NOTE : null,
      instructions: file ? { content: file.content, hash: file.hash } : { content: '', hash: null },
    };
  }

  async save(projectId: string, settings: ProjectSettings): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    const project = await this.require(projectId);
    const errors = validateProjectSettings(settings, project);
    if (errors.length === 0 && project.vcsMode === 'git' && !(await this.deps.branchExists(project.workspacePath, settings.baseBranch))) {
      errors.push(`The branch "${settings.baseBranch}" does not exist in this repository.`);
    }
    if (errors.length > 0) return { ok: false, errors };

    const previousLimit = this.stored(projectId).concurrencyLimit;
    const { baseBranch, ...stored } = settings;
    this.deps.store.setProjectSettings(projectId, stored);
    if (project.vcsMode === 'git' && baseBranch !== project.baseBranch) await this.deps.projects.setBaseBranch(projectId, baseBranch);
    if (stored.concurrencyLimit !== previousLimit) await this.deps.onLimitChanged(projectId);
    return { ok: true };
  }

  async saveInstructions(
    projectId: string,
    content: string,
    expectedHash: string | null,
  ): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
    try {
      return { ok: true, hash: await this.deps.files(projectId).writeAtomic(INSTRUCTIONS_PATH, content, { expectedHash }) };
    } catch (e) {
      if (e instanceof ArtifactConflictError) return { ok: false, error: e.message };
      throw e;
    }
  }

  private stored(projectId: string): StoredProjectSettings {
    return {
      ...DEFAULT_PROJECT_SETTINGS,
      worktreeRoot: this.deps.defaultWorktreeRoot(projectId),
      ...this.deps.store.projectSettings(projectId),
    };
  }

  private async require(projectId: string) {
    const project = await this.deps.projects.get(projectId);
    if (!project) throw new Error(`Unknown project ${projectId}.`);
    return project;
  }
}
