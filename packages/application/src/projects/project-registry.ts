// SPDX-License-Identifier: Apache-2.0
// Project registry for the start wizard and the Projects area (US-017, UC-003, UC-029).
import { currentPhase, phaseLabel, type PhaseInputs, type PhaseStatus, type SpecPhase } from '@specforge/domain';

export interface ProjectRecord {
  id: string;
  name: string;
  workspacePath: string;
  lastOpenedAt: string | null;
}

/** Registered projects (database). Removing unlinks the project; workspace files are never touched. */
export interface ProjectRecords {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | undefined>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  relocate(id: string, workspacePath: string): Promise<void>;
}

export interface ProjectFolders {
  exists(path: string): Promise<boolean>;
  /** True if the folder contains `.specforge/project.yaml`. */
  hasDescriptor(path: string): Promise<boolean>;
}

export interface ProjectActivity {
  activeRuns(projectId: string): Promise<number>;
  phaseInputs(projectId: string): Promise<PhaseInputs>;
  generatingPhases(projectId: string): Promise<SpecPhase[]>;
}

export interface RecentProject {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string | null;
  phase: PhaseStatus | null;
  phaseLabel: string | null;
  missing: boolean;
}

export type ProjectRegistryErrorCode =
  'NOT_FOUND' | 'INVALID_NAME' | 'INVALID_FOLDER' | 'FOLDER_NOT_EMPTY' | 'RUNS_ACTIVE' | 'FOLDER_MISSING' | 'NOT_A_PROJECT';

export class ProjectRegistryError extends Error {
  constructor(
    readonly code: ProjectRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectRegistryError';
  }
}

export class ProjectRegistry {
  constructor(
    private readonly records: ProjectRecords,
    private readonly folders: ProjectFolders,
    private readonly activity: ProjectActivity,
  ) {}

  /** Recent projects, most recently opened first; never-opened projects last. */
  async recent(): Promise<RecentProject[]> {
    const projects = [...(await this.records.list())].sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''));
    return Promise.all(
      projects.map(async (p) => {
        const missing = !(await this.folders.exists(p.workspacePath));
        const phase = missing ? null : currentPhase(await this.activity.phaseInputs(p.id), await this.activity.generatingPhases(p.id));
        return {
          id: p.id,
          name: p.name,
          path: p.workspacePath,
          lastOpenedAt: p.lastOpenedAt,
          phase,
          phaseLabel: phase ? phaseLabel(phase) : null,
          missing,
        };
      }),
    );
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === '') throw new ProjectRegistryError('INVALID_NAME', 'The project name must not be empty.');
    await this.require(id);
    await this.records.rename(id, trimmed);
  }

  async remove(id: string): Promise<void> {
    const project = await this.require(id);
    const runs = await this.activity.activeRuns(id);
    if (runs > 0) {
      throw new ProjectRegistryError(
        'RUNS_ACTIVE',
        `${project.name} has ${runs} active ${runs === 1 ? 'run' : 'runs'}. Cancel them before removing the project.`,
      );
    }
    await this.records.remove(id);
  }

  /** Points a project whose folder moved to its new location. */
  async locate(id: string, path: string): Promise<void> {
    await this.require(id);
    if (!(await this.folders.exists(path))) throw new ProjectRegistryError('FOLDER_MISSING', `The folder ${path} does not exist.`);
    if (!(await this.folders.hasDescriptor(path))) {
      throw new ProjectRegistryError('NOT_A_PROJECT', `The folder ${path} is not a SpecForge project (no .specforge/project.yaml).`);
    }
    await this.records.relocate(id, path);
  }

  private async require(id: string): Promise<ProjectRecord> {
    const project = await this.records.get(id);
    if (!project) throw new ProjectRegistryError('NOT_FOUND', `Unknown project ${id}.`);
    return project;
  }
}
